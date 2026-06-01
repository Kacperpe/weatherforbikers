"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/contexts/lang-context";
import { POI_CONFIG } from "@/types/poi";
import type { Poi, PoiCategory } from "@/types/poi";
import type { RouteSegment } from "@/types/route-segment";
import type { WeatherAlert } from "@/types/weather-alert";
import type { WeatherPointForecast } from "@/types/weather-point-forecast";

const RouteMap = dynamic(
  () => import("@/components/route-map").then((module) => module.RouteMap),
  { ssr: false },
);

type ThemeMode = "dark" | "light";
type LatLng = [number, number];

type MapPanelProps = {
  segments: RouteSegment[];
  themeMode: ThemeMode;
  weatherAlerts: WeatherAlert[];
  poiRadius: number;
  forecastRows: WeatherPointForecast[];
  tempUnit: "°C" | "°F";
  windUnit: "km/h" | "m/s" | "mph" | "kn";
};

type SectionHeaderProps = {
  label: string;
  count: number;
  visible: boolean;
  onVisibilityToggle: () => void;
  open: boolean;
  onOpenToggle: () => void;
  hideTitle: string;
  showTitle: string;
};

const ALL_CATEGORIES = Object.keys(POI_CONFIG) as PoiCategory[];
const STORAGE_KEYS = {
  poisVisible: "map-panel:pois-visible",
  alertsVisible: "map-panel:alerts-visible",
  forecastVisible: "map-panel:forecast-visible",
  poisOpen: "map-panel:pois-open",
} as const;


function SectionHeader({
  label,
  count,
  visible,
  onVisibilityToggle,
  open,
  onOpenToggle,
  hideTitle,
  showTitle,
}: SectionHeaderProps) {
  return (
    <div className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-semibold">
      <button
        type="button"
        onClick={onVisibilityToggle}
        title={visible ? hideTitle : showTitle}
        className={`flex min-w-0 items-center gap-1.5 transition-opacity ${visible ? "opacity-100" : "opacity-40"}`}
      >
        <span className={`truncate transition-all ${!visible ? "line-through" : ""}`}>{label}</span>
        <span className="shrink-0 opacity-70">({count})</span>
      </button>
      <button
        type="button"
        onClick={onOpenToggle}
        className={`shrink-0 px-1 transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`}
      >
        ▲
      </button>
    </div>
  );
}

function distanceToSegmentM(
  poiLat: number,
  poiLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const latScale = 111320;
  const lonScale = 111320 * Math.cos((poiLat * Math.PI) / 180);
  const px = (poiLon - aLon) * lonScale;
  const py = (poiLat - aLat) * latScale;
  const dx = (bLon - aLon) * lonScale;
  const dy = (bLat - aLat) * latScale;
  const lenSq = dx * dx + dy * dy;
  const tVal = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
  return Math.sqrt((px - tVal * dx) ** 2 + (py - tVal * dy) ** 2);
}

function isNearRoute(poi: Poi, segments: RouteSegment[], maxDistM: number): boolean {
  const padDeg = maxDistM / 111320;
  const step = segments.length > 2000 ? Math.ceil(segments.length / 2000) : 1;
  for (let i = 0; i < segments.length; i += step) {
    const seg = segments[i];
    if (
      poi.lat < Math.min(seg.from[1], seg.to[1]) - padDeg ||
      poi.lat > Math.max(seg.from[1], seg.to[1]) + padDeg ||
      poi.lon < Math.min(seg.from[0], seg.to[0]) - padDeg ||
      poi.lon > Math.max(seg.from[0], seg.to[0]) + padDeg
    ) {
      continue;
    }
    if (distanceToSegmentM(poi.lat, poi.lon, seg.from[1], seg.from[0], seg.to[1], seg.to[0]) <= maxDistM) {
      return true;
    }
  }
  return false;
}

