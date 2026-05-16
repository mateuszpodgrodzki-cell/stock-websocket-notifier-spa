# Stock WebSocket Notifier SPA

Praca wykonana przez Mateusza Podgrodzkiego (nr albumu 34474) w ramach przedmiotu Technologie internetowe, studia niestacjonarne, 8. semestr. Data prezentacji na zajęciach: 25.04.2026.

Jednostronicowa aplikacja webowa (SPA) do prezentowania symulowanych kursów akcji w czasie rzeczywistym. Backend generuje dane giełdowe, przechowuje historię notowań i wysyła aktualizacje do frontendu przez WebSocket co 5 sekund.

## Zakres projektu

Projekt łączy dwa zakresy pracy:

- konteneryzację aplikacji SPA w React z wieloetapowym buildem i serwowaniem gotowych plików przez Nginx,
- system powiadomień giełdowych WebSocket, w którym backend wysyła symulowane kursy akcji do frontendu bez odświeżania strony.

## Funkcje

- symulowane notowania akcji,
- aktualizacja cen co 5 sekund,
- komunikacja w czasie rzeczywistym przez WebSocket,
- historia notowań z ostatnich 3 miesięcy,
- zakresy wykresu: 1D, 1W, 1M, 3M, ALL,
- wykres z osiami, cenami, datami i tooltipem,
- kolorowanie odcinków wykresu: zielony oznacza wzrost, czerwony spadek, a niebieski brak zmiany względem poprzedniego punktu,
- tabela aktualnych notowań,
- watchlista zapisywana w przeglądarce,
- alerty cenowe zapisywane w przeglądarce,
- przejście z alertu do wykresu danej spółki,
- wyszukiwarka spółek,
- filtr sektorów,
- sortowanie tabeli,
- frontend typu SPA,
- konteneryzacja przy użyciu Docker i Docker Compose.

## Uruchomienie

```bash
cp .env.example .env
docker compose up -d --build
```

Jeżeli używana jest starsza wersja Docker Compose:

```bash
docker-compose up -d --build
```

Frontend:

```text
http://localhost:5173
```

Backend:

```text
http://localhost:4000
```

Healthcheck:

```text
http://localhost:4000/health
```

## Architektura

Projekt składa się z dwóch usług uruchamianych przez Docker Compose:

- `backend` - aplikacja Node.js z Express i Socket.IO. Generuje przykładowe notowania, przechowuje historię kursów w pamięci procesu, udostępnia endpointy REST i wysyła aktualizacje cen przez WebSocket.
- `frontend` - aplikacja SPA w React, budowana przez Vite. Po zbudowaniu statyczne pliki są serwowane przez Nginx. Frontend pobiera dane początkowe przez REST, a dalsze aktualizacje odbiera z Socket.IO.

Przepływ danych:

```text
Backend Node.js -> REST API / Socket.IO -> Frontend React -> przeglądarka użytkownika
```

Watchlista i alerty cenowe są zapisywane lokalnie w przeglądarce (`localStorage`). Backend nie korzysta z bazy danych, dlatego po restarcie kontenera generuje nową historię notowań.

## Endpointy

```text
GET /health
GET /api/stocks
GET /api/history/:symbol?range=1D
GET /api/history/:symbol?range=1W
GET /api/history/:symbol?range=1M
GET /api/history/:symbol?range=3M
GET /api/history/:symbol?range=ALL
```

## Zmienne środowiskowe

Konfiguracja projektu znajduje się w pliku `.env`. W repozytorium powinien być przechowywany tylko plik `.env.example`, a lokalny `.env` jest ignorowany przez Git.

```env
BACKEND_PORT=4000
FRONTEND_PORT=5173
TICK_INTERVAL_MS=5000
CORS_ORIGIN=http://localhost:5173
VITE_WS_URL=http://localhost:4000
```

## Wymagania techniczne

- Repozytorium Git: projekt należy oddać jako link do GitHuba albo GitLaba.
- README: dokumentacja zawiera instrukcję uruchomienia przez Docker Compose oraz opis architektury aplikacji.
- Optymalizacja obrazów: backend używa obrazu `node:20-alpine`, frontend jest budowany na `node:20-alpine`, a gotowa aplikacja jest serwowana przez `nginx:1.27-alpine`.
- Zmienne środowiskowe: porty, adres backendu, CORS i interwał aktualizacji są konfigurowane przez `.env`; w projekcie nie ma hardkodowanych haseł ani sekretów.

## Technologie

- Node.js,
- Express,
- Socket.IO,
- React,
- Vite,
- Nginx,
- Docker,
- Docker Compose.
