// Extracts route waypoints from a Google Maps link.
//
// A Google Maps share link never contains the road-following geometry — only
// the waypoints (start / end / via points). We pull those out here and let a
// routing engine (BRouter) reconstruct the actual path. Coordinates are always
// returned as [lon, lat] to match the GeoJSON / toSegments convention.

export type GoogleWaypoints =
  | { kind: "coords"; coords: [number, number][] }
  | { kind: "names"; names: string[] };

const GOOGLE_HOSTS = [
  "google.com",
  "maps.google.com",
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
];

// Accepts www./maps. subdomains and country TLDs (google.pl, google.co.uk, …).
export function isGoogleMapsHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (GOOGLE_HOSTS.includes(host)) return true;
  if (/^maps\.google\.[a-z.]+$/.test(host)) return true;
  if (/^google\.[a-z.]+$/.test(host)) return true;
  return false;
}

export function isShortGoogleLink(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "maps.app.goo.gl" || host === "goo.gl" || host === "g.co";
}

// "52.2296756,21.0122287" → [21.0122287, 52.2296756] (lon, lat). null if not a coord.
function parseLatLng(value: string): [number, number] | null {
  const cleaned = decodeURIComponent(value).replace(/\+/g, "").trim();
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lon, lat];
}

// The `data=` blob encodes each waypoint as `!1d<lon>!2d<lat>`. These are the
// coordinates Google itself resolved for the route, so they are the most exact.
function coordsFromDataParam(url: URL): [number, number][] {
  const source = url.href;
  const coords: [number, number][] = [];
  const re = /!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const lon = Number(m[1]);
    const lat = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      coords.push([lon, lat]);
    }
  }
  return coords;
}

// Maps URLs API form: /maps/dir/?api=1&origin=..&destination=..&waypoints=a|b
function fromQueryParams(url: URL): GoogleWaypoints | null {
  const origin = url.searchParams.get("origin");
  const destination = url.searchParams.get("destination");
  if (!origin || !destination) return null;

  const raw = [origin, ...(url.searchParams.get("waypoints")?.split("|") ?? []), destination]
    .map((s) => s.trim())
    .filter(Boolean);

  const coords = raw.map(parseLatLng);
  if (coords.every((c) => c !== null)) {
    return { kind: "coords", coords: coords as [number, number][] };
  }
  const names = raw.filter((s) => parseLatLng(s) === null).map((s) => decodeURIComponent(s));
  return names.length >= 2 ? { kind: "names", names } : null;
}

// Classic form: /maps/dir/Start/Via/End/@center,zoom/data=...
function fromDirPath(url: URL): GoogleWaypoints | null {
  const marker = "/dir/";
  const idx = url.pathname.indexOf(marker);
  if (idx === -1) return null;

  const after = url.pathname.slice(idx + marker.length);
  const rawSegments = after
    .split("/")
    .filter((seg) => seg.length > 0 && !seg.startsWith("@") && !seg.startsWith("data="));

  const coords: [number, number][] = [];
  const names: string[] = [];
  for (const seg of rawSegments) {
    const coord = parseLatLng(seg);
    if (coord) coords.push(coord);
    else names.push(decodeURIComponent(seg.replace(/\+/g, " ")).trim());
  }

  if (coords.length >= 2) return { kind: "coords", coords };

  // Names in the path but exact coords sit in the data blob — prefer the coords.
  const dataCoords = coordsFromDataParam(url);
  if (dataCoords.length >= 2) return { kind: "coords", coords: dataCoords };

  if (names.length >= 2) return { kind: "names", names };
  return null;
}

// Parses an already-expanded (non-short) Google Maps URL.
export function parseGoogleMapsWaypoints(rawUrl: string): GoogleWaypoints | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  return fromQueryParams(url) ?? fromDirPath(url) ?? null;
}
