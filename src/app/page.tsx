"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPanel } from "@/components/map-panel";
import { AppNav, type AppTab } from "@/components/app-nav";
import { parseRouteFile } from "@/lib/parse-route";
import { useLang } from "@/contexts/lang-context";
import { LANG_LABELS, LANGS } from "@/lib/i18n/translations";
import type { RouteSegment } from "@/types/route-segment";
import type { WeatherPointForecast } from "@/types/weather-point-forecast";
import type { WeatherAlert, WeatherAlertKind } from "@/types/weather-alert";

const DEMO_ROUTES: { label: string; file: string }[] = [];

type ThemeMode = "dark" | "light";
const FORECAST_WINDOW_MS = 16 * 24 * 60 * 60 * 1000;
const FORECAST_BUFFER_MS = 60 * 60 * 1000;
const COMING_SOON_BY_LANG: Record<string, string> = {
  pl: "Wkrótce",
  en: "Coming soon",
  de: "Kommt bald",
  fr: "Bientot disponible",
  es: "Proximamente",
  it: "Prossimamente",
  cs: "Jiz brzy",
  nl: "Binnenkort",
  pt: "Em breve",
  sv: "Kommer snart",
  ua: "Незабаром",
};

type WeatherPointResponse = {
  ok?: boolean;
  error?: string;
  timezone?: string | null;
  timezoneAbbr?: string | null;
  sample?: {
    at: string;
    temperatureC: number | null;
    apparentTemperatureC: number | null;
    precipitationProbability: number | null;
    precipitationMm: number | null;
    rainMm: number | null;
    windKmh: number | null;
    windGustsKmh: number | null;
    weatherCode: number | null;
  };
};

const ALERT_KIND_CONFIG: Record<WeatherAlertKind, { emoji: string; label: string; color: string }> = {
  storm: { emoji: "⛈",  label: "Burza",   color: "#7c3aed" },
  snow:  { emoji: "❄️", label: "Śnieg",   color: "#93c5fd" },
  rain:  { emoji: "🌧",  label: "Deszcz",  color: "#3b82f6" },
  wind:  { emoji: "💨",  label: "Wiatr",   color: "#a78bfa" },
  cold:  { emoji: "🥶",  label: "Zimno",   color: "#22d3ee" },
  hot:   { emoji: "🌡",  label: "Gorąco",  color: "#f87171" },
};

// ── Weather condition styling ────────────────────────────────────────────────

type ConditionMeta = { icon: string; labelKey: string; rgb: readonly [number, number, number] };

function getConditionMeta(code: number | null): ConditionMeta {
  if (code === null) return { icon: "—",  labelKey: "cond.noData",        rgb: [0,   0,   0  ] };
  if (code === 0)    return { icon: "☀️", labelKey: "cond.sunny",          rgb: [0,   0,   0  ] };
  if (code <= 3)     return { icon: "⛅", labelKey: "cond.partlyCloudy",   rgb: [0,   0,   0  ] };
  if (code <= 48)    return { icon: "🌫", labelKey: "cond.fog",            rgb: [107, 114, 128] };
  if (code <= 55)    return { icon: "🌦", labelKey: "cond.drizzle",        rgb: [59,  130, 246] };
  if (code <= 57)    return { icon: "🌨", labelKey: "cond.freezingDrizzle",rgb: [6,   182, 212] };
  if (code <= 65)    return { icon: "🌧", labelKey: "cond.rain",           rgb: [37,   99, 235] };
  if (code <= 67)    return { icon: "🌨", labelKey: "cond.freezingRain",   rgb: [6,   182, 212] };
  if (code <= 77)    return { icon: "❄️", labelKey: "cond.snow",           rgb: [139,  92, 246] };
  if (code <= 82)    return { icon: "🌧", labelKey: "cond.rainShowers",    rgb: [37,   99, 235] };
  if (code <= 86)    return { icon: "🌨", labelKey: "cond.snowShowers",    rgb: [139,  92, 246] };
  if (code <= 94)    return { icon: "⛈", labelKey: "cond.hailStorm",      rgb: [239,  68,  68] };
  if (code >= 95)    return { icon: "⛈", labelKey: "cond.storm",          rgb: [239,  68,  68] };
  return             { icon: "⛅", labelKey: "cond.variable",        rgb: [0,   0,   0  ] };
}

