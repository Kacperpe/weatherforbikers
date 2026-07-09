"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as LeafletType from "leaflet";
import type { Poi, PoiCategory } from "@/types/poi";
import { POI_CONFIG } from "@/types/poi";
import type { WeatherAlert, WeatherAlertKind } from "@/types/weather-alert";
import type { WeatherPointForecast } from "@/types/weather-point-forecast";
import { useLang } from "@/contexts/lang-context";

type LatLng = [number, number];

type RouteMapProps = {
  points: LatLng[];
  themeMode: "dark" | "light";
  weatherAlerts: WeatherAlert[];
  pois: Poi[];
  forecastRows: WeatherPointForecast[];
  tempUnit: "°C" | "°F";
  windUnit: "km/h" | "m/s" | "mph" | "kn";
  currentLocation: LatLng | null;
};

const KIND_CONFIG: Record<WeatherAlertKind, { color: string; emoji: string; label: string }> = {
  storm: { color: "#7c3aed", emoji: "⛈",  label: "Burza" },
  snow:  { color: "#93c5fd", emoji: "❄️", label: "Śnieg" },
  rain:  { color: "#3b82f6", emoji: "🌧",  label: "Deszcz" },
  wind:  { color: "#a78bfa", emoji: "💨",  label: "Silny wiatr" },
  cold:  { color: "#22d3ee", emoji: "🥶",  label: "Zimno" },
  hot:   { color: "#f87171", emoji: "🌡",  label: "Upał" },
};

const KIND_PRIORITY: WeatherAlertKind[] = ["storm", "snow", "rain", "wind", "cold", "hot"];

const POI_EMOJI: Record<PoiCategory, string> = {
  restaurant:    "🍴",
  accommodation: "🛏",
  toilet:        "🚻",
  campsite:      "⛺",
  attraction:    "🏛",
  shop:          "🛒",
  water:         "💧",
};

const TILE_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR_DARK = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const ATTR_LIGHT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const FORECAST_ZOOM_THRESHOLD = 10;

const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

