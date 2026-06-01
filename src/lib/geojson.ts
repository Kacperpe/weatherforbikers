import type { RouteSegment } from "@/types/route-segment";
import { MAX_ROUTE_INPUT_POINTS, MAX_ROUTE_RENDER_POINTS } from "@/lib/route-limits";

type Coordinates = [number, number];

function haversineKm(a: Coordinates, b: Coordinates) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function downsamplePoints(points: Coordinates[], target: number): Coordinates[] {
  if (points.length <= target) return points;
  const stride = (points.length - 1) / (target - 1);
  const out: Coordinates[] = [points[0]];
  for (let i = 1; i < target - 1; i += 1) {
    out.push(points[Math.round(i * stride)]);
  }
  out.push(points[points.length - 1]);
  return out;
}

export function toSegments(points: Coordinates[], averageSpeedKmh: number) {
  if (averageSpeedKmh <= 0) throw new Error("Predkosc musi byc wieksza od 0.");
  if (points.length > MAX_ROUTE_INPUT_POINTS) {
    throw new Error(`Trasa ma zbyt wiele punktow (${points.length}). Limit: ${MAX_ROUTE_INPUT_POINTS}.`);
  }

  const deduped: Coordinates[] = points.length > 0 ? [points[0]] : [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = deduped[deduped.length - 1];
    if (points[i][0] !== prev[0] || points[i][1] !== prev[1]) deduped.push(points[i]);
  }

  const simplified = deduped.length > MAX_ROUTE_RENDER_POINTS
    ? downsamplePoints(deduped, MAX_ROUTE_RENDER_POINTS)
    : deduped;

  const segments: RouteSegment[] = [];
  let totalMinutes = 0;
  let totalDistanceKm = 0;

  for (let i = 0; i < simplified.length - 1; i += 1) {
    const from = simplified[i];
    const to = simplified[i + 1];
    const distanceKm = Number(haversineKm(from, to).toFixed(2));
    const segmentMinutes = (distanceKm / averageSpeedKmh) * 60;
    totalMinutes += segmentMinutes;
    totalDistanceKm += distanceKm;

    segments.push({
      id: `S-${String(i + 1).padStart(3, "0")}`,
      from,
      to,
      distanceKm,
      cumulativeDistanceKm: Number(totalDistanceKm.toFixed(1)),
      etaMinutesFromStart: Math.round(totalMinutes),
    });
  }

  return segments;
}

type GeoJsonGeometry =
  | { type: "LineString"; coordinates: Coordinates[] }
  | { type: "MultiLineString"; coordinates: Coordinates[][] };

type GeoJsonFeature = { type: "Feature"; geometry?: GeoJsonGeometry };

type GeoJsonDoc =
  | GeoJsonGeometry
  | GeoJsonFeature
  | { type: "FeatureCollection"; features?: GeoJsonFeature[] };

function extractCoordinates(data: GeoJsonDoc): Coordinates[] | null {
  if (data.type === "LineString") return data.coordinates;
  if (data.type === "MultiLineString") {
    const longest = data.coordinates.reduce(
      (best, line) => (line.length > best.length ? line : best),
      [] as Coordinates[],
    );
    return longest.length >= 2 ? longest : null;
  }
  if (data.type === "Feature") {
    if (!data.geometry) return null;
    return extractCoordinates(data.geometry);
  }
  if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
    for (const f of data.features) {
      const coords = extractCoordinates(f);
      if (coords && coords.length >= 2) return coords;
    }
  }
  return null;
}

export function parseRouteGeoJson(raw: string, averageSpeedKmh: number) {
  let data: GeoJsonDoc;
  try {
    data = JSON.parse(raw) as GeoJsonDoc;
  } catch {
    throw new Error("Niepoprawny format JSON.");
  }
  const coords = extractCoordinates(data);
  if (!coords || coords.length < 2) {
    throw new Error("Niepoprawny GeoJSON: oczekiwany przebieg trasy.");
  }
  return toSegments(coords, averageSpeedKmh);
}