export function MapPanel({
  segments,
  themeMode,
  weatherAlerts,
  poiRadius,
  forecastRows,
  tempUnit,
  windUnit,
}: MapPanelProps) {
  const { t } = useLang();
  const [pois, setPois] = useState<Poi[]>([]);
  const [poisLoading, setPoisLoading] = useState(false);
  const [activeCategories, setActiveCategories] = useState<Set<PoiCategory>>(new Set(ALL_CATEGORIES));
  const [poisVisible, setPoisVisible] = useState(true);
  const [alertsVisible, setAlertsVisible] = useState(true);
  const [forecastVisible, setForecastVisible] = useState(true);
  const [poisOpen, setPoisOpen] = useState(true);
  const settingsLoaded = useRef(false);
  useEffect(() => { if (settingsLoaded.current) window.localStorage.setItem(STORAGE_KEYS.poisVisible, String(poisVisible)); }, [poisVisible]);
  useEffect(() => { if (settingsLoaded.current) window.localStorage.setItem(STORAGE_KEYS.alertsVisible, String(alertsVisible)); }, [alertsVisible]);
  useEffect(() => { if (settingsLoaded.current) window.localStorage.setItem(STORAGE_KEYS.forecastVisible, String(forecastVisible)); }, [forecastVisible]);
  useEffect(() => { if (settingsLoaded.current) window.localStorage.setItem(STORAGE_KEYS.poisOpen, String(poisOpen)); }, [poisOpen]);
  useEffect(() => {
    settingsLoaded.current = true;
    const ls = (k: string) => window.localStorage.getItem(k);
    const pv = ls(STORAGE_KEYS.poisVisible);     if (pv !== null) setPoisVisible(pv === "true");
    const av = ls(STORAGE_KEYS.alertsVisible);   if (av !== null) setAlertsVisible(av === "true");
    const fv = ls(STORAGE_KEYS.forecastVisible); if (fv !== null) setForecastVisible(fv === "true");
    const po = ls(STORAGE_KEYS.poisOpen);        if (po !== null) setPoisOpen(po === "true");
  }, []);

  const routePoints = useMemo<LatLng[]>(() => {
    if (segments.length === 0) return [];
    const points: LatLng[] = [[segments[0].from[1], segments[0].from[0]]];
    for (const segment of segments) points.push([segment.to[1], segment.to[0]]);
    return points;
  }, [segments]);

  const bbox = useMemo(() => {
    if (segments.length === 0) return null;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    for (const seg of segments) {
      const [fromLon, fromLat] = seg.from;
      const [toLon, toLat] = seg.to;
      minLat = Math.min(minLat, fromLat, toLat);
      maxLat = Math.max(maxLat, fromLat, toLat);
      minLon = Math.min(minLon, fromLon, toLon);
      maxLon = Math.max(maxLon, fromLon, toLon);
    }
    const pad = 0.02;
    return { minLat: minLat - pad, maxLat: maxLat + pad, minLon: minLon - pad, maxLon: maxLon + pad };
  }, [segments]);

  useEffect(() => {
    if (!bbox) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      minLat: String(bbox.minLat),
      minLon: String(bbox.minLon),
      maxLat: String(bbox.maxLat),
      maxLon: String(bbox.maxLon),
    });

    const RETRY_DELAYS = [2_000, 6_000, 15_000];
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout>;

    const tryFetch = () => {
      setPoisLoading(true);
      fetch(`/api/pois?${params.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          const data = await res.json() as { ok: boolean; pois?: Poi[] };
          if (data.ok && data.pois) {
            setPois(data.pois);
            setPoisLoading(false);
          } else {
            throw new Error("not ok");
          }
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          if (attempt < RETRY_DELAYS.length) {
            retryTimer = setTimeout(tryFetch, RETRY_DELAYS[attempt++]);
          } else {
            setPoisLoading(false);
          }
        });
    };

    const timer = setTimeout(tryFetch, 600);

    return () => {
      clearTimeout(timer);
      clearTimeout(retryTimer);
      controller.abort();
    };
  }, [bbox]);

  const routeFilteredPois = useMemo(
    () => pois.filter((poi) => isNearRoute(poi, segments, poiRadius)),
    [pois, segments, poiRadius],
  );
  const filteredPois = useMemo(
    () => routeFilteredPois.filter((poi) => activeCategories.has(poi.category)),
    [routeFilteredPois, activeCategories],
  );

  const isDark = themeMode === "dark";
  const panelBase = isDark ? "border-slate-700/80 bg-slate-950/90 text-slate-200" : "border-slate-300/90 bg-white/95 text-slate-900";
  const dividerCls = isDark ? "border-slate-700/40" : "border-slate-200";

  function toggleCategory(cat: PoiCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <section className={`absolute inset-0 transition-colors duration-300 ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
      <RouteMap
        points={routePoints}
        themeMode={themeMode}
        weatherAlerts={alertsVisible ? weatherAlerts : []}
        pois={poisVisible ? filteredPois : []}
        forecastRows={forecastVisible ? forecastRows : []}
        tempUnit={tempUnit}
        windUnit={windUnit}
      />

      {segments.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-28 z-[500] flex justify-center px-4">
          <p className={`rounded-xl border px-4 py-3 text-sm backdrop-blur ${isDark ? "border-slate-700/80 bg-slate-950/85 text-slate-300" : "border-slate-300 bg-white/95 text-slate-800"}`}>
            {t("map.noRoute")}
          </p>
        </div>
      )}

      <div className={`absolute bottom-20 left-3 z-[1000] w-52 rounded-xl border shadow-xl backdrop-blur md:bottom-6 ${panelBase}`}>
        <SectionHeader
          label={`${t("map.attractions")}${poisLoading ? ` ${t("map.loading")}` : ""}`}
          count={filteredPois.length}
          visible={poisVisible}
          onVisibilityToggle={() => setPoisVisible((v) => !v)}
          open={poisOpen}
          onOpenToggle={() => setPoisOpen((o) => !o)}
          hideTitle={t("map.hideAttractions")}
          showTitle={t("map.showAttractions")}
        />

        {poisOpen && (
          <div className={`flex flex-col gap-1 px-3 pb-2 border-t ${dividerCls}`}>
            {ALL_CATEGORIES.map((cat) => {
              const cfg = POI_CONFIG[cat];
              const active = activeCategories.has(cat);
              const count = routeFilteredPois.filter((p) => p.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`flex items-center gap-2 rounded px-1 py-0.5 text-xs transition-opacity ${active ? "opacity-100" : "opacity-45"}`}
                >
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-white/60" style={{ background: cfg.color }} />
                  <span>{t(`poi.${cat}`)}</span>
                  <span className="ml-auto opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className={`border-t ${dividerCls}`}>
          <button
            type="button"
            onClick={() => setAlertsVisible((v) => !v)}
            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-semibold transition-opacity ${alertsVisible ? "opacity-100" : "opacity-45"}`}
          >
            <span className={`transition-all ${!alertsVisible ? "line-through" : ""}`}>⚠️ {t("map.weatherAlerts")}</span>
            <span className="shrink-0 opacity-70">({weatherAlerts.length})</span>
          </button>
        </div>

        <div className={`border-t ${dividerCls}`}>
          <button
            type="button"
            onClick={() => setForecastVisible((v) => !v)}
            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-semibold transition-opacity ${forecastVisible ? "opacity-100" : "opacity-45"}`}
          >
            <span className={`transition-all ${!forecastVisible ? "line-through" : ""}`}>⛅ {t("map.forecastTimeline")}</span>
            <span className="shrink-0 opacity-70">({forecastRows.length})</span>
          </button>
        </div>
      </div>
    </section>
  );
}
