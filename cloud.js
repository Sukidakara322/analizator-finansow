// ================= Warstwa chmury: Firebase Auth + Firestore =================
// Zastępuje localStorage. Dane trzymane są w chmurze (dokument users/{uid}),
// synchronizowane na żywo między urządzeniami, z obsługą pracy offline.
// Interfejs (renderer.js) korzysta z window.store i window.App tak samo jak wcześniej.

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  getFirestore, doc, getDoc, setDoc, onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js';

const LS_KEY = 'analizator-finanse-v1'; // stary klucz localStorage — do migracji danych z telefonu
const DEFAULT_CATEGORIES = ['Jedzenie', 'Transport', 'Rachunki', 'Rozrywka', 'Zdrowie', 'Ubrania', 'Inne'];

function defaultData() { return { version: 1, categories: [...DEFAULT_CATEGORIES], months: {} }; }
function normalize(p) {
  if (!p || typeof p !== 'object') return defaultData();
  if (!Array.isArray(p.categories) || p.categories.length === 0) p.categories = [...DEFAULT_CATEGORIES];
  if (!p.months || typeof p.months !== 'object') p.months = {};
  if (!p.version) p.version = 1;
  return p;
}

// --- Inicjalizacja Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let db;
try {
  // Pamięć podręczna na dysku -> praca offline i szybkie starty.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn('Firestore bez trwałej pamięci podręcznej:', e);
  db = getFirestore(app);
}

// --- Elementy ekranu logowania ---
const gate = document.getElementById('authGate');
const appRoot = document.getElementById('appRoot');
const elEmail = document.getElementById('authEmail');
const elPass = document.getElementById('authPass');
const elError = document.getElementById('authError');
const btnSignIn = document.getElementById('authSignIn');
const btnSignUp = document.getElementById('authSignUp');
const elBusy = document.getElementById('authBusy');

function setError(msg) { if (elError) elError.textContent = msg || ''; }
function setBusy(on) {
  if (btnSignIn) btnSignIn.disabled = on;
  if (btnSignUp) btnSignUp.disabled = on;
  if (elBusy) elBusy.hidden = !on;
}
function showGate() { if (gate) gate.hidden = false; if (appRoot) appRoot.hidden = true; }
function showApp() { if (gate) gate.hidden = true; if (appRoot) appRoot.hidden = false; }

// Tłumaczenie kodów błędów Firebase na komunikaty po polsku.
function plError(code) {
  const map = {
    'auth/invalid-email': 'Nieprawidłowy adres e-mail.',
    'auth/missing-password': 'Podaj hasło.',
    'auth/invalid-credential': 'Błędny e-mail lub hasło.',
    'auth/wrong-password': 'Błędne hasło.',
    'auth/user-not-found': 'Nie ma konta z tym adresem. Użyj „Utwórz nowe konto”.',
    'auth/email-already-in-use': 'Konto z tym adresem już istnieje. Zaloguj się.',
    'auth/weak-password': 'Hasło musi mieć co najmniej 6 znaków.',
    'auth/network-request-failed': 'Brak połączenia z siecią.',
    'auth/too-many-requests': 'Za dużo prób. Spróbuj później.'
  };
  return map[code] || ('Błąd: ' + code);
}

// --- Stan danych / synchronizacja ---
let userDocRef = null;
let currentData = defaultData();
let unsub = null;

// --- window.store: ten sam interfejs, którego używa renderer.js ---
window.store = {
  isElectron: false,
  isCloud: true,

  async load() { return currentData; },

  async save(data) {
    currentData = data;
    if (!userDocRef) return false;
    try {
      await setDoc(userDocRef, { json: JSON.stringify(data), updatedAt: Date.now() }, { merge: true });
      return true;
    } catch (e) {
      console.error('Błąd zapisu do chmury:', e);
      return false;
    }
  },

  async getPath() {
    const u = auth.currentUser;
    return u ? ('Chmura Firebase · ' + u.email) : 'Chmura Firebase';
  },

  async openFolder() { return false; },

  async exportData(data) {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'finanse-kopia.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  importData() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) { resolve({ ok: false }); return; }
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const parsed = normalize(JSON.parse(reader.result));
            await window.store.save(parsed);   // wgraj do chmury
            resolve({ ok: true, data: parsed });
          } catch (e) { resolve({ ok: false, error: e.message }); }
        };
        reader.onerror = () => resolve({ ok: false, error: 'Nie udało się odczytać pliku' });
        reader.readAsText(file);
      };
      input.click();
    });
  }
};

// --- Reakcja na logowanie / wylogowanie ---
onAuthStateChanged(auth, async (user) => {
  if (unsub) { unsub(); unsub = null; }

  if (!user) { showGate(); setBusy(false); return; }

  // Zalogowany: wczytaj dane, uruchom aplikację, włącz synchronizację na żywo.
  userDocRef = doc(db, 'users', user.uid);
  let initial;
  try {
    const snap = await getDoc(userDocRef);
    if (snap.exists() && snap.data().json) {
      initial = normalize(JSON.parse(snap.data().json));
    } else {
      // Pierwsze logowanie: przenieś ewentualne dane z pamięci telefonu do chmury.
      const ls = localStorage.getItem(LS_KEY);
      if (ls) {
        initial = normalize(JSON.parse(ls));
        await setDoc(userDocRef, { json: JSON.stringify(initial), updatedAt: Date.now() });
      } else {
        initial = defaultData();
      }
    }
  } catch (e) {
    console.error('Błąd wczytywania danych:', e);
    initial = defaultData();
  }

  currentData = initial;
  showApp();
  window.App.start(initial);

  // Synchronizacja na żywo — zmiany z innych urządzeń pojawiają się natychmiast.
  unsub = onSnapshot(userDocRef, (snap) => {
    if (!snap.exists()) return;
    const j = snap.data().json;
    if (!j) return;
    let incoming;
    try { incoming = normalize(JSON.parse(j)); } catch { return; }
    if (JSON.stringify(incoming) === JSON.stringify(currentData)) return; // brak realnej zmiany
    currentData = incoming;
    window.App.applyRemote(incoming);
  });
});

// --- Obsługa przycisków logowania ---
async function doAuth(kind) {
  const email = (elEmail?.value || '').trim();
  const pass = elPass?.value || '';
  if (!email) { setError('Podaj adres e-mail.'); return; }
  if (pass.length < 6) { setError('Hasło musi mieć co najmniej 6 znaków.'); return; }
  setError(''); setBusy(true);
  try {
    await setPersistence(auth, browserLocalPersistence);
    if (kind === 'in') await signInWithEmailAndPassword(auth, email, pass);
    else await createUserWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    setBusy(false);
    setError(plError(e.code || e.message));
  }
}

if (btnSignIn) btnSignIn.onclick = () => doAuth('in');
if (btnSignUp) btnSignUp.onclick = () => doAuth('up');
if (elPass) elPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth('in'); });

// Wylogowanie (przycisk w stopce aplikacji).
const btnSignOut = document.getElementById('signOutBtn');
if (btnSignOut) {
  btnSignOut.hidden = false;
  btnSignOut.onclick = async () => { await signOut(auth); location.reload(); };
}

// --- Service worker (offline) — tylko po http(s) ---
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW:', e));
  });
}
