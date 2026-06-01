# Next 16 Security Upgrade Protocol (AUDIT-SEC-7)

Cel: usunac tymczasowa akceptacje ryzyka `postcss < 8.5.10` wynikajaca z zaleznosci `next@16.2.6`.

## 1) Branch i baseline

```bash
git checkout -b chore/next16-postcss-remediation
npm ci
npm test
npm run lint
npm run build
npm audit --omit=dev
```

Warunek przejscia:
- wszystkie testy/lint/build zielone na baseline
- audit nadal pokazuje tylko znane 2 moderate z `next -> postcss`

## 2) Wybierz strategię

Opcja A (preferowana):
- upgrade do stabilnego `next@16.x`, ktory ma `node_modules/next/node_modules/postcss >= 8.5.10`

Opcja B (awaryjna):
- test canary `next@16.3.0-canary.x` jesli brak stabilnej poprawki i compliance wymaga czystego audytu

## 3) Aktualizacja zaleznosci

```bash
npm i next@latest eslint-config-next@latest
```

Jesli wersje maja byc przypiete recznie:

```bash
npm i next@<wersja> eslint-config-next@<wersja>
```

## 4) Weryfikacja techniczna

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

Warunek przejscia:
- brak regresji w test/lint/build
- `npm audit --omit=dev` nie pokazuje juz `postcss < 8.5.10` przez `next`

## 5) Smoke test funkcjonalny

Uruchom:

```bash
npm run dev
```

Sprawdz recznie:
- `/` wczytanie trasy GPX/KML/KMZ/CSV
- `/api/weather/point` oraz `/api/pois`
- logowanie/rejestracja `/login`, `/register`
- eksport ICS
- brak bledow hydration w konsoli

## 6) Rollback plan

Jesli downgrade UX/stabilnosci:

```bash
git restore package.json package-lock.json
npm ci
npm test && npm run lint && npm run build
```

## 7) Zamkniecie AUDIT-SEC-7

Po przejsciu:
- zaktualizowac wpis `AUDIT-SEC-7` w `todo.md`:
  - usunac tymczasowa akceptacje
  - wpisac docelowa wersje Next i date zamkniecia
- dodac krotki changelog ryzyka: co usunieto, jakie byly testy i wynik audytu.
