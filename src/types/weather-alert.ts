import type { WeatherPointForecast } from "./weather-point-forecast";

export type WeatherAlertKind = "storm" | "snow" | "rain" | "wind" | "cold" | "hot";

export type WeatherAlert = WeatherPointForecast & {
  kinds: WeatherAlertKind[];
};
