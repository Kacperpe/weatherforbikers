import { describe, expect, it } from "vitest";
import {
  parseGoogleMapsWaypoints,
  isGoogleMapsHost,
  isShortGoogleLink,
} from "@/lib/google-maps-url";

describe("isGoogleMapsHost", () => {
  it("accepts google map hosts and country TLDs", () => {
    expect(isGoogleMapsHost("www.google.com")).toBe(true);
    expect(isGoogleMapsHost("maps.google.com")).toBe(true);
    expect(isGoogleMapsHost("google.pl")).toBe(true);
    expect(isGoogleMapsHost("google.co.uk")).toBe(true);
    expect(isGoogleMapsHost("maps.app.goo.gl")).toBe(true);
  });
  it("rejects non-google hosts", () => {
    expect(isGoogleMapsHost("evil.com")).toBe(false);
    expect(isGoogleMapsHost("googlexcom.attacker.net")).toBe(false);
  });
});

describe("isShortGoogleLink", () => {
  it("detects short link hosts", () => {
    expect(isShortGoogleLink("maps.app.goo.gl")).toBe(true);
    expect(isShortGoogleLink("goo.gl")).toBe(true);
    expect(isShortGoogleLink("www.google.com")).toBe(false);
  });
});

describe("parseGoogleMapsWaypoints", () => {
  it("extracts explicit lat,lng path segments as [lon,lat] coords", () => {
    const url =
      "https://www.google.com/maps/dir/52.2296756,21.0122287/50.0646501,19.9449799/@51.1,20.4,7z";
    const result = parseGoogleMapsWaypoints(url);
    expect(result).toEqual({
      kind: "coords",
      coords: [
        [21.0122287, 52.2296756],
        [19.9449799, 50.0646501],
      ],
    });
  });

  it("falls back to !1d!2d data coords when path holds names", () => {
    const url =
      "https://www.google.com/maps/dir/Warszawa/Krak%C3%B3w/@51.1,20.4,7z/data=!4m2!1m1!1d21.0122287!2d52.2296756!1m1!1d19.9449799!2d50.0646501";
    const result = parseGoogleMapsWaypoints(url);
    expect(result).toEqual({
      kind: "coords",
      coords: [
        [21.0122287, 52.2296756],
        [19.9449799, 50.0646501],
      ],
    });
  });

  it("returns names when no coords are available", () => {
    const url = "https://www.google.com/maps/dir/Warszawa/Krak%C3%B3w/";
    const result = parseGoogleMapsWaypoints(url);
    expect(result).toEqual({ kind: "names", names: ["Warszawa", "Kraków"] });
  });

  it("parses the Maps URLs API origin/destination form", () => {
    const url =
      "https://www.google.com/maps/dir/?api=1&origin=52.2,21.0&destination=50.06,19.9&waypoints=51.1,20.0|51.5,20.5";
    const result = parseGoogleMapsWaypoints(url);
    expect(result).toEqual({
      kind: "coords",
      coords: [
        [21.0, 52.2],
        [20.0, 51.1],
        [20.5, 51.5],
        [19.9, 50.06],
      ],
    });
  });

  it("returns null for a non-directions place URL", () => {
    const url = "https://www.google.com/maps/place/Wawel/@50.05,19.93,17z";
    expect(parseGoogleMapsWaypoints(url)).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(parseGoogleMapsWaypoints("not a url")).toBeNull();
  });
});