// 0 = brak danych, 1 = możliwe (<33%), 2 = prawdopodobne (33-67%), 3 = pewne (>67%)
function precipShade(prob: number | null): 0 | 1 | 2 | 3 {
  if (prob === null) return 0;
  if (prob < 33) return 1;
  if (prob < 67) return 2;
  return 3;
}

function rowBackground(code: number | null, prob: number | null, windKmh: number | null): string {
  const wind = windKmh ?? 0;
  const { rgb } = getConditionMeta(code);
  const [r, g, b] = rgb;
  // Silny wiatr bez opadów
  if (wind > 50 && (code === null || code <= 3)) {
    const a = wind > 90 ? 0.28 : wind > 70 ? 0.18 : 0.10;
    return `rgba(139,92,246,${a})`;
  }
  // Brak koloru dla pogodnych/zachmurzonych
  if (r === 0 && g === 0 && b === 0) return "";
  const shade = precipShade(prob);
  const alpha = shade === 0 ? 0.07 : shade === 1 ? 0.11 : shade === 2 ? 0.22 : 0.38;
  return `rgba(${r},${g},${b},${alpha})`;
}

type ConfBadge = { pct: string; labelKey: string; color: string };
function confidenceBadge(prob: number | null): ConfBadge {
  if (prob === null) return { pct: "—",        labelKey: "",               color: "inherit" };
  if (prob < 33)     return { pct: `${prob}%`, labelKey: "conf.possible",  color: "#f59e0b" };
  if (prob < 67)     return { pct: `${prob}%`, labelKey: "conf.likely",    color: "#f97316" };
  return             { pct: `${prob}%`, labelKey: "conf.certain",   color: "#ef4444" };
}

// ── Alert computation ────────────────────────────────────────────────────────

function computeWeatherAlerts(rows: WeatherPointForecast[]): WeatherAlert[] {
  return rows.reduce<WeatherAlert[]>((acc, row) => {
    const kinds: WeatherAlertKind[] = [];
    const code = row.weatherCode ?? 0;
    const hasPrecip = (row.precipitationProbability ?? 0) >= 40 || (row.precipitationMm ?? 0) > 0;
    if (code >= 95) kinds.push("storm");
    else if (code >= 71 && code <= 77) kinds.push("snow");
    else if (hasPrecip || (row.rainMm ?? 0) > 0) kinds.push("rain");
    if ((row.windKmh ?? 0) >= 30) kinds.push("wind");
    if (row.temperatureC !== null && row.temperatureC < 8) kinds.push("cold");
    if (row.temperatureC !== null && row.temperatureC > 30) kinds.push("hot");
    if (kinds.length > 0) acc.push({ ...row, kinds });
    return acc;
  }, []);
}

function toDateTimeLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildCheckpoints(source: RouteSegment[]) {
  if (source.length === 0) return [] as RouteSegment[];
  const endEta = source[source.length - 1].etaMinutesFromStart;
  // Dostosuj interwał do długości trasy — min 4 próbki, interwał co najwyżej 30 min
  const intervalMinutes = Math.min(30, Math.max(5, Math.floor(endEta / 4)));
  const checkpoints: RouteSegment[] = [];
  const used = new Set<string>();
  for (let minute = intervalMinutes; minute <= endEta; minute += intervalMinutes) {
    const segment = source.find((s) => s.etaMinutesFromStart >= minute);
    if (segment && !used.has(segment.id)) { checkpoints.push(segment); used.add(segment.id); }
  }
  const finalSegment = source[source.length - 1];
  if (!used.has(finalSegment.id)) checkpoints.push(finalSegment);
  const maxPoints = 24;
  if (checkpoints.length <= maxPoints) return checkpoints;
  const stride = Math.ceil(checkpoints.length / maxPoints);
  const reduced: RouteSegment[] = [];
  for (let i = 0; i < checkpoints.length; i += stride) reduced.push(checkpoints[i]);
  const last = checkpoints[checkpoints.length - 1];
  if (reduced[reduced.length - 1]?.id !== last.id) reduced.push(last);
  return reduced;
}

