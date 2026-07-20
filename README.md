# Analizator Finansów

Aplikacja do śledzenia wydatków, zarobków i oszczędności w ujęciu **miesięcznym**. Ten sam kod działa w dwóch trybach:

- **Na komputerze** – jako aplikacja desktopowa (Electron); dane w pliku JSON na dysku.
- **Na telefonie** – jako PWA (aplikacja webowa instalowana na ekran główny); dane w pamięci przeglądarki, kopie przez Eksport/Import.

## Wersja na telefon (PWA)

Aplikacja jest hostowana na GitHub Pages. Na telefonie:

1. Otwórz w przeglądarce adres GitHub Pages (patrz zakładka **Settings → Pages** w repozytorium).
2. **iPhone (Safari):** przycisk *Udostępnij* → **Dodaj do ekranu głównego**.
   **Android (Chrome):** menu ⋮ → **Zainstaluj aplikację / Dodaj do ekranu głównego**.
3. Pojawi się ikona jak przy zwykłej apce; działa też offline.

Dane telefonu i komputera są **osobne**. Aby je przenieść, użyj **⬇ Eksportuj** na jednym urządzeniu i **⬆ Importuj** na drugim (plik `finanse-kopia.json`).

## Uruchamianie

**Najprościej:** kliknij dwukrotnie plik **`Uruchom.cmd`**.

Alternatywnie z terminala w folderze projektu:

```powershell
npm start
```

> Jeśli `npm start` zgłasza błąd `Cannot read properties of undefined (reading 'whenReady')`,
> oznacza to, że w środowisku ustawiona jest zmienna `ELECTRON_RUN_AS_NODE=1`.
> Użyj wtedy `Uruchom.cmd`, który ją czyści, albo w PowerShell wpisz:
> `Remove-Item Env:ELECTRON_RUN_AS_NODE; npm start`

## Gdzie są moje dane?

W pliku **`dane/finanse.json`** w folderze aplikacji. Pełną ścieżkę widać na dole okna.
Przyciski w stopce:
- **📁 Otwórz folder** – otwiera folder z plikiem danych,
- **⬇ Eksportuj** – zapisuje kopię zapasową w wybranym miejscu,
- **⬆ Importuj** – wczytuje dane z pliku (zastępuje obecne).

## Funkcje

- **Nawigacja po miesiącach** (◀ ▶) – każdy miesiąc to osobny zestaw danych.
- **Stan konta na start** i **otrzymana pensja** – edytowalne pola; saldo z poprzedniego miesiąca można przenieść jednym kliknięciem.
- **Dodawanie wydatków** – kategoria, nazwa/opis, kwota, data.
- **Kategorie** – własne, zarządzane przez ikonę ⚙ (np. „Zakupy w sklepie”).
- **Wpływ na pensję** – pasek pokazujący, ile procent pensji wydano, oraz stopę oszczędności.
- **Aktualny stan konta** – liczone na bieżąco: `stan na start + pensja − wydatki`, wraz ze zmianą od początku miesiąca.
- **Wykres kołowy** wydatków wg kategorii.
- **Lista wydatków** – grupowana wg kategorii lub chronologiczna.
- **Porównanie miesięcy** – słupki pensja / wydatki / oszczędności z ostatnich 6 miesięcy.

## Struktura projektu

| Plik | Rola |
|------|------|
| `main.js` | Proces główny Electron: okno + odczyt/zapis pliku JSON |
| `preload.js` | Bezpieczny most między interfejsem a systemem plików |
| `index.html` | Struktura interfejsu |
| `styles.css` | Wygląd |
| `renderer.js` | Logika interfejsu i wykresy (SVG, bez zewnętrznych bibliotek) |
| `dane/finanse.json` | Twoje dane (tworzony przy pierwszym zapisie) |
