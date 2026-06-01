import type { RouteSegment } from "@/types/route-segment";
import { toSegments } from "@/lib/geojson";

type Coord = [number, number];

export function parseRouteTcx(raw: string, speedKmh: number): RouteSegment[] {
  const doc = new DOMParser().parseFromString(raw, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Niepoprawny plik TCX.");

  const allTrackpoints = Array.from(doc.querySelectorAll("Trackpoint"));
  const coords: Coord[] = allTrackpoints
    .map((tp) => {
      const lat = parseFloat(tp.querySelector("LatitudeDegrees")?.textContent ?? "");
      const lon = parseFloat(tp.querySelector("LongitudeDegrees")?.textContent ?? "");
      return [lon, lat] as Coord;
    })
    .filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));

  if (coords.length < 2) {
    if (allTrackpoints.length > 0) {
      throw new Error(
        "Ten plik TCX nie zawiera danych GPS. Upewnij się, że aktywność była zarejestrowana na zewnątrz z włączonym GPS.",
      );
    }
    throw new Error("TCX nie zawiera wystarczającej liczby punktów trasy.");
  }
  return toSegments(coords, speedKmh);
}
