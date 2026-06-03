import type { RouteSegment } from "@/types/route-segment";
import { toSegments } from "@/lib/geojson";

type Coord = [number, number];

const LAT_KEYS = new Set(["lat", "latitude", "szerokosc", "szerokość"]);
const LON_KEYS = new Set(["lon", "lng", "longitude", "dlugosc", "długość"]);

function detectSep(line: string): string {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  if (line.includes("|")) return "|";
  return ",";
}

function toNum(s: string): number {
  return parseFloat((s ?? "").replace(",", ".").trim());
}

export function parseRouteCsv(raw: string, speedKmh: number): RouteSegment[] {
  const lines = raw.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 3) throw new Error("CSV zawiera za mało wierszy.");

  const sep = detectSep(lines[0]);
  const headers = lines[0].split(sep).map((h) => h.toLowerCase().trim().replace(/^"|"$/g, ""));

  const latIdx = headers.findIndex((h) => LAT_KEYS.has(h));
  const lonIdx = headers.findIndex((h) => LON_KEYS.has(h));

  if (latIdx === -1 || lonIdx === -1) {
    throw new Error(
      "Nie znaleziono kolumn lat/lon w CSV. Wymagane nagłówki: lat, lon (lub latitude, longitude).",
    );
  }

  if (sep === ",") {
    const firstDataCols = lines[1].split(",").length;
    if (firstDataCols > headers.length) {
      throw new Error(
        "CSV używa przecinka zarówno jako separatora kolumn, jak i separatora dziesiętnego — nie można bezpiecznie rozdzielić danych. " +
        "Wyeksportuj plik ponownie używając średnika (;) jako separatora kolumn.",
      );
    }
  }

  const coords: Coord[] = lines
    .slice(1)
    .map((line) => {
      const cols = line.split(sep);
      const lat = toNum(cols[latIdx] ?? "");
      const lon = toNum(cols[lonIdx] ?? "");
      return [lon, lat] as Coord;
    })
    .filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));

  if (coords.length < 2) throw new Error("CSV nie zawiera wystarczającej liczby punktów trasy.");
  return toSegments(coords, speedKmh);
}
