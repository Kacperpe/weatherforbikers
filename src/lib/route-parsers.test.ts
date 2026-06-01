import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { toSegments } from "@/lib/geojson";
import { parseRouteKmz } from "@/lib/kml";

describe("toSegments limits", () => {
  it("rejects routes above point budget", () => {
    const points: [number, number][] = [];
    for (let i = 0; i < 100_001; i += 1) points.push([20 + i * 0.00001, 50]);
    expect(() => toSegments(points, 20)).toThrow("Trasa ma zbyt wiele punktow");
  });

  it("downsamples very long routes to max render segments", () => {
    const points: [number, number][] = [];
    for (let i = 0; i < 7000; i += 1) points.push([20 + i * 0.0001, 50]);
    const segments = toSegments(points, 20);
    expect(segments.length).toBeLessThanOrEqual(4999);
  });
});

describe("KMZ parser guards", () => {
  it("rejects KMZ without KML file", () => {
    const kmz = zipSync({ "readme.txt": strToU8("hello") });
    expect(() => parseRouteKmz(kmz.buffer, 20)).toThrow("KMZ nie zawiera pliku KML");
  });

  it("parses valid doc.kml route", () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml><Document><Placemark><LineString><coordinates>
19.0,50.0,0 19.1,50.1,0 19.2,50.2,0
</coordinates></LineString></Placemark></Document></kml>`;
    const kmz = zipSync({ "doc.kml": strToU8(kml) });
    const segments = parseRouteKmz(kmz.buffer, 20);
    expect(segments.length).toBe(2);
  });
});
