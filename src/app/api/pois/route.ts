import type { NextRequest } from "next/server";
import type { Poi, PoiCategory } from "@/types/poi";

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const poiCache = new Map<string, { pois: Poi[]; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX = 100;

const MAX_BBOX_DELTA = 1.0;
const MAX_BBOX_AREA = 0.5;
const FETCH_TIMEOUT_MS = 8_000;

function cacheSet(key: string, value: { pois: Poi[]; ts: number }) {
  if (poiCache.size >= CACHE_MAX) poiCache.delete(poiCache.keys().next().value!);
  poiCache.set(key, value);
}

type OverpassElement = {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

function classifyCategory(tags: Record<string, string>): PoiCategory | null {
  const amenity = tags.amenity ?? "";
  const tourism = tags.tourism ?? "";
  const shop = tags.shop ?? "";

  if (["restaurant", "cafe", "bar", "pub", "fast_food", "food_court", "biergarten"].includes(amenity)) return "restaurant";
  if (["hotel", "hostel", "guest_house", "motel", "apartment"].includes(tourism)) return "accommodation";
  if (amenity === "toilets") return "toilet";
  if (tourism === "camp_site") return "campsite";
  if (["attraction", "viewpoint", "museum", "gallery"].includes(tourism)) return "attraction";
  if (["supermarket", "convenience", "grocery", "general"].includes(shop)) return "shop";
  if (amenity === "drinking_water") return "water";
  return null;
}

function buildQuery(bbox: string): string {
  return `
[out:json][timeout:15];
(
  node["amenity"="restaurant"](${bbox});
  node["amenity"="cafe"](${bbox});
  node["amenity"="bar"](${bbox});
  node["amenity"="pub"](${bbox});
  node["amenity"="fast_food"](${bbox});
  node["amenity"="toilets"](${bbox});
  node["amenity"="drinking_water"](${bbox});
  node["tourism"="hotel"](${bbox});
  node["tourism"="hostel"](${bbox});
  node["tourism"="guest_house"](${bbox});
  node["tourism"="motel"](${bbox});
  node["tourism"="camp_site"](${bbox});
  node["tourism"="attraction"](${bbox});
  node["tourism"="viewpoint"](${bbox});
  node["tourism"="museum"](${bbox});
  node["shop"="supermarket"](${bbox});
  node["shop"="convenience"](${bbox});
);
out body 800;
`.trim();
}

async function fetchOverpass(query: string): Promise<{ elements: OverpassElement[] }> {
  let lastError = "unknown";
  for (let i = 0; i < OVERPASS_URLS.length; i += 1) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200));
    const url = OVERPASS_URLS[i];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "MapaPogodyRowerowanie/1.0",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      return (await res.json()) as { elements: OverpassElement[] };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError);
}

function roundBbox(minLat: string, minLon: string, maxLat: string, maxLon: string): string {
  const r = (v: string) => Math.round(parseFloat(v) * 100) / 100;
  return `${r(minLat)},${r(minLon)},${r(maxLat)},${r(maxLon)}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const minLat = searchParams.get("minLat");
  const minLon = searchParams.get("minLon");
  const maxLat = searchParams.get("maxLat");
  const maxLon = searchParams.get("maxLon");
  if (!minLat || !minLon || !maxLat || !maxLon) {
    return Response.json({ ok: false, error: "Brak parametrow bbox." }, { status: 400 });
  }

  const minLatN = parseFloat(minLat);
  const minLonN = parseFloat(minLon);
  const maxLatN = parseFloat(maxLat);
  const maxLonN = parseFloat(maxLon);
  if (
    !Number.isFinite(minLatN) || !Number.isFinite(minLonN) ||
    !Number.isFinite(maxLatN) || !Number.isFinite(maxLonN) ||
    minLatN < -90 || maxLatN > 90 || minLonN < -180 || maxLonN > 180 ||
    minLatN >= maxLatN || minLonN >= maxLonN
  ) {
    return Response.json({ ok: false, error: "Nieprawidlowe wspolrzedne bbox." }, { status: 400 });
  }

  const latDelta = maxLatN - minLatN;
  const lonDelta = maxLonN - minLonN;
  if (latDelta > MAX_BBOX_DELTA || lonDelta > MAX_BBOX_DELTA || latDelta * lonDelta > MAX_BBOX_AREA) {
    return Response.json({ ok: false, error: "Obszar bbox jest zbyt duzy." }, { status: 400 });
  }

  const cacheKey = roundBbox(minLat, minLon, maxLat, maxLon);
  const cached = poiCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return Response.json({ ok: true, pois: cached.pois, cached: true }, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  try {
    const data = await fetchOverpass(buildQuery(cacheKey));
    const elements = data.elements ?? [];
    const pois: Poi[] = [];
    for (const el of elements) {
      if (el.type !== "node" || el.lat == null || el.lon == null || !el.tags) continue;
      const category = classifyCategory(el.tags);
      if (!category) continue;
      pois.push({ id: el.id, lat: el.lat, lon: el.lon, category, name: el.tags.name });
    }

    cacheSet(cacheKey, { pois, ts: Date.now() });
    return Response.json({ ok: true, pois }, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    console.error("POI fetch failed:", err);
    return Response.json(
      { ok: false, error: "Nie udalo sie pobrac POI. Sprobuj ponownie pozniej." },
      { status: 502 },
    );
  }
}
