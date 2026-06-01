# Architektura projektu — Mapa Pogody Rowerzysty

## Stack technologiczny

```
Next.js 15 (App Router) + TypeScript
Supabase          — autoryzacja użytkowników
Leaflet           — mapa (ładowana dynamicznie, bez SSR)
Open-Meteo API    — dane pogodowe (zewnętrzne, bezpłatne)
Overpass API      — POI z OpenStreetMap (zewnętrzne, bezpłatne)
Tailwind CSS      — style
```

---

## Warstwy aplikacji

```
PRZEGLĄDARKA
│
├── 1. AUTH (login/rejestracja)
├── 2. APLIKACJA GŁÓWNA (mapa + pogoda + trasa)
│
SERWER (Next.js na Vercel)
│
├── 3. API POGODY  →  Open-Meteo
├── 4. API POI     →  Overpass (OSM)
└── 5. MIDDLEWARE  →  Supabase (sprawdza sesję)
```

---

## 1. Warstwa autoryzacji

```
/src/app/(auth)/
├── login/page.tsx          ← Server Component (tylko render)
├── login/login-form.tsx    ← "use client" — formularz + useLang()
├── register/page.tsx
├── register/register-form.tsx
└── actions.ts              ← "use server" — login(), register(), logout()
                               wywołuje Supabase Auth

/src/lib/supabase/
├── client.ts               ← Supabase client dla przeglądarki
└── server.ts               ← Supabase client dla serwera/SSR

/src/proxy-G4M32.ts         ← Middleware Next.js — przy każdym żądaniu
                               sprawdza sesję Supabase; jeśli brak → redirect /login
```

**Przepływ auth:**
```
Użytkownik → LoginForm → Server Action login() → Supabase → redirect "/"
Middleware → każda strona → sprawdź sesję → brak sesji → /login
```

---

## 2. Warstwa głównej aplikacji

```
/src/app/page.tsx           ← "use client" — CENTRUM WSZYSTKIEGO
                               zarządza całym stanem aplikacji
```

**Stan w `page.tsx`:**

| Zmienna stanu | Co przechowuje |
|---|---|
| `segments` | tablica `RouteSegment[]` — sparsowana trasa |
| `forecastRows` | tablica `WeatherPointForecast[]` — dane pogodowe |
| `weatherAlerts` | tablica alertów wyliczona z `forecastRows` |
| `averageSpeedKmh` | prędkość rowerzysty (wpływa na ETA każdego punktu) |
| `routeStartAt` | data/godzina startu trasy |
| `poiRadius` | zasięg filtrowania atrakcji od trasy |
| `tempUnit`, `windUnit` | jednostki wyświetlania |
| `activeTab` | która zakładka aktywna: map / weather / settings |

---

## 3. Warstwa parsowania trasy

```
Użytkownik uploaduje plik
         ↓
/src/lib/parse-route.ts     ← dispatcher po rozszerzeniu pliku
         ↓
┌─ .geojson / .json  → /src/lib/geojson.ts
├─ .gpx              → /src/lib/gpx.ts
├─ .kml              → /src/lib/kml.ts
├─ .kmz              → /src/lib/kml.ts  (unzip najpierw)
├─ .tcx              → /src/lib/tcx.ts
└─ .csv              → /src/lib/csv.ts
         ↓
RouteSegment[]        ← wspólny format wyjściowy
```

**Typ `RouteSegment`:**
```typescript
{
  id: string
  from: [lon, lat]              // punkt startowy segmentu
  to:   [lon, lat]              // punkt końcowy segmentu
  distanceKm: number            // długość tego segmentu
  cumulativeDistanceKm: number  // łączny km od startu
  etaMinutesFromStart: number   // kiedy tu dojedziemy (zależy od prędkości)
}
```

Każdy parser konwertuje swój format na tę strukturę. Prędkość × odległość = ETA.

---

## 4. Warstwa prognozy pogody

```
page.tsx: buildCheckpoints(segments)
    ↓
  max 24 punkty kontrolne (co ~30 min trasy)
    ↓
  Promise.allSettled() — równoległe fetche
    ↓
  /api/weather/point?lat=X&lon=Y&time=ISO
    ↓
  /src/app/api/weather/point/route.ts
    ↓
  https://api.open-meteo.com/v1/forecast
  (prosi o dane ±6h od planowanego czasu)
    ↓
  zwraca najbliższą godzinę → WeatherPointForecast
    ↓
  page.tsx: computeWeatherAlerts(forecastRows)
    ↓
  WeatherAlert[]  (burza/deszcz/wiatr/zimno/upał)
```

Open-Meteo — bezpłatne API, max 16 dni wprzód, bez klucza API.

---

## 5. Warstwa POI (atrakcje na trasie)

