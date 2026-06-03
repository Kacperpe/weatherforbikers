export type WeatherPointForecast = {
  segmentId: string;
  etaMinutes: number;
  distanceKmFromStart: number;
  lat: number;
  lon: number;
  plannedAtRouteTz: string;
  sampledAtRouteTz: string;
  timezone: string;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  precipitationProbability: number | null;
  precipitationMm: number | null;
  rainMm: number | null;
  windKmh: number | null;
  windGustsKmh: number | null;
  windDirectionDeg: number | null;
  weatherCode: number | null;
};
