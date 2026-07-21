# Analizator Finansów

Aplikacja do śledzenia wydatków, zarobków i oszczędności w ujęciu **miesięcznym**. Działa na telefonie (PWA) i na komputerze, a dane są **przechowywane w chmurze (Firebase/Firestore) i synchronizowane na żywo** między urządzeniami.

## Logowanie i dane

- Przy pierwszym uruchomieniu zakładasz konto (**e-mail + hasło**) i logujesz się.
- Dane trafiają do chmury Firestore, do dokumentu `users/{twój-id}`. Reguły bezpieczeństwa sprawiają, że **tylko Ty masz do nich dostęp**.
- Zmiany synchronizują się **na żywo** – wpisujesz na telefonie, po chwili widać na komputerze (i odwrotnie).
- Działa **offline** – zmiany zapisują się lokalnie i dosyłają, gdy wróci internet.
- **⬇ Eksportuj / ⬆ Importuj** – kopia zapasowa / przeniesienie danych przez plik `finanse-kopia.json`.

Konfiguracja Firebase jest w [firebase-config.js](firebase-config.js). Zawarty tam `apiKey` jest publiczny z założenia (nie jest hasłem) – bezpieczeństwa pilnują logowanie i reguły Firestore.

## Widoki (dolna nawigacja)

Aplikacja jest podzielona na cztery zakładki (dolny pasek):
- **Miesiąc** – podsumowanie miesiąca i szybkie dodawanie wydatku,
- **Analiza** – podsumowanie miesiąca (KPI + wnioski), kategorie z trendem, trend salda i oszczędności, kategorie przez miesiące, porównanie miesięcy,
- **Historia** – lista wydatków (wg kategorii lub chronologicznie),
- **Ustawienia** – konto/wyloguj, zarządzanie kategoriami, eksport/import.

## Wersja na telefon (PWA)

Aplikacja jest hostowana na GitHub Pages. Na telefonie:

1. Otwórz adres GitHub Pages (patrz **Settings → Pages** w repozytorium).
2. **iPhone (Safari):** *Udostępnij* → **Dodaj do ekranu głównego**.
   **Android (Chrome):** menu ⋮ → **Zainstaluj aplikację / Dodaj do ekranu głównego**.
3. Pojawi się ikona jak przy zwykłej apce; działa też offline.
4. Zaloguj się swoim kontem – te same dane co na komputerze.

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
- **Początkowy stan konta** – podawany **raz, przy zakładaniu konta** (osobny krok po e-mailu i haśle). Potem saldo płynie automatycznie: „Stan konta na start" każdego miesiąca to kwota początkowa powiększona o (pensja − wydatki) wszystkich wcześniejszych miesięcy.
- **Otrzymana pensja** – jedyne edytowalne pole kwotowe w widoku miesiąca.
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