```
map-panel.tsx: oblicza bbox trasy (min/max lat/lon)
    ↓
  /api/pois?minLat=X&minLon=Y&maxLat=X&maxLon=Y
    ↓
  /src/app/api/pois/route.ts
    ↓
  Overpass API (3 serwery jako fallback)
  zapytanie o: restauracje, hotele, toalety,
  kempingi, atrakcje, sklepy, wodę pitną
    ↓
  cache in-memory (serwer) — TTL 1h, max 100 wpisów
    ↓
  Poi[]  → filtrowanie po odległości od trasy
           (isNearRoute — geometria segmentów)
    ↓
  filteredPois → RouteMap → markery na mapie
```

---

## 6. Warstwa mapy (Leaflet)

```
/src/components/map-panel.tsx   ← "use client"
│   zarządza POI, kategorią, widocznością
│
└── /src/components/route-map.tsx   ← "use client", dynamic import (ssr: false)
        Leaflet renderuje 4 warstwy:
        ├── TileLayer    — kafelki mapy (CARTO dark / OSM light)
        ├── routeLayer   — linia trasy + markery START/KONIEC
        ├── alertLayer   — kolorowe kółka z alertami pogodowymi
        └── poiLayer     — ikony atrakcji z popupami
```

Leaflet musi działać tylko w przeglądarce (używa `window`/`document`), dlatego `dynamic(() => import(...), { ssr: false })`.

---

## 7. Warstwa i18n (języki)

```
/src/lib/i18n/translations.ts   ← wszystkie stringi dla 11 języków
                                   klucze: "nav.map", "weather.title", "auth.loginBtn"...
/src/contexts/lang-context.tsx  ← React Context + localStorage
                                   eksportuje: lang, setLang, t()
```

**Użycie w dowolnym kliencie:**
```typescript
const { t, lang, setLang } = useLang();
t("weather.title")  // → "Prognoza pogody" / "Route Forecast" / ...
```

Język wybrany w Settings → zapisywany w `localStorage` → odczytywany przy kolejnej wizycie.

> **Uwaga dla Server Components:** `useLang()` działa tylko w `"use client"`. Strony serwerowe (`page.tsx`) nie mogą używać kontekstu — cały tekst do przetłumaczenia musi żyć w klienckich komponentach potomnych.

---

## 8. Eksport ICS (kalendarz)

```
page.tsx: downloadCalendar()
    ↓
/src/lib/ics.ts: generateRouteIcs(forecastRows, startAt, email?)
    ↓
  detectAlerts()  — te same reguły co computeWeatherAlerts()
    ↓
  tworzy VEVENT dla całej trasy + osobne VEVENT dla każdego alertu
  z VALARM (przypomnienie) i opcjonalnie powiadomieniem email
    ↓
  plik .ics → Blob → download w przeglądarce
```

---

## Diagram przepływu danych (główna ścieżka użytkownika)

```
[Upload pliku GPX/GeoJSON/KML/...]
        ↓
  parseRouteFile() — przeglądarka
        ↓
  RouteSegment[]  (segmenty z ETA)
        ↓
  buildCheckpoints() — max 24 pkt
        ↓
  fetch /api/weather/point × 24  (równolegle)
        ↓
  Open-Meteo API  ← zewnętrzne
        ↓
  WeatherPointForecast[]
        ↓
  ┌─ computeWeatherAlerts()  →  WeatherAlert[]
  │         ↓
  │   [Mapa] kółka alertów         [Panel pogody] tabela
  │
  └─ [ICS] generateRouteIcs()  →  pobierz .ics
```

---

## Mapa plików

```
src/
├── app/
│   ├── layout.tsx              root layout (ThemeProvider + LangProvider)
│   ├── page.tsx                GŁÓWNA STRONA — cały stan aplikacji
│   ├── (auth)/                 strony logowania (chronione middleware)
│   └── api/
│       ├── weather/point/      proxy do Open-Meteo
│       ├── pois/               proxy do Overpass (z cache)
│       └── alerts/             pomocniczy endpoint alertów
├── components/
│   ├── map-panel.tsx           panel POI + kontener mapy
│   ├── route-map.tsx           Leaflet (tylko klient)
│   ├── app-nav.tsx             dolna nawigacja (3 zakładki)
│   └── alerts-panel.tsx        panel alertów
├── lib/
│   ├── parse-route.ts          dispatcher formatów plików
│   ├── geojson/gpx/kml/tcx/csv.ts   parsery tras
│   ├── ics.ts                  generator kalendarza
│   ├── supabase/               klienty Supabase
│   └── i18n/translations.ts   wszystkie tłumaczenia
├── contexts/
│   └── lang-context.tsx        kontekst języka
└── types/
    ├── route-segment.ts        typ segmentu trasy
    ├── weather-point-forecast.ts  typ danych pogodowych
    ├── weather-alert.ts        typ alertu
    └── poi.ts                  typ miejsca na mapie
```

---

## Kluczowa zasada architektury

`page.tsx` to mózg całej aplikacji — trzyma stan i orkiestruje wszystko. `MapPanel` i `RouteMap` są read-only — dostają dane z góry przez props i tylko je wyświetlają.
