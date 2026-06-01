import type { WeatherPointForecast } from "@/types/weather-point-forecast";

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}@mapapogody`;
}

function buildEvent({
  dtstart,
  dtend,
  summary,
  description,
  alarmMinutes,
  notifyEmail,
}: {
  dtstart: Date;
  dtend: Date;
  summary: string;
  description: string;
  alarmMinutes?: number;
  notifyEmail?: string;
}): string {
  const sanitizedEmail = notifyEmail?.replace(/[\r\n\0]/g, "").trim();
  const validEmail = sanitizedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid()}`,
    `DTSTART:${icsDate(dtstart)}`,
    `DTEND:${icsDate(dtend)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
  ];
  if (alarmMinutes !== undefined) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:-PT${alarmMinutes}M`,
      `DESCRIPTION:${esc(summary)}`,
      "END:VALARM",
    );
    if (validEmail) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:EMAIL",
        `TRIGGER:-PT${alarmMinutes}M`,
        `SUMMARY:${esc(summary)}`,
        `DESCRIPTION:${esc(description)}`,
        `ATTENDEE:mailto:${sanitizedEmail}`,
        "END:VALARM",
      );
    }
  }
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

type AlertKind = "storm" | "snow" | "rain" | "wind" | "cold" | "hot";

type Alert = WeatherPointForecast & { kind: AlertKind };

const ALERT_META: Record<AlertKind, { emoji: string; label: string }> = {
  storm: { emoji: "⛈",  label: "Burza" },
  snow:  { emoji: "❄️", label: "Śnieg" },
  rain:  { emoji: "🌧",  label: "Deszcz" },
  wind:  { emoji: "💨",  label: "Silny wiatr" },
  cold:  { emoji: "🥶",  label: "Zimno" },
  hot:   { emoji: "🌡",  label: "Upał" },
};

function detectAlerts(rows: WeatherPointForecast[]): Alert[] {
  const alerts: Alert[] = [];
  for (const row of rows) {
    const code = row.weatherCode ?? 0;
    const hasPrecip = (row.precipitationProbability ?? 0) >= 40 || (row.precipitationMm ?? 0) > 0 || (row.rainMm ?? 0) > 0;
    if (code >= 95) alerts.push({ ...row, kind: "storm" });
    else if (code >= 71 && code <= 77) alerts.push({ ...row, kind: "snow" });
    else if (hasPrecip) alerts.push({ ...row, kind: "rain" });
    if ((row.windKmh ?? 0) > 50) alerts.push({ ...row, kind: "wind" });
    if (row.temperatureC !== null && row.temperatureC < 8) alerts.push({ ...row, kind: "cold" });
    if (row.temperatureC !== null && row.temperatureC > 30) alerts.push({ ...row, kind: "hot" });
  }
  return alerts;
}

function alertEmoji(kind: AlertKind): string {
  return ALERT_META[kind].emoji;
}

function alertLabel(kind: AlertKind): string {
  return ALERT_META[kind].label;
}

function parseDatetimeLocal(value: string): Date {
  // datetime-local input returns "YYYY-MM-DDTHH:mm" without timezone.
  // new Date(str) has historically treated such strings as UTC in some browsers —
  // using explicit Date(year, month, day, h, m) always yields local time.
  const [datePart = "", timePart = "00:00"] = value.split("T");
  const [year = 0, month = 1, day = 1] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function generateRouteIcs(
  forecastRows: WeatherPointForecast[],
  routeStartAt: string,
  notifyEmail?: string,
): string {
  const routeStart = parseDatetimeLocal(routeStartAt);
  const lastRow = forecastRows[forecastRows.length - 1];
  const routeEnd = lastRow
    ? new Date(routeStart.getTime() + lastRow.etaMinutes * 60_000)
    : new Date(routeStart.getTime() + 60 * 60_000);

  const alerts = detectAlerts(forecastRows);

  let summaryDesc: string;
  if (alerts.length === 0) {
    summaryDesc = "Brak alertow pogodowych — dobra pogoda na trasie!";
  } else {
    summaryDesc = `Alerty pogodowe na trasie (${alerts.length}):\n`;
    for (const a of alerts) {
      const emoji = alertEmoji(a.kind);
      const label = alertLabel(a.kind);
      const details =
        a.kind === "wind"
          ? `${a.windKmh ?? 0} km/h`
          : `${a.rainMm ?? a.precipitationMm ?? 0}mm (${a.precipitationProbability ?? 0}%)`;
      summaryDesc += `${emoji} ${a.plannedAtRouteTz} — ${label}: ${details}\n`;
    }
  }

  const events: string[] = [];

  // Route summary — reminder 60 min before start so you know before leaving
  events.push(buildEvent({
    dtstart: routeStart,
    dtend: routeEnd,
    summary: "Trasa rowerowa — prognoza pogody",
    description: summaryDesc,
    alarmMinutes: 60,
    notifyEmail,
  }));

  // Individual alert events with 30-min reminders
  for (const alert of alerts) {
    const alertTime = new Date(routeStart.getTime() + alert.etaMinutes * 60_000);
    const alertEnd = new Date(alertTime.getTime() + 15 * 60_000);
    const emoji = alertEmoji(alert.kind);
    const label = alertLabel(alert.kind);

    const detail =
      alert.kind === "wind"
        ? `Predkosc wiatru: ${alert.windKmh ?? 0} km/h`
        : `Deszcz: ${alert.rainMm ?? alert.precipitationMm ?? 0}mm\nSzansa opadu: ${alert.precipitationProbability ?? 0}%\nWiatr: ${alert.windKmh ?? "-"} km/h`;

    events.push(buildEvent({
      dtstart: alertTime,
      dtend: alertEnd,
      summary: `${emoji} ${label} na trasie — ${alert.plannedAtRouteTz}`,
      description: detail,
      alarmMinutes: 30,
      notifyEmail,
    }));
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MapaPogodyRowerzysty//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