function degToCompass(deg: number | null): string {
  if (deg === null) return "";
  return COMPASS_8[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function windArrowHtml(deg: number | null, large = false): string {
  if (deg === null) return "";
  const label = degToCompass(deg);
  const arrowPx = large ? "17px" : "10px";
  const labelPx = large ? "12px" : "10px";
  return `<span style="display:inline-flex;align-items:center;gap:2px;opacity:0.85"><span style="display:inline-block;transform:rotate(${deg}deg);line-height:1;font-weight:900;font-size:${arrowPx}">↑</span><span style="font-size:${labelPx};font-weight:700">${label}</span></span>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function primaryKind(kinds: WeatherAlertKind[]): WeatherAlertKind {
  for (const k of KIND_PRIORITY) {
    if (kinds.includes(k)) return k;
  }
  return kinds[0];
}

function alertRadius(alert: WeatherAlert): number {
  const pk = primaryKind(alert.kinds);
  if (pk === "rain") return Math.min(16, 8 + ((alert.precipitationProbability ?? 0) / 10));
  if (pk === "wind") return Math.min(16, 8 + Math.max(0, ((alert.windKmh ?? 0) - 30) / 5));
  return 10;
}

function weatherIcon(code: number | null): string {
  if (code === null) return "—";
  if (code === 0)    return "☀️";
  if (code <= 3)     return "⛅";
  if (code <= 48)    return "🌫";
  if (code <= 55)    return "🌦";
  if (code <= 67)    return "🌧";
  if (code <= 77)    return "❄️";
  if (code <= 82)    return "🌧";
  if (code <= 86)    return "🌨";
  if (code <= 94)    return "🌨";
  if (code >= 95)    return "⛈";
  return "⛅";
}

export function RouteMap({ points, themeMode, weatherAlerts, pois, forecastRows, tempUnit, windUnit, currentLocation }: RouteMapProps) {
  const { t } = useLang();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletType.Map | null>(null);
  const leafletRef = useRef<typeof LeafletType | null>(null);
  const tileLayerRef = useRef<LeafletType.TileLayer | null>(null);
  const routeLayerRef = useRef<LeafletType.LayerGroup | null>(null);
  const alertLayerRef = useRef<LeafletType.LayerGroup | null>(null);
  const poiLayerRef = useRef<LeafletType.LayerGroup | null>(null);
  const forecastLayerRef = useRef<LeafletType.LayerGroup | null>(null);
  const userMarkerRef = useRef<LeafletType.Marker | null>(null);
  const previousLocationRef = useRef<LatLng | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(7);
  const [followLocation, setFollowLocation] = useState(true);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map) return;

    if (!currentLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      previousLocationRef.current = null;
      return;
    }

    const firstFix = previousLocationRef.current === null;
    if (firstFix) setFollowLocation(true);
    previousLocationRef.current = currentLocation;

    if (!userMarkerRef.current) {
      const icon = L.divIcon({
        className: "",
        html: "<div title='Twoja lokalizacja' style='width:22px;height:22px;border-radius:50%;background:#06b6d4;border:3px solid white;box-shadow:0 1px 8px rgba(0,0,0,.55);'></div>",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      userMarkerRef.current = L.marker(currentLocation, { icon, zIndexOffset: 2000 }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(currentLocation);
    }

    if (firstFix || followLocation) map.panTo(currentLocation, { animate: true, duration: 0.35 });
  }, [currentLocation, followLocation, mapReady]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: true }).setView([52.2297, 21.0122], 7);
      mapRef.current = map;
      leafletRef.current = L;
      routeLayerRef.current = L.layerGroup().addTo(map);
      alertLayerRef.current = L.layerGroup().addTo(map);
      poiLayerRef.current = L.layerGroup().addTo(map);
      forecastLayerRef.current = L.layerGroup(); // not added to map yet — zoom-gated

      map.on("zoomend", () => setZoomLevel(map.getZoom()));
      map.on("dragstart", () => setFollowLocation(false));

      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      tileLayerRef.current?.remove();
      tileLayerRef.current = null;
      routeLayerRef.current?.clearLayers();
      alertLayerRef.current?.clearLayers();
      poiLayerRef.current?.clearLayers();
      forecastLayerRef.current?.clearLayers();
      routeLayerRef.current = null;
      alertLayerRef.current = null;
      poiLayerRef.current = null;
      forecastLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Tile layer (theme switch)
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!mapReady || !L || !map) return;

    tileLayerRef.current?.remove();
    const isDark = themeMode === "dark";
    tileLayerRef.current = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, {
      attribution: isDark ? ATTR_DARK : ATTR_LIGHT,
      maxZoom: 19,
    }).addTo(map);
  }, [mapReady, themeMode]);

  // Route polyline + START/END markers
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    if (!mapReady || !L || !map || !routeLayer) return;

    routeLayer.clearLayers();

    if (points.length === 0) return;

    L.polyline(points, { color: themeMode === "dark" ? "#22d3ee" : "#ef4444", weight: 4 }).addTo(routeLayer);

    L.circleMarker(points[0], { radius: 7, color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.95, weight: 2 })
      .bindTooltip(t("route.start"), { permanent: true, direction: "top", offset: [0, -10] })
      .addTo(routeLayer);

    L.circleMarker(points[points.length - 1], { radius: 7, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.95, weight: 2 })
      .bindTooltip(t("route.end"), { permanent: true, direction: "top", offset: [0, -10] })
      .addTo(routeLayer);

    const uniquePoints = new Set(points.map(String));
    if (uniquePoints.size === 1) {
      map.setView(points[0], 14);
    } else {
      map.fitBounds(points, { padding: [36, 36] });
    }
  }, [mapReady, points, t]);

  // Alert circles
  useEffect(() => {
    const L = leafletRef.current;
    const alertLayer = alertLayerRef.current;
    if (!mapReady || !L || !alertLayer) return;

    alertLayer.clearLayers();

    function fmtTemp(c: number | null): string {
      if (c === null) return "—";
      if (tempUnit === "°F") return `${Math.round((c * 9) / 5 + 32)}${tempUnit}`;
      return `${c}${tempUnit}`;
    }

    function fmtWind(kmh: number | null): string {
      if (kmh === null) return "—";
      if (windUnit === "m/s") return `${(kmh / 3.6).toFixed(1)} ${windUnit}`;
      if (windUnit === "mph") return `${(kmh / 1.60934).toFixed(1)} ${windUnit}`;
      if (windUnit === "kn")  return `${(kmh / 1.852).toFixed(1)} ${windUnit}`;
      return `${kmh} ${windUnit}`;
    }

    for (const alert of weatherAlerts) {
      const pk = primaryKind(alert.kinds);
      const { color } = KIND_CONFIG[pk];
      const emojis = alert.kinds.map((k) => KIND_CONFIG[k].emoji).join("");

      // Key metric shown inline on the chip
      let metric = fmtTemp(alert.temperatureC);
      if (alert.kinds.includes("rain") || alert.kinds.includes("storm")) {
        metric = `${fmtTemp(alert.temperatureC)} ${alert.precipitationProbability ?? 0}%`;
      } else if (alert.kinds.includes("wind") && !alert.kinds.includes("rain")) {
        metric = `${fmtTemp(alert.temperatureC)} 💨${fmtWind(alert.windKmh ?? null)}`;
      }

      const chipHtml = `<div style="
        background:${color}22;
        border:2px solid ${color};
        border-radius:20px;
        padding:3px 9px;
        font-size:15px;
        font-family:system-ui,sans-serif;
        white-space:nowrap;
        box-shadow:0 2px 10px rgba(0,0,0,0.55);
        display:inline-flex;
        align-items:center;
        gap:4px;
        cursor:pointer;
        pointer-events:auto;
        transform:translate(-50%,-50%);
      ">${emojis}<span style="font-size:13px;font-weight:700;color:${color}">${metric}</span></div>`;

      const kindRows = alert.kinds.map((k) => {
        const cfg = KIND_CONFIG[k];
        let detail = "";
        if (k === "rain" || k === "storm" || k === "snow") detail = `${alert.rainMm ?? alert.precipitationMm ?? 0} mm · ${alert.precipitationProbability ?? 0}%`;
        if (k === "wind") detail = fmtWind(alert.windKmh ?? null);
        if (k === "cold" || k === "hot") detail = fmtTemp(alert.temperatureC);
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="background:${cfg.color}28;color:${cfg.color};border-radius:4px;padding:1px 6px;font-size:12px;font-weight:700;border:1px solid ${cfg.color}55;white-space:nowrap">${cfg.emoji} ${esc(t(`alert.${k}`))}</span>
          <span style="color:#374151;font-weight:600">${detail}</span>
        </div>`;
      }).join("");

      const etaH = Math.floor(alert.etaMinutes / 60);
      const etaMin = alert.etaMinutes % 60;
      const etaLabel = etaH > 0 ? `+${etaH}h ${etaMin}min` : `+${etaMin}min`;

      const popup = `<div style="min-width:190px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.6">
        <div style="font-weight:700;font-size:15px;margin-bottom:2px">${emojis} ${esc(alert.plannedAtRouteTz)}</div>
        <div style="color:#94a3b8;font-size:12px;margin-bottom:10px">${etaLabel}</div>
        ${kindRows}
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;display:flex;gap:12px">
          <span>🌡 ${fmtTemp(alert.temperatureC)}</span>
          <span>💨 ${fmtWind(alert.windKmh)}</span>
        </div>
      </div>`;

      const divIcon = L.divIcon({
        html: chipHtml,
        className: "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      L.marker([alert.lat, alert.lon], { icon: divIcon, zIndexOffset: 1000 })
        .bindPopup(popup)
        .addTo(alertLayer);
    }
  }, [mapReady, weatherAlerts, tempUnit, windUnit, t]);

  // POI markers
  useEffect(() => {
    const L = leafletRef.current;
    const poiLayer = poiLayerRef.current;
    if (!mapReady || !L || !poiLayer) return;

    poiLayer.clearLayers();

    for (const poi of pois) {
      const cfg = POI_CONFIG[poi.category];
      const emoji = POI_EMOJI[poi.category];
      const catLabel = t(`poi.${poi.category}`);
      const icon = L.divIcon({
        html: `<div title="${esc(catLabel)}" style="background:${cfg.color};border:2.5px solid white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,0.45);cursor:pointer;">${emoji}</div>`,
        className: "",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -18],
      });

      const popup = `<div style="min-width:120px">
        <div style="font-weight:600;font-size:13px">${esc(poi.name ?? catLabel)}</div>
        ${poi.name ? `<div style="font-size:11px;color:#64748b;margin-top:2px">${esc(catLabel)}</div>` : ""}
      </div>`;

      L.marker([poi.lat, poi.lon], { icon }).bindPopup(popup).addTo(poiLayer);
    }
  }, [mapReady, pois, t]);

  // Forecast chips (non-alert points only) — rebuild when data/theme/lang/units change
  useEffect(() => {
    const L = leafletRef.current;
    const forecastLayer = forecastLayerRef.current;
    if (!mapReady || !L || !forecastLayer) return;

    forecastLayer.clearLayers();

    const alertIds = new Set(weatherAlerts.map((a) => a.segmentId));
    const isDark = themeMode === "dark";

    const bg     = isDark ? "rgba(15,23,42,0.88)"    : "rgba(255,255,255,0.93)";
    const border = isDark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.13)";
    const color  = isDark ? "#e2e8f0"                : "#1e293b";

    function fmtTemp(c: number | null): string {
      if (c === null) return "—";
      if (tempUnit === "°F") return `${Math.round((c * 9) / 5 + 32)}${tempUnit}`;
      return `${c}${tempUnit}`;
    }

    function fmtWind(kmh: number | null): string {
      if (kmh === null) return "—";
      if (windUnit === "m/s") return `${(kmh / 3.6).toFixed(1)} ${windUnit}`;
      if (windUnit === "mph") return `${(kmh / 1.60934).toFixed(1)} ${windUnit}`;
      if (windUnit === "kn")  return `${(kmh / 1.852).toFixed(1)} ${windUnit}`;
      return `${kmh} ${windUnit}`;
    }

    for (const row of forecastRows) {
      if (alertIds.has(row.segmentId)) continue;

      const icon = weatherIcon(row.weatherCode);
      const temp = fmtTemp(row.temperatureC);
      const wind = `${fmtWind(row.windKmh)}${row.windDirectionDeg !== null ? `&nbsp;${windArrowHtml(row.windDirectionDeg, true)}` : ""}`;
      const rain = row.precipitationProbability !== null ? `${row.precipitationProbability}%` : "—";

      const chipHtml = `<div style="
        background:${bg};
        border:1px solid ${border};
        border-radius:8px;
        padding:3px 8px;
        font-size:13px;
        font-family:system-ui,sans-serif;
        color:${color};
        white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,0.35);
        transform:translate(-50%,-115%);
        display:inline-flex;
        align-items:center;
        gap:5px;
        cursor:pointer;
        pointer-events:auto;
      ">${icon} ${temp}&nbsp;💨${wind}&nbsp;🌧${rain}</div>`;

      const divIcon = L.divIcon({
        html: chipHtml,
        className: "",
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const etaH   = Math.floor(row.etaMinutes / 60);
      const etaMin = row.etaMinutes % 60;
      const etaLabel = etaH > 0 ? `+${etaH}h ${etaMin}min` : `+${etaMin}min`;

      const popup = `<div style="min-width:170px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.7">
        <div style="font-weight:700;font-size:14px;margin-bottom:2px">${icon} ${esc(row.plannedAtRouteTz)}</div>
        <div style="color:#94a3b8;font-size:12px;margin-bottom:8px">${etaLabel} · ${Math.round(row.distanceKmFromStart)} km</div>
        <div>🌡 ${fmtTemp(row.temperatureC)} <span style="color:#94a3b8;font-size:12px">(odcz. ${fmtTemp(row.apparentTemperatureC)})</span></div>
        <div>💨 ${fmtWind(row.windKmh)}${row.windDirectionDeg !== null ? ` ${windArrowHtml(row.windDirectionDeg)}` : ""} <span style="color:#94a3b8;font-size:12px">(porywy ${fmtWind(row.windGustsKmh)})</span></div>
        <div>🌧 ${row.precipitationProbability ?? 0}% · ${row.rainMm ?? row.precipitationMm ?? 0} mm</div>
      </div>`;

      L.marker([row.lat, row.lon], { icon: divIcon, zIndexOffset: 500 })
        .bindPopup(popup)
        .addTo(forecastLayer);
    }
  }, [mapReady, forecastRows, weatherAlerts, themeMode, tempUnit, windUnit, t]);

  // Show/hide forecast layer based on zoom
  useEffect(() => {
    const map = mapRef.current;
    const forecastLayer = forecastLayerRef.current;
    if (!mapReady || !map || !forecastLayer) return;

    if (zoomLevel >= FORECAST_ZOOM_THRESHOLD) {
      if (!map.hasLayer(forecastLayer)) forecastLayer.addTo(map);
    } else {
      if (map.hasLayer(forecastLayer)) forecastLayer.remove();
    }
  }, [mapReady, zoomLevel]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {currentLocation && (
        <button
          type="button"
          aria-label="Wycentruj mapę na mojej lokalizacji"
          title="Wycentruj mapę na mojej lokalizacji"
          onClick={() => {
            setFollowLocation(true);
            mapRef.current?.panTo(currentLocation, { animate: true, duration: 0.35 });
          }}
          className="absolute bottom-24 right-3 z-[1000] flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-xl text-cyan-600 shadow-lg hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-cyan-400 dark:hover:bg-slate-900"
        >
          ◎
        </button>
      )}
    </div>
  );
}
