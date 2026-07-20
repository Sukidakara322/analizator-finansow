// ================= Warstwa przechowywania danych =================
// Jeden kod działa w dwóch środowiskach:
//  • Electron (komputer)  -> dane zapisywane do pliku JSON na dysku (przez window.api z preload.js)
//  • Przeglądarka / PWA (telefon) -> dane w localStorage, kopie przez pobranie/wczytanie pliku JSON
// Interfejs (renderer.js) korzysta wyłącznie z window.store i nie wie, gdzie faktycznie lądują dane.

(function () {
  const DEFAULT_CATEGORIES = ['Jedzenie', 'Transport', 'Rachunki', 'Rozrywka', 'Zdrowie', 'Ubrania', 'Inne'];

  function defaultData() {
    return { version: 1, categories: [...DEFAULT_CATEGORIES], months: {} };
  }

  function normalize(parsed) {
    if (!parsed || typeof parsed !== 'object') return defaultData();
    if (!Array.isArray(parsed.categories) || parsed.categories.length === 0) parsed.categories = [...DEFAULT_CATEGORIES];
    if (!parsed.months || typeof parsed.months !== 'object') parsed.months = {};
    if (!parsed.version) parsed.version = 1;
    return parsed;
  }

  // ---- Środowisko Electron: użyj mostu z preload.js ----
  if (window.api) {
    window.store = Object.assign({ isElectron: true }, window.api);
    return;
  }

  // ---- Środowisko przeglądarki / PWA ----
  const KEY = 'analizator-finanse-v1';

  window.store = {
    isElectron: false,

    async load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return defaultData();
        return normalize(JSON.parse(raw));
      } catch (e) {
        console.error('Błąd odczytu danych:', e);
        return defaultData();
      }
    },

    async save(data) {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        console.error('Błąd zapisu danych:', e);
        return false;
      }
    },

    async getPath() {
      return 'Pamięć telefonu (przeglądarka) · kopia przez Eksport';
    },

    async openFolder() {
      // Na telefonie nie ma "folderu" — funkcja nieaktywna.
      return false;
    },

    // Eksport: pobranie pliku JSON (na telefonie trafia do Pobranych / arkusza udostępniania)
    async exportData(data) {
      try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'finanse-kopia.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // Import: wybór pliku JSON i wczytanie do pamięci
    importData() {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = () => {
          const file = input.files && input.files[0];
          if (!file) { resolve({ ok: false }); return; }
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const parsed = normalize(JSON.parse(reader.result));
              localStorage.setItem(KEY, JSON.stringify(parsed));
              resolve({ ok: true, data: parsed });
            } catch (e) {
              resolve({ ok: false, error: e.message });
            }
          };
          reader.onerror = () => resolve({ ok: false, error: 'Nie udało się odczytać pliku' });
          reader.readAsText(file);
        };
        input.click();
      });
    }
  };

  // ---- Rejestracja service workera (tryb offline) — tylko po http(s), nie w Electron ----
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW:', e));
    });
  }
})();
