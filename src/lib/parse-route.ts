import type { RouteSegment } from "@/types/route-segment";
import { parseRouteGeoJson } from "@/lib/geojson";
import { parseRouteGpx } from "@/lib/gpx";
import { parseRouteKml, parseRouteKmz } from "@/lib/kml";
import { parseRouteTcx } from "@/lib/tcx";
import { parseRouteCsv } from "@/lib/csv";
import { assertUploadSize } from "@/lib/route-limits";

export async function parseRouteFile(file: File, speedKmh: number): Promise<RouteSegment[]> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  assertUploadSize(file, ext);
  switch (ext) {
    case "geojson":
    case "json":
      return parseRouteGeoJson(await file.text(), speedKmh);
    case "gpx":
      return parseRouteGpx(await file.text(), speedKmh);
    case "kml":
      return parseRouteKml(await file.text(), speedKmh);
    case "kmz":
      return parseRouteKmz(await file.arrayBuffer(), speedKmh);
    case "tcx":
      return parseRouteTcx(await file.text(), speedKmh);
    case "csv":
      return parseRouteCsv(await file.text(), speedKmh);
    default:
      throw new Error(`Nieobsługiwany format pliku: .${ext}. Obsługiwane: GPX, GeoJSON, KML, KMZ, TCX, CSV.`);
  }
}
