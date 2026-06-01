# TODO - Audyt aplikacji

## Krytyczne

- [x] `parse-route.ts` byl nieuzywany - import w `page.tsx` zostal przepiety.
- [x] Brak eksportow `toSegments` i `parseRouteGeoJson` - naprawione.
- [x] Brak `fflate` dla KMZ - dodane.
- [x] Zmiana predkosci nie przeliczala trasy - dodany re-parse po zmianie km/h.
- [x] `npm run build` byl blokowany przez martwy `/api/alerts` - endpoint usuniety.
- [x] `npm run lint` mial bledy React Compiler/Hooks - naprawione.

## Powazne

- [x] Slabe komunikaty bledow parserow - poprawione.
- [x] Za malo probek prognozy na krotkich trasach - dynamiczny interwal.
- [x] Braki mapowania kodow pogody 87-94 - uzupelnione.
- [x] Parser GeoJSON dla `Feature/MultiLineString` - poprawiony.
- [x] Spojnosc logiki alertow dla ICS i UI - ujednolicona.

## Srednie / Edge case

- [x] Clamp predkosci 1-200 km/h.
- [x] Lepszy opis alertow na mapie.
- [x] Eksport kalendarza przy czesciowej prognozie - odblokowany warunkowo.
- [x] `accept` rozszerzony o KML/KMZ/TCX/CSV.
- [x] `daysUntilTrip` na `Math.floor`.
- [x] `maxForecastDate` i walidacja daty z buforem.
- [x] Walidacja konca trasy wzgledem okna 16 dni.
- [x] Walidacja e-mail dla ICS (z fallbackiem bez `ATTENDEE`).

---

## SECURITY - przed produkcja

- [x] [SEC-1] XSS w popupach POI (escape HTML) - naprawione.
- [x] [SEC-2] Escape w pozostalych popupach Leaflet - naprawione.
- [x] [SEC-3] Sanitizacja i walidacja e-mail w ICS - naprawione.
- [x] [SEC-4] Jednostki temperatury/wiatru spojne w widokach - poprawione.

---

## OPSEC / EDGE AUDIT 2026-06-01

### Krytyczne przed dalszym rozwojem

- [x] **[AUDIT-BUILD-1]** Build blokowany przez stary `/api/alerts`.
  Model/task plan: `codex5.3`, thinking `medium`.
  Fix: usuniecie martwego endpointu i powiazanych artefaktow legacy.

- [x] **[AUDIT-BUILD-2]** Lint blokowany przez reguly React Hooks/Compiler.
  Model/task plan: `codex5.3`, thinking `medium`.
  Fix: poprawki purity, lazy init, wyniesienie komponentu sekcyjnego.

- [x] **[AUDIT-SEC-1]** Publiczny `/api/alerts` jako powierzchnia DoS.
  Model/task plan: `codex5.5`, thinking `high`.
  Fix: endpoint usuniety.

### Security / OPSEC

- [x] **[AUDIT-SEC-2]** Brak limitow uploadu tras.
  Model/task plan: `codex5.5` -> `codex5.3`.
  Fix: limity rozmiaru pliku i budzetu punktow (`route-limits`).

- [x] **[AUDIT-SEC-3]** Ryzyko zip-bomb w KMZ.
  Model/task plan: `codex5.5` -> `codex5.3`.
  Fix: limity liczby wpisow i rozmiaru po rozpakowaniu.

- [x] **[AUDIT-SEC-4]** Rate limit tylko in-memory.
  Model/task plan: `codex5.5`, thinking `high`.
  Fix: migracja na Upstash Redis (`@upstash/redis`, `@upstash/ratelimit`) z fallbackiem lokalnym.

- [x] **[AUDIT-SEC-5]** `/api/pois` zbyt szeroki bbox i wyciek bledow upstreamu.
  Model/task plan: `codex5.3`, thinking `medium`.
  Fix: mniejszy bbox, krotszy timeout, bez surowych bledow dostawcy.

- [x] **[AUDIT-SEC-6]** CSP oslabione przez `unsafe-eval`.
  Model/task plan: `codex5.5`, thinking `high`.
  Fix: `unsafe-eval` tylko w `development`, ostrzejszy wariant dla produkcji.

- [x] **[AUDIT-SEC-7]** `npm audit` (postcss przez Next).
  Model/task plan: `codex5.5`, thinking `medium`.
  Decision (2026-06-01): zrealizowano upgrade do `next@16.3.0-canary.36` i `eslint-config-next@16.3.0-canary.36`.
  Walidacja: `npm test` OK, `npm run lint` OK, `npm run build` OK, `npm audit --omit=dev` => `0 vulnerabilities`.
  Protocol: `context/changes/next16-security-upgrade-protocol.md`

### Gdzie uzytkownik moze cos zepsuc

- [x] **[AUDIT-EDGE-1]** Bardzo duza trasa moze zamrozic UI.
  Fix: limity i downsampling punktow trasy.

- [x] **[AUDIT-EDGE-2]** Dluga trasa / niska predkosc wychodzi poza okno prognozy.
  Fix: prewalidacja konca trasy przed requestami.

- [x] **[AUDIT-EDGE-3]** Data na granicy 16 dni przechodzila w UI, odpadala w API.
  Fix: wspolny bufor czasu w UI i API.

- [x] **[AUDIT-EDGE-4]** Dowolny e-mail do ICS.
  Fix: regex + pominiecie `ATTENDEE` dla niepoprawnego adresu.

### Deploy / konfiguracja

- [x] **[AUDIT-CONFIG-1]** `wrangler.jsonc` byl artefaktem Astro.
  Fix: usuniety.

---

## Dodatkowe wykonane kroki

- [x] Dodane testy parserow i limitow (`vitest` + `jsdom`).
- [x] Dodana konfiguracja testow i skrypt `npm test`.
