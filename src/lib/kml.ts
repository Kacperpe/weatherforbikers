import { unzipSync } from "fflate";
import type { RouteSegment } from "@/types/route-segment";
import { toSegments } from "@/lib/geojson";
import {
  MAX_KMZ_ENTRIES,
  MAX_KMZ_SINGLE_KML_BYTES,
  MAX_KMZ_TOTAL_UNZIPPED_BYTES,
} from "@/lib/route-limits";

type Coord = [number, number];

function parseKmlCoordinates(text: string): Coord[] {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [lonStr, latStr] = token.split(",");
      const lon = parseFloat(lonStr ?? "");
      const lat = parseFloat(latStr ?? "");
      return [lon, lat] as Coord;
    })
    .filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));
}

function extractCoords(doc: Document): Coord[] {
  for (const el of doc.querySelectorAll("LineString > coordinates, LineString coordinates")) {
    const coords = parseKmlCoordinates(el.textContent ?? "");
    if (coords.length >= 2) return coords;
  }

  const gxNs = "http://www.google.com/kml/ext/2.2";
  const gxCoords = Array.from(doc.getElementsByTagNameNS(gxNs, "coord"));
  if (gxCoords.length >= 2) {
    return gxCoords
      .map((el) => {
        const parts = (el.textContent ?? "").trim().split(/\s+/);
        return [parseFloat(parts[0] ?? ""), parseFloat(parts[1] ?? "")] as Coord;
      })
      .filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));
  }

  const points = Array.from(doc.querySelectorAll("Point > coordinates"));
  if (points.length >= 2) {
    return points.flatMap((el) => parseKmlCoordinates(el.textContent ?? ""));
  }

  return [];
}

function fromKmlText(text: string, speedKmh: number): RouteSegment[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Niepoprawny plik KML.");
  const coords = extractCoords(doc);
  if (coords.length < 2) throw new Error("KML nie zawiera wystarczajacej liczby punktow trasy.");
  return toSegments(coords, speedKmh);
}

export function parseRouteKml(text: string, speedKmh: number): RouteSegment[] {
  return fromKmlText(text, speedKmh);
}

export function parseRouteKmz(buffer: ArrayBuffer, speedKmh: number): RouteSegment[] {
  const unzipped = unzipSync(new Uint8Array(buffer));
  const keys = Object.keys(unzipped);
  if (keys.length === 0) throw new Error("KMZ jest pusty.");
  if (keys.length > MAX_KMZ_ENTRIES) {
    throw new Error(`KMZ zawiera zbyt wiele plikow. Limit: ${MAX_KMZ_ENTRIES}.`);
  }

  let totalUnzipped = 0;
  const kmlKeys: string[] = [];
  for (const key of keys) {
    const size = unzipped[key].byteLength;
    totalUnzipped += size;
    if (totalUnzipped > MAX_KMZ_TOTAL_UNZIPPED_BYTES) {
      throw new Error("KMZ po rozpakowaniu jest zbyt duzy.");
    }
    if (key.toLowerCase().endsWith(".kml")) {
      if (size > MAX_KMZ_SINGLE_KML_BYTES) {
        throw new Error("Plik KML w archiwum KMZ jest zbyt duzy.");
      }
      kmlKeys.push(key);
    }
  }

  if (kmlKeys.length === 0) throw new Error("KMZ nie zawiera pliku KML.");
  const picked = kmlKeys.find((k) => k.toLowerCase().endsWith("doc.kml")) ?? kmlKeys[0];
  const text = new TextDecoder().decode(unzipped[picked]);
  return fromKmlText(text, speedKmh);
}
