import type { RouteSegment } from "@/types/route-segment";
import { toSegments } from "@/lib/geojson";

export function parseRouteGpx(raw: string, averageSpeedKmh: number): RouteSegment[] {
  const doc = new DOMParser().parseFromString(raw, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("Niepoprawny plik GPX.");

  const trkpts = Array.from(doc.querySelectorAll("trkpt"));
  const rtepts = trkpts.length < 2 ? Array.from(doc.querySelectorAll("rtept")) : [];
  const pts = trkpts.length >= 2 ? trkpts : rtepts;
  if (pts.length < 2) {
    const hasRte = doc.querySelectorAll("rtept").length > 0;
    if (hasRte) throw new Error("GPX zawiera trasę (rtept), nie ślad (trkpt). W aplikacji eksportuj jako 'ślad GPS', nie jako 'trasę'.");
    throw new Error("GPX nie zawiera punktów trasy (trkpt). Upewnij się, że plik zawiera zarejestrowany ślad.");
  }

  const coords: [number, number][] = pts.map((pt) => {
    const lat = parseFloat(pt.getAttribute("lat") ?? "");
    const lon = parseFloat(pt.getAttribute("lon") ?? "");
    if (isNaN(lat) || isNaN(lon)) throw new Error("Niepoprawne współrzędne w GPX.");
    return [lon, lat];
  });

  return toSegments(coords, averageSpeedKmh);
}
