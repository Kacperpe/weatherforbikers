import type { NextRequest } from "next/server";
import {
  parseGoogleMapsWaypoints,
  isGoogleMapsHost,
  isShortGoogleLink,
  type GoogleWaypoints,
} from "@/lib/google-maps-url";

// BRouter re-routing + optional geocoding can be slow; cap generously.
export const maxDuration = 25;

const USER_AGENT = "MapaPogodyRowerowanie/1.0 (route import)";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_WAYPOINTS = 25;

const BROUTER_URL = "https://brouter.de/brouter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function jsonError(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Short links (maps.app.goo.gl/…) carry no waypoints until resolved. Follow the
// redirect chain, but only ever fetch known Google hosts to avoid SSRF.
async function expandUrl(rawUrl: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!isGoogleMapsHost(url.hostname)) return null;
  if (!isShortGoogleLink(url.hostname)) return rawUrl;

  try {
    const res = await fetchWithTimeout(rawUrl, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
    });
    const finalUrl = res.url || rawUrl;
    const finalHost = new URL(finalUrl).hostname;
    return isGoogleMapsHost(finalHost) ? finalUrl : null;
  } catch {
    return null;
  }
}

type NominatimResult = { lat: string; lon: string };

async function geocode(name: string): Promise<[number, number] | null> {
  const params = new URLSearchParams({ q: name, format: "json", limit: "1" });
  try {
    const res = await fetchWithTimeout(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResult[];
    if (!data.length) return null;
    const lat = Number(data[0].lat);
    const lon = Number(data[0].lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null;
  } catch {
    return null;
  }
}

async function resolveCoords(waypoints: GoogleWaypoints): Promise<[number, number][] | null> {
  if (waypoints.kind === "coords") return waypoints.coords;
  // Geocode named places sequentially — Nominatim asks for ≤1 req/s.
  const coords: [number, number][] = [];
  for (const name of waypoints.names) {
    const coord = await geocode(name);
    if (!coord) return null;
    coords.push(coord);
  }
  return coords.length >= 2 ? coords : null;
}

type BRouterGeoJson = {
  type: "FeatureCollection";
  features: { geometry?: { type: string; coordinates: unknown } }[];
};

async function routeWithBRouter(coords: [number, number][]): Promise<string | null> {
  const lonlats = coords.map(([lon, lat]) => `${lon},${lat}`).join("|");
  const params = new URLSearchParams({
    lonlats,
    profile: "trekking",
    alternativeidx: "0",
    format: "geojson",
  });
  try {
    const res = await fetchWithTimeout(`${BROUTER_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BRouterGeoJson;
    const hasLine = data?.features?.some((f) => f.geometry?.type === "LineString");
    return hasLine ? JSON.stringify(data) : null;
  } catch {
    return null;
  }
}

// Fallback when BRouter is unreachable: connect waypoints with straight lines so
// the user still gets a usable (if approximate) route.
function straightLineGeoJson(coords: [number, number][]): string {
  return JSON.stringify({
    type: "Feature",
    properties: { approximate: true },
    geometry: { type: "LineString", coordinates: coords },
  });
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) return jsonError("Brak parametru url.", 400);

  const expanded = await expandUrl(rawUrl.trim());
  if (!expanded) {
    return jsonError("To nie jest prawidłowy link do Google Maps.", 400);
  }

  const waypoints = parseGoogleMapsWaypoints(expanded);
  if (!waypoints) {
    return jsonError(
      "Nie znaleziono trasy w linku. Udostępnij trasę z widoku „Wyznacz trasę” (Dojazd) w Google Maps.",
      422,
    );
  }

  const coords = await resolveCoords(waypoints);
  if (!coords || coords.length < 2) {
    return jsonError("Nie udało się ustalić punktów trasy z linku.", 422);
  }
  if (coords.length > MAX_WAYPOINTS) {
    return jsonError(`Trasa ma zbyt wiele punktów pośrednich (limit: ${MAX_WAYPOINTS}).`, 422);
  }

  const routed = await routeWithBRouter(coords);
  if (routed) {
    return Response.json({ ok: true, geojson: routed });
  }
  // BRouter down — degrade to straight lines rather than failing outright.
  return Response.json({ ok: true, geojson: straightLineGeoJson(coords), approximate: true });
}
