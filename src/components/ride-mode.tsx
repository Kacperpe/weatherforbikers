"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteSegment } from "@/types/route-segment";
import type { WeatherAlert } from "@/types/weather-alert";

type Props = {
  segments: RouteSegment[];
  alerts: WeatherAlert[];
  isDark: boolean;
  onLocationChange: (location: [number, number] | null) => void;
};

type RidePosition = {
  lat: number;
  lon: number;
  accuracy: number;
  distanceKm: number;
  etaMinutes: number;
};

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findRouteProgress(position: GeolocationPosition, segments: RouteSegment[]): RidePosition {
  let closest = segments[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    const startDistance = distanceKm(position.coords.latitude, position.coords.longitude, segment.from[1], segment.from[0]);
    const endDistance = distanceKm(position.coords.latitude, position.coords.longitude, segment.to[1], segment.to[0]);
    if (Math.min(startDistance, endDistance) < closestDistance) {
      closest = segment;
      closestDistance = Math.min(startDistance, endDistance);
    }
  }
  return {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    distanceKm: closest.cumulativeDistanceKm,
    etaMinutes: closest.etaMinutesFromStart,
  };
}

async function showRideNotification(title: string, body: string, tag: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options = { body, tag, renotify: true, icon: "/favicon.ico" };
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
  } else {
    new Notification(title, options);
  }
}

export function RideMode({ segments, alerts, isDark, onLocationChange }: Props) {
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState<RidePosition | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const [locationError, setLocationError] = useState<string | null>(null);
  const notifiedAlerts = useRef(new Set<string>());

  useEffect(() => {
    if (!active || segments.length === 0) return;

    const watchId = navigator.geolocation.watchPosition(
      (nextPosition) => {
        setLocationError(null);
        const progress = findRouteProgress(nextPosition, segments);
        setPosition(progress);
        onLocationChange([progress.lat, progress.lon]);

        for (const alert of alerts) {
          const minutesAway = alert.etaMinutes - progress.etaMinutes;
          const alertKey = `${alert.segmentId}:${alert.kinds.join(",")}`;
          if (minutesAway >= 0 && minutesAway <= 20 && !notifiedAlerts.current.has(alertKey)) {
            notifiedAlerts.current.add(alertKey);
            void showRideNotification(
              "Pogoda na trasie",
              `Zagrożenie za około ${Math.max(1, Math.round(minutesAway))} min, kilometr ${Math.round(alert.distanceKmFromStart)}.`,
              alertKey,
            );
          }
        }
      },
      (error) => setLocationError(error.message || "Nie udało się odczytać lokalizacji."),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [active, alerts, onLocationChange, segments]);

  const nextAlert = useMemo(() => {
    if (!position) return null;
    return alerts.find((alert) => alert.etaMinutes >= position.etaMinutes);
  }, [alerts, position]);

  async function startRide() {
    if (segments.length === 0 || active) return;
    if (!("geolocation" in navigator)) {
      setLocationError("Ta przeglądarka nie udostępnia lokalizacji.");
      return;
    }
    if ("Notification" in window && Notification.permission === "default") {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
    }
    setLocationError(null);
    setActive(true);
  }

  function stopRide() {
    setActive(false);
    setPosition(null);
    onLocationChange(null);
    notifiedAlerts.current.clear();
  }

  if (segments.length === 0) return null;

  const panel = isDark
    ? "border-slate-700 bg-slate-950/95 text-slate-100"
    : "border-slate-300 bg-white/95 text-slate-900";

  return (
    <section className={`absolute right-3 top-3 z-[1100] w-[min(23rem,calc(100vw-1.5rem))] rounded-xl border p-3 shadow-2xl backdrop-blur ${panel}`}>
      {!active ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Tryb jazdy</p>
            <p className="mt-0.5 text-xs opacity-60">GPS i ostrzeżenia pogodowe na trasie</p>
          </div>
          <button type="button" onClick={() => void startRide()} className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400">
            Rozpocznij
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500">Jazda aktywna</p>
              <p className="mt-1 text-lg font-semibold">
                {position ? `${Math.round(position.distanceKm)} km` : "Szukam GPS..."}
              </p>
            </div>
            <button type="button" onClick={stopRide} className="rounded-md border border-current px-2 py-1 text-xs font-semibold opacity-70 hover:opacity-100">
              Zakończ
            </button>
          </div>
          {position && <p className="mt-1 text-xs opacity-60">Dokładność GPS: około {Math.round(position.accuracy)} m</p>}
          {nextAlert && position && (
            <p className="mt-3 rounded-lg bg-amber-400/15 px-2.5 py-2 text-xs leading-5 text-amber-500">
              Najbliższy alert za około {Math.max(1, Math.round(nextAlert.etaMinutes - position.etaMinutes))} min, kilometr {Math.round(nextAlert.distanceKmFromStart)}.
            </p>
          )}
          {permission === "denied" && <p className="mt-2 text-xs text-rose-500">Powiadomienia są zablokowane w ustawieniach przeglądarki.</p>}
          {locationError && <p className="mt-2 text-xs text-rose-500">{locationError}</p>}
        </div>
      )}
    </section>
  );
}