export default function Home() {
  const { t, lang, setLang } = useLang();
  const [segments, setSegments] = useState<RouteSegment[]>([]);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [averageSpeedKmh, setAverageSpeedKmh] = useState(20);
  const [poiRadius, setPoiRadius] = useState(500);
  const [tempUnit, setTempUnit] = useState<"°C" | "°F">("°C");
  const [windUnit, setWindUnit] = useState<"km/h" | "m/s" | "mph" | "kn">("km/h");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeStartAt, setRouteStartAt] = useState("");
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [forecastRows, setForecastRows] = useState<WeatherPointForecast[]>([]);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [nowMs, setNowMs] = useState(0);
  const maxForecastDate = useMemo(
    () => nowMs > 0 ? toDateTimeLocalInputValue(new Date(nowMs + FORECAST_WINDOW_MS - FORECAST_BUFFER_MS)) : "",
    [nowMs],
  );

  // settingsLoaded guards save-effects from firing with defaults before the mount effect reads localStorage.
  const settingsLoaded = useRef(false);
  useEffect(() => { if (settingsLoaded.current) window.localStorage.setItem("settings:tempUnit", tempUnit); }, [tempUnit]);
  useEffect(() => { if (settingsLoaded.current) window.localStorage.setItem("settings:windUnit", windUnit); }, [windUnit]);
  useEffect(() => { if (settingsLoaded.current) window.localStorage.setItem("settings:speedKmh", String(averageSpeedKmh)); }, [averageSpeedKmh]);
  useEffect(() => { if (settingsLoaded.current) window.localStorage.setItem("settings:poiRadius", String(poiRadius)); }, [poiRadius]);

  useEffect(() => {
    settingsLoaded.current = true;
    const now = Date.now();
    setNowMs(now);
    setRouteStartAt(toDateTimeLocalInputValue(new Date(now)));
    setThemeMode(window.localStorage.getItem("theme-mode") === "light" ? "light" : "dark");

    const ls = (key: string) => window.localStorage.getItem(key);
    const tu = ls("settings:tempUnit");
    if (tu === "°C" || tu === "°F") setTempUnit(tu);
    const wu = ls("settings:windUnit");
    if (wu === "km/h" || wu === "m/s" || wu === "mph" || wu === "kn") setWindUnit(wu);
    const sp = Number(ls("settings:speedKmh"));
    if (sp >= 1 && sp <= 200) setAverageSpeedKmh(sp);
    const pr = Number(ls("settings:poiRadius"));
    if ([250, 500, 1000, 2000].includes(pr)) setPoiRadius(pr);

    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [themeMode]);
  const [activeTab, setActiveTab] = useState<AppTab>("map");

  const weatherAlerts = useMemo(() => computeWeatherAlerts(forecastRows), [forecastRows]);
  const isDark = themeMode === "dark";

  const computeRouteForecast = useCallback(async () => {
    if (segments.length === 0) return;
    const baseDate = new Date(routeStartAt);
    if (Number.isNaN(baseDate.getTime())) {
      setForecastError(t("forecast.errorBadDate"));
      return;
    }
    if (baseDate.getTime() < nowMs - 60 * 60 * 1000) {
      setForecastError(t("forecast.errorPastDate"));
      return;
    }
    if (baseDate.getTime() > nowMs + FORECAST_WINDOW_MS - FORECAST_BUFFER_MS) {
      setForecastError(t("forecast.errorBadDate"));
      return;
    }
    const lastEta = segments[segments.length - 1]?.etaMinutesFromStart ?? 0;
    const routeEndMs = baseDate.getTime() + lastEta * 60_000;
    if (routeEndMs > nowMs + FORECAST_WINDOW_MS - FORECAST_BUFFER_MS) {
      setForecastError(t("forecast.errorBadDate"));
      return;
    }
    const checkpoints = buildCheckpoints(segments);
    if (checkpoints.length === 0) {
      setForecastError(t("forecast.errorNoCheckpoints"));
      return;
    }
    setForecastLoading(true);
    setForecastError(null);
    setForecastRows([]);
    try {
      const results = await Promise.allSettled(
        checkpoints.map(async (segment) => {
          const plannedTime = new Date(baseDate.getTime() + segment.etaMinutesFromStart * 60_000);
          const lat = segment.to[1];
          const lon = segment.to[0];
          const query = new URLSearchParams({ lat: String(lat), lon: String(lon), time: plannedTime.toISOString() });
          const response = await fetch(`/api/weather/point?${query.toString()}`, { cache: "no-store" });
          const data = (await response.json()) as WeatherPointResponse;
          if (!response.ok || !data.ok || !data.sample) {
            throw new Error(data.error ?? `HTTP ${response.status}`);
          }
          const timezone = data.timezone ?? "UTC";
          const plannedAtRouteTz = new Intl.DateTimeFormat("pl-PL", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: timezone,
          }).format(plannedTime);
          return {
            segmentId: segment.id,
            etaMinutes: segment.etaMinutesFromStart,
            distanceKmFromStart: segment.cumulativeDistanceKm,
            lat, lon,
            plannedAtRouteTz,
            sampledAtRouteTz: data.sample.at,
            timezone: data.timezoneAbbr ? `${timezone} (${data.timezoneAbbr})` : timezone,
            temperatureC: data.sample.temperatureC,
            apparentTemperatureC: data.sample.apparentTemperatureC,
            precipitationProbability: data.sample.precipitationProbability,
            precipitationMm: data.sample.precipitationMm,
            rainMm: data.sample.rainMm,
            windKmh: data.sample.windKmh,
            windGustsKmh: data.sample.windGustsKmh,
            weatherCode: data.sample.weatherCode,
          } satisfies WeatherPointForecast;
        }),
      );

      const rows = results.flatMap((r) => r.status === "fulfilled" ? [r.value] : []);
      const failures = results.filter((r) => r.status === "rejected");

      if (rows.length === 0) {
        const firstReason = failures[0]?.status === "rejected" ? (failures[0].reason as Error).message : "Nieznany błąd";
        setForecastError(`Nie udało się pobrać prognozy: ${firstReason}`);
      } else {
        setForecastRows(rows);
        if (failures.length > 0) {
          setForecastError(`Prognoza częściowa — ${failures.length} z ${results.length} punktów nie odpowiedziało.`);
        }
      }
    } catch (err) {
      setForecastError(`Błąd: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setForecastLoading(false);
    }
  }, [segments, routeStartAt, t, nowMs]);

  useEffect(() => {
    if (segments.length === 0) return;
    const timer = setTimeout(() => { void computeRouteForecast(); }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeRouteForecast]);

  function handleCalendarClick() {
    const message = COMING_SOON_BY_LANG[lang] ?? COMING_SOON_BY_LANG.en;
    window.alert(message);
  }

  function toggleTheme() {
    setThemeMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem("theme-mode", next);
      return next;
    });
  }

  async function parseAndSetRoute(file: File, speedKmh: number) {
    setFileLoading(true);
    try {
      const parsedSegments = await parseRouteFile(file, speedKmh);
      setSegments(parsedSegments);
      setLastFile(file);
      setRouteError(null);
      setForecastRows([]);
      setForecastError(null);
    } catch (err) {
      setSegments([]);
      setLastFile(null);
      setRouteError(err instanceof Error ? err.message : "Nie udało się odczytać trasy.");
    } finally {
      setFileLoading(false);
    }
  }

  async function handleRouteUpload(file: File) {
    await parseAndSetRoute(file, averageSpeedKmh);
  }

  async function loadPublicRoute(filename: string) {
    try {
      const response = await fetch(`/${filename}`);
      if (!response.ok) throw new Error("Brak pliku");
      const blob = await response.blob();
      const file = new File([blob], filename);
      await parseAndSetRoute(file, averageSpeedKmh);
    } catch (err) {
      setSegments([]);
      setLastFile(null);
      setRouteError(err instanceof Error ? err.message : `Nie udało się wczytać: ${filename}`);
    }
  }

  // Re-parsuj trasę przy zmianie prędkości — debounce 800ms żeby nie strzelać requestami przy suwaku
  useEffect(() => {
    if (!lastFile || averageSpeedKmh <= 0) return;
    const timer = setTimeout(() => { void parseAndSetRoute(lastFile, averageSpeedKmh); }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [averageSpeedKmh]);

  // ── Forecast reliability helpers ─────────────────────────────────────────
  const daysUntilTrip = useMemo(() => {
    const start = new Date(routeStartAt);
    if (Number.isNaN(start.getTime())) return 0;
    return Math.floor((start.getTime() - nowMs) / (1000 * 60 * 60 * 24));
  }, [routeStartAt, nowMs]);

  const tripDurationDays = useMemo(() => {
    if (segments.length === 0) return 0;
    return segments[segments.length - 1].etaMinutesFromStart / 60 / 24;
  }, [segments]);

  // ── Konwersje jednostek ───────────────────────────────────────────────────
  function fmtTemp(c: number | null): string {
    if (c === null) return "—";
    if (tempUnit === "°F") return `${Math.round((c * 9) / 5 + 32)}`;
    return `${c}`;
  }

  function fmtWind(kmh: number | null): string {
    if (kmh === null) return "—";
    if (windUnit === "m/s") return (kmh / 3.6).toFixed(1);
    if (windUnit === "mph") return (kmh / 1.60934).toFixed(1);
    if (windUnit === "kn")  return (kmh / 1.852).toFixed(1);
    return String(kmh);
  }

  // ── Shared style helpers ──────────────────────────────────────────────────
  const panelBorder = isDark ? "border-slate-700/80" : "border-slate-300/90";
  const panelBg     = isDark ? "bg-slate-950" : "bg-white";
  const labelCls    = isDark ? "block text-sm text-slate-300" : "block text-sm text-slate-700";
  const inputCls    = `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none ring-cyan-400/40 focus:ring ${isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`;
  const errorCls    = `rounded-lg border px-3 py-2 text-xs ${isDark ? "border-rose-400/40 bg-rose-400/10 text-rose-200" : "border-rose-300 bg-rose-50 text-rose-700"}`;

  return (
    <div className={`relative h-dvh w-full overflow-hidden transition-colors duration-300 ${isDark ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-900"}`}>

      {/* Map — always rendered; offset by sidebar on desktop */}
      <div className="absolute inset-0 md:left-16">
        <MapPanel
          segments={segments}
          themeMode={themeMode}
          weatherAlerts={weatherAlerts}
          poiRadius={poiRadius}
          forecastRows={forecastRows}
          tempUnit={tempUnit}
          windUnit={windUnit}
        />
      </div>

      {/* Content overlay: weather & settings tabs */}
      {activeTab !== "map" && (
        <div className={`fixed left-0 right-0 top-0 bottom-16 z-[1100] overflow-hidden border-r shadow-2xl
          md:left-16 md:right-auto md:bottom-0 md:w-[40rem] md:overflow-y-auto
          ${panelBg} ${panelBorder}`}>

          {/* ── WEATHER TAB ───────────────────────────────────────────────── */}
          {activeTab === "weather" && (
            <div className="flex flex-col h-full md:block md:h-auto">
              <div className={`shrink-0 flex items-center gap-2 px-4 py-3 border-b ${panelBorder}`}>
                <span className="font-semibold">{t("weather.title")}</span>
                {forecastLoading && <span className="text-xs opacity-60">{t("weather.loading")}</span>}
              </div>

              {weatherAlerts.length > 0 && (
                <div className="shrink-0 px-4 py-2 flex flex-wrap gap-1.5">
                  {(["storm", "snow", "rain", "wind", "cold", "hot"] as WeatherAlertKind[]).map((kind) => {
                    const count = weatherAlerts.filter((a) => a.kinds.includes(kind)).length;
                    if (count === 0) return null;
                    const { emoji, color } = ALERT_KIND_CONFIG[kind];
                    return (
                      <span key={kind} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: color + "22", color, border: `1px solid ${color}55` }}>
                        {emoji} {t(`alert.${kind}`)} {count}×
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="flex-1 overflow-y-auto md:flex-none md:overflow-visible">
                {forecastError && <div className={`m-4 ${errorCls}`}>{forecastError}</div>}
                {forecastRows.length === 0 && !forecastLoading && !forecastError && (
                  <div className={`m-4 rounded-lg border px-4 py-8 text-center text-sm opacity-60 ${panelBorder}`}>
                    {t("weather.noRoute")}
                  </div>
                )}
                {segments.length > 0 && (
                  <>
                    {/* ── Oś czasu pewności ── */}
                    <div className={`px-3 pt-3 pb-1 border-b ${panelBorder}`}>
                      <div className="relative h-5 rounded-full overflow-hidden flex">
                        <div className="flex-none w-[22%] bg-emerald-500/80" />
                        <div className="flex-none w-[22%] bg-gradient-to-r from-emerald-500/80 to-amber-400/80" />
                        <div className="flex-none w-[28%] bg-amber-400/60" />
                        <div className="flex-1 bg-slate-400/30" />
                        {/* Pasek trwania wyjazdu */}
                        {daysUntilTrip >= 0 && daysUntilTrip <= 14 && (() => {
                          const startPct = Math.min(100, (daysUntilTrip / 14) * 100);
                          const endPct   = Math.min(100, ((daysUntilTrip + tripDurationDays) / 14) * 100);
                          const widthPct = Math.max(0.8, endPct - startPct);
                          return (
                            <>
                              {/* Wypełnienie czasu trwania */}
                              <div
                                className="absolute top-0 bottom-0 bg-white/30 border-x-2 border-white/80"
                                style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                              />
                              {/* Kreska startu */}
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-white/90"
                                style={{ left: `${startPct}%` }}
                              />
                              {/* Etykieta */}
                              <div
                                className={`absolute bottom-0.5 text-[9px] font-bold whitespace-nowrap ${isDark ? "text-white" : "text-slate-800"}`}
                                style={{ left: `${Math.min(startPct + 0.5, 60)}%` }}
                              >
                                {t("rel.departure")}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      <div className={`flex justify-between mt-0.5 text-[9px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                        <span>{t("rel.today")}</span>
                        <span>{t("rel.reliable")}</span>
                        <span>{t("rel.trend")}</span>
                        <span>{t("rel.d14")}</span>
                      </div>
                    </div>

                    {/* ── Baner ostrzegawczy dla odległych dat ── */}
                    {daysUntilTrip > 3 && (
                      <div className={`mx-3 mt-2 mb-1 rounded-lg px-3 py-2 text-xs flex gap-2 items-start ${
                        daysUntilTrip > 7
                          ? isDark ? "bg-amber-400/10 border border-amber-400/30 text-amber-300" : "bg-amber-50 border border-amber-300 text-amber-800"
                          : isDark ? "bg-sky-400/10 border border-sky-400/25 text-sky-300"    : "bg-sky-50 border border-sky-300 text-sky-800"
                      }`}>
                        <span className="text-base leading-none">{daysUntilTrip > 7 ? "⚠️" : "ℹ️"}</span>
                        <span>{t(daysUntilTrip > 7 ? "rel.high" : "rel.medium", { days: daysUntilTrip })}</span>
                      </div>
                    )}
                  </>
                )}

                {forecastRows.length > 0 && (
                  <>
                    <table className="min-w-full text-xs">
                      <thead className={`sticky top-0 ${isDark ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-800"}`}>
                        <tr>
                          <th className="px-2 py-2 text-left whitespace-nowrap">Km</th>
                          <th className="px-2 py-2 text-left whitespace-nowrap">{t("weather.col.time")}</th>
                          <th className="px-2 py-2 text-left whitespace-nowrap">{t("weather.col.temp")} {tempUnit}</th>
                          <th className="px-2 py-2 text-left whitespace-nowrap">{t("weather.col.feels")}</th>
                          <th className="px-2 py-2 text-left whitespace-nowrap">{t("weather.col.prob")}</th>
                          <th className="px-2 py-2 text-left whitespace-nowrap">{t("weather.col.rain")}</th>
                          <th className="px-2 py-2 text-left whitespace-nowrap">{t("weather.col.wind")} {windUnit}</th>
                          <th className="px-2 py-2 text-left whitespace-nowrap">{t("weather.col.gusts")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecastRows.map((row) => {
                          const meta = getConditionMeta(row.weatherCode);
                          const bg   = rowBackground(row.weatherCode, row.precipitationProbability, row.windKmh);
                          const conf = confidenceBadge(row.precipitationProbability);
                          const rowDay = daysUntilTrip + row.etaMinutes / 60 / 24;
                          const rowOpacity = rowDay > 7 ? "opacity-55" : rowDay > 5 ? "opacity-75" : "";
                          return (
                            <tr
                              key={row.segmentId + row.etaMinutes}
                              title={`${t(meta.labelKey)}${conf.labelKey ? ` · ${t(conf.labelKey)} (${conf.pct})` : ""}`}
                              style={bg ? { background: bg } : undefined}
                              className={`${isDark ? "border-t border-slate-700/60" : "border-t border-slate-200"} ${rowOpacity}`}
                            >
                              <td className="px-2 py-1.5 tabular-nums font-medium whitespace-nowrap">
                                {Math.round(row.distanceKmFromStart)} km
                              </td>
                              <td className="px-2 py-1.5 whitespace-nowrap">
                                <span className="mr-1">{meta.icon}</span>{row.plannedAtRouteTz}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">{fmtTemp(row.temperatureC)}</td>
                              <td className="px-2 py-1.5 tabular-nums">{fmtTemp(row.apparentTemperatureC)}</td>
                              <td className="px-2 py-1.5">
                                <span style={{ color: conf.color }} className="font-semibold">{conf.pct}</span>
                                {conf.labelKey && <span className={`ml-1 text-[10px] ${isDark ? "opacity-60" : "opacity-50"}`}>{t(conf.labelKey)}</span>}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">{row.rainMm ?? row.precipitationMm ?? "—"}</td>
                              <td className="px-2 py-1.5 tabular-nums">{fmtWind(row.windKmh)}</td>
                              <td className="px-2 py-1.5 tabular-nums">{fmtWind(row.windGustsKmh)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className={`px-3 py-2 text-[10px] opacity-50 border-t ${panelBorder}`}>
                      {t("weather.legend")}
                      <br />
                      {t("weather.legend2")}
                    </div>
                  </>
                )}
              </div>

              {forecastRows.length > 0 && (
                <div className={`shrink-0 border-t p-3 flex items-center gap-2 ${panelBorder}`}>
                  <input
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    placeholder={t("weather.email")}
                    className={`min-w-0 flex-1 rounded border px-2 py-1.5 text-xs outline-none ring-cyan-400/40 focus:ring ${isDark ? "border-slate-700 bg-slate-900 text-slate-200 placeholder-slate-600" : "border-slate-300 bg-white text-slate-800 placeholder-slate-400"}`}
                  />
                  <button
                    type="button"
                    onClick={handleCalendarClick}
                    disabled={forecastRows.length === 0}
                    title={forecastError ? "Prognoza jest niekompletna — uzupełnij dane przed pobraniem" : undefined}
                    className={`shrink-0 rounded px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25" : "bg-cyan-100 text-cyan-800 hover:bg-cyan-200"}`}>
                    📅 {t("weather.calendar")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── SETTINGS TAB ──────────────────────────────────────────────── */}
          {activeTab === "settings" && (
            <div className="h-full overflow-y-auto">
              <div className="p-4 space-y-4">
                <div className={`flex items-center justify-between pb-3 border-b ${panelBorder}`}>
                  <span className="font-semibold">{t("settings.title")}</span>
                  <button type="button" onClick={toggleTheme}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${isDark ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20" : "border-slate-400 bg-slate-200 text-slate-800 hover:bg-slate-300"}`}>
                    {isDark ? t("settings.theme.light") : t("settings.theme.dark")}
                  </button>
                </div>

                {/* Przełącznik języka */}
                <label className={labelCls}>
                  {t("settings.language")}
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value as typeof lang)}
                    className={inputCls}
                  >
                    {LANGS.map((l) => (
                      <option key={l} value={l}>{LANG_LABELS[l]}</option>
                    ))}
                  </select>
                </label>

                <label className={labelCls}>
                  {t("settings.speed")}
                  <input type="number" min={1} max={200} step={1} value={averageSpeedKmh}
                    onChange={(e) => {
                      const v = Math.min(200, Math.max(1, Number(e.target.value) || 1));
                      setAverageSpeedKmh(v);
                    }}
                    className={inputCls} />
                </label>

                <label className={labelCls}>
                  {t("settings.startTime")}
                  <input type="datetime-local" value={routeStartAt} max={maxForecastDate}
                    onChange={(e) => setRouteStartAt(e.target.value)}
                    className={inputCls} />
                </label>

                {/* Zasięg POI */}
                <label className={labelCls}>
                  {t("settings.poiRadius")}
                  <select
                    value={poiRadius}
                    onChange={(e) => setPoiRadius(Number(e.target.value))}
                    className={inputCls}
                  >
                    <option value={250}>{t("radius.250")}</option>
                    <option value={500}>{t("radius.500")}</option>
                    <option value={1000}>{t("radius.1000")}</option>
                    <option value={2000}>{t("radius.2000")}</option>
                  </select>
                </label>

                {/* Jednostki */}
                <div className="flex gap-3">
                  <label className={`${labelCls} flex-1`}>
                    {t("settings.tempUnit")}
                    <select value={tempUnit} onChange={(e) => setTempUnit(e.target.value as typeof tempUnit)} className={inputCls}>
                      <option value="°C">°C — Celsius</option>
                      <option value="°F">°F — Fahrenheit</option>
                    </select>
                  </label>
                  <label className={`${labelCls} flex-1`}>
                    {t("settings.windUnit")}
                    <select value={windUnit} onChange={(e) => setWindUnit(e.target.value as typeof windUnit)} className={inputCls}>
                      <option value="km/h">km/h</option>
                      <option value="m/s">m/s</option>
                      <option value="mph">mph</option>
                      <option value="kn">kn</option>
                    </select>
                  </label>
                </div>

                <label className={`block rounded-lg border p-3 text-sm ${isDark ? "border-slate-700 bg-slate-900/60 text-slate-300" : "border-slate-300 bg-slate-50 text-slate-700"}`}>
                  <span className={`mb-2 block font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                    {t("settings.loadRoute")}
                  </span>
                  <input
                    type="file"
                    accept=".geojson,.gpx,.kml,.kmz,.tcx,.csv,application/geo+json,application/json"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleRouteUpload(f); }}
                    className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-xs file:font-semibold"
                  />
                  {fileLoading && (
                    <p className="mt-2 text-xs opacity-60 animate-pulse">{t("settings.fileLoading")}</p>
                  )}
                </label>

                {DEMO_ROUTES.map((route) => (
                  <button key={route.file} type="button" onClick={() => void loadPublicRoute(route.file)}
                    className={`w-full rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${isDark ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20" : "border-slate-400 bg-slate-200 text-slate-800 hover:bg-slate-300"}`}>
                    {route.label}
                  </button>
                ))}

                {routeError && <div className={errorCls}>{routeError}</div>}
                {forecastError && <div className={errorCls}>{forecastError}</div>}

                {segments.length > 0 && (
                  <div className={`rounded-lg border px-3 py-2 text-xs ${isDark ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>
                    {t("settings.routeLoaded", { count: segments.length })}
                    {forecastLoading && <span className="opacity-70"> · {t("settings.calculating")}</span>}
                    {!forecastLoading && forecastRows.length > 0 && <span> · {t("settings.forecastReady")}</span>}
                  </div>
                )}

                {/* Feedback */}
                <a
                  href="https://forms.gle/64f6EzipvNAHdvfFA"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-opacity hover:opacity-80 ${isDark ? "border-slate-700 bg-slate-900/60 text-slate-300" : "border-slate-300 bg-slate-50 text-slate-700"}`}
                >
                  <span className="text-base">💬</span>
                  <span>
                    <span className="font-semibold">{t("settings.feedback.title")}</span>
                    <span className={`block ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("settings.feedback.subtitle")}</span>
                  </span>
                  <span className={`ml-auto text-[10px] ${isDark ? "text-slate-600" : "text-slate-400"}`}>↗</span>
                </a>

                {/* Footer */}
                <div className={`pt-1 text-center text-[11px] ${isDark ? "text-slate-600" : "text-slate-400"}`}>
                  Made by{" "}
                  <a
                    href="https://github.com/Kacperpe"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`font-semibold transition-colors hover:underline ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    Kacperpe
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <AppNav activeTab={activeTab} onTabChange={setActiveTab} isDark={isDark} alertCount={weatherAlerts.length} />
    </div>
  );
}
