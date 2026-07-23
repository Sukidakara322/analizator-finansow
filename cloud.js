// ================= Warstwa chmury: Firebase Auth + Firestore =================
// Zastępuje localStorage. Dane trzymane są w chmurze (dokument users/{uid}),
// synchronizowane na żywo między urządzeniami, z obsługą pracy offline.
// Interfejs (renderer.js) korzysta z window.store i window.App tak samo jak wcześniej.

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  getFirestore, doc, getDoc, setDoc, onSnapshot,
  collection, getDocs, writeBatch, deleteField, deleteDoc
} from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js';

const LS_KEY = 'analizator-finanse-v1'; // stary klucz localStorage — do migracji danych z telefonu
const DEFAULT_CATEGORIES = ['Jedzenie', 'Transport', 'Rachunki', 'Rozrywka', 'Zdrowie', 'Ubrania', 'Inne'];

function defaultData() { return { version: 1, initialBalance: 0, categories: [...DEFAULT_CATEGORIES], months: {} }; }
function normalize(p) {
  if (!p || typeof p !== 'object') return defaultData();
  if (!Array.isArray(p.categories) || p.categories.length === 0) p.categories = [...DEFAULT_CATEGORIES];
  if (!p.months || typeof p.months !== 'object') p.months = {};
  if (!p.version) p.version = 1;
  // Migracja starszych danych: jeśli brak globalnego stanu początkowego,
  // weź saldo startowe najwcześniejszego miesiąca (dawne pole startingBalance).
  if (typeof p.initialBalance !== 'number') {
    const mk = Object.keys(p.months).sort();
    p.initialBalance = (mk.length && typeof p.months[mk[0]].startingBalance === 'number')
      ? p.months[mk[0]].startingBalance : 0;
  }
  return p;
}

// --- Inicjalizacja Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'pl'; // e-maile od Firebase (np. reset hasła) po polsku
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
// Krok 2 (rejestracja – początkowy stan konta)
const step1 = document.getElementById('authStep1');
const step2 = document.getElementById('authStep2');
const elInitBalance = document.getElementById('authInitBalance');
const elError2 = document.getElementById('authError2');
const elBusy2 = document.getElementById('authBusy2');
const btnFinish = document.getElementById('authFinish');
const btnBack = document.getElementById('authBack');

function setError(msg) { if (elError) { elError.textContent = msg || ''; elError.classList.remove('ok'); } }
function setInfo(msg) { if (elError) { elError.textContent = msg || ''; elError.classList.add('ok'); } }
function setError2(msg) { if (elError2) elError2.textContent = msg || ''; }
function setBusy(on) {
  if (btnSignIn) btnSignIn.disabled = on;
  if (btnSignUp) btnSignUp.disabled = on;
  if (elBusy) elBusy.hidden = !on;
}
function setBusy2(on) {
  if (btnFinish) btnFinish.disabled = on;
  if (btnBack) btnBack.disabled = on;
  if (elBusy2) elBusy2.hidden = !on;
}
function goStep(n) {
  if (step1) step1.hidden = n !== 1;
  if (step2) step2.hidden = n !== 2;
  setError(''); setError2('');
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
// Struktura w Firestore:
//   users/{uid}                 -> profil: { version, initialBalance, categories }
//   users/{uid}/months/{RRRR-MM} -> { salary, expenses: [...] }
// Zapis jest różnicowy: do chmury lecą tylko te miesiące, które się zmieniły.
let profileRef = null;
let monthsColRef = null;
let currentData = defaultData();
let unsubProfile = null;
let unsubMonths = null;
let lastSynced = { profile: '', months: {} }; // JSON-y ostatnio zsynchronizowanych wersji
let pendingInitialBalance = null; // stan konta podany w kroku 2 rejestracji

// Pola profilu / miesiąca w stabilnej kolejności (do porównań JSON).
function profileOf(d) {
  return {
    version: d.version || 1,
    initialBalance: Number(d.initialBalance) || 0,
    categories: Array.isArray(d.categories) ? d.categories : []
  };
}
function monthOf(m) {
  return {
    salary: Number(m && m.salary) || 0,
    incomes: (m && m.incomes) || [],
    expenses: (m && m.expenses) || []
  };
}
function isEmptyMonth(mo) { return mo.salary === 0 && mo.incomes.length === 0 && mo.expenses.length === 0; }
// Do porównań pomijamy puste miesiące (tworzone lokalnie przy przeglądaniu).
function stripForCompare(d) {
  const c = { ...profileOf(d), months: {} };
  for (const k of Object.keys(d.months || {}).sort()) {
    const mo = monthOf(d.months[k]);
    if (!isEmptyMonth(mo)) c.months[k] = mo;
  }
  return c;
}

// --- window.store: ten sam interfejs, którego używa renderer.js ---
window.store = {
  isElectron: false,
  isCloud: true,

  async load() { return currentData; },

  async save(data) {
    currentData = data;
    if (!profileRef) return false;
    try {
      const writes = [];
      // Profil — tylko gdy się zmienił
      const prof = profileOf(data);
      const profStr = JSON.stringify(prof);
      if (profStr !== lastSynced.profile) {
        writes.push(setDoc(profileRef, { ...prof, updatedAt: Date.now() }, { merge: true }));
        lastSynced.profile = profStr;
      }
      // Miesiące — tylko zmienione; pustych (przeglądanych) nie zakładamy
      for (const key in data.months) {
        const mo = monthOf(data.months[key]);
        if (isEmptyMonth(mo) && !(key in lastSynced.months)) continue;
        const s = JSON.stringify(mo);
        if (lastSynced.months[key] !== s) {
          writes.push(setDoc(doc(monthsColRef, key), mo));
          lastSynced.months[key] = s;
        }
      }
      // Miesiące usunięte z danych (np. po imporcie) — skasuj dokumenty
      for (const key of Object.keys(lastSynced.months)) {
        if (!(key in data.months)) {
          writes.push(deleteDoc(doc(monthsColRef, key)));
          delete lastSynced.months[key];
        }
      }
      await Promise.all(writes);
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

// Zapisz cały zestaw danych jako profil + dokumenty miesięcy (atomowy batch).
async function writeAllAsBatch(initial, extraProfileFields) {
  const batch = writeBatch(db);
  batch.set(profileRef, { ...profileOf(initial), ...(extraProfileFields || {}), updatedAt: Date.now() }, { merge: true });
  for (const key in initial.months) {
    const mo = monthOf(initial.months[key]);
    if (isEmptyMonth(mo)) continue;
    batch.set(doc(monthsColRef, key), mo);
  }
  await batch.commit();
}

// --- Reakcja na logowanie / wylogowanie ---
onAuthStateChanged(auth, async (user) => {
  if (unsubProfile) { unsubProfile(); unsubProfile = null; }
  if (unsubMonths) { unsubMonths(); unsubMonths = null; }

  if (!user) { showGate(); goStep(1); setBusy(false); setBusy2(false); return; }

  // Zalogowany: wczytaj dane, uruchom aplikację, włącz synchronizację na żywo.
  profileRef = doc(db, 'users', user.uid);
  monthsColRef = collection(db, 'users', user.uid, 'months');
  lastSynced = { profile: '', months: {} };

  let initial;
  try {
    const snap = await getDoc(profileRef);
    const raw = snap.exists() ? snap.data() : null;

    if (raw && raw.json) {
      // MIGRACJA: stary format (jeden blob JSON) -> profil + dokumenty miesięcy.
      // Batch jest atomowy: albo wszystko się przenosi, albo nic (dane bezpieczne).
      initial = normalize(JSON.parse(raw.json));
      await writeAllAsBatch(initial, { json: deleteField() });
      console.log('Dane zmigrowane do struktury per-miesiąc.');
    } else if (raw) {
      // Nowy format: profil + kolekcja miesięcy.
      const monthsSnap = await getDocs(monthsColRef);
      const months = {};
      monthsSnap.forEach(d => { months[d.id] = monthOf(d.data()); });
      initial = normalize({ ...profileOf(raw), months });
    } else {
      // Pierwsze logowanie / nowe konto: dane z pamięci telefonu albo świeży zestaw.
      const ls = localStorage.getItem(LS_KEY);
      initial = ls ? normalize(JSON.parse(ls)) : defaultData();
      if (typeof pendingInitialBalance === 'number') initial.initialBalance = pendingInitialBalance;
      await writeAllAsBatch(initial);
    }
  } catch (e) {
    console.error('Błąd wczytywania danych:', e);
    initial = defaultData();
  }
  pendingInitialBalance = null;

  // Zapamiętaj, co jest zsynchronizowane (do zapisu różnicowego)
  lastSynced.profile = JSON.stringify(profileOf(initial));
  lastSynced.months = {};
  for (const key in initial.months) {
    const mo = monthOf(initial.months[key]);
    if (!isEmptyMonth(mo)) lastSynced.months[key] = JSON.stringify(mo);
  }

  currentData = initial;
  showApp();
  window.App.start(initial);

  // --- Synchronizacja na żywo: profil + kolekcja miesięcy ---
  let remoteProfile = profileOf(initial);
  const remoteMonths = {};
  for (const key in initial.months) {
    const mo = monthOf(initial.months[key]);
    if (!isEmptyMonth(mo)) remoteMonths[key] = mo;
  }

  const applyRemoteIfChanged = () => {
    const candidate = normalize({ ...remoteProfile, months: JSON.parse(JSON.stringify(remoteMonths)) });
    if (JSON.stringify(stripForCompare(candidate)) === JSON.stringify(stripForCompare(currentData))) return;
    currentData = candidate;
    lastSynced.profile = JSON.stringify(profileOf(candidate));
    lastSynced.months = {};
    for (const k in candidate.months) {
      const mo = monthOf(candidate.months[k]);
      if (!isEmptyMonth(mo)) lastSynced.months[k] = JSON.stringify(mo);
    }
    window.App.applyRemote(candidate);
  };

  unsubProfile = onSnapshot(profileRef, (s) => {
    if (!s.exists()) return;
    const d = s.data();
    if (d.json) return; // stary format (w trakcie migracji) — pomiń
    remoteProfile = profileOf(d);
    // Nie nadpisuj lokalnego stanu, gdy nasze własne zapisy są jeszcze w drodze
    if (!s.metadata.hasPendingWrites) applyRemoteIfChanged();
  });
  unsubMonths = onSnapshot(monthsColRef, (qs) => {
    qs.docChanges().forEach((ch) => {
      if (ch.type === 'removed') delete remoteMonths[ch.doc.id];
      else remoteMonths[ch.doc.id] = monthOf(ch.doc.data());
    });
    if (!qs.metadata.hasPendingWrites) applyRemoteIfChanged();
  });
});

// --- Obsługa logowania i rejestracji ---
function readCreds() {
  return { email: (elEmail?.value || '').trim(), pass: elPass?.value || '' };
}
function validCreds() {
  const { email, pass } = readCreds();
  if (!email) { setError('Podaj adres e-mail.'); return false; }
  if (pass.length < 6) { setError('Hasło musi mieć co najmniej 6 znaków.'); return false; }
  return true;
}

// Logowanie do istniejącego konta.
async function signIn() {
  if (!validCreds()) return;
  const { email, pass } = readCreds();
  setError(''); setBusy(true);
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    setBusy(false);
    setError(plError(e.code || e.message));
  }
}

// Rejestracja – krok 1: sprawdź dane i przejdź do pytania o stan konta.
function startSignUp() {
  if (!validCreds()) return;
  goStep(2);
  if (elInitBalance) { elInitBalance.value = ''; elInitBalance.focus(); }
}

// Rejestracja – krok 2: utwórz konto z podanym stanem początkowym.
async function finishSignUp() {
  const { email, pass } = readCreds();
  pendingInitialBalance = parseFloat((elInitBalance?.value || '').replace(',', '.')) || 0;
  setError2(''); setBusy2(true);
  try {
    await setPersistence(auth, browserLocalPersistence);
    await createUserWithEmailAndPassword(auth, email, pass);
    // resztę (utworzenie dokumentu z pendingInitialBalance) dokończy onAuthStateChanged
  } catch (e) {
    setBusy2(false);
    pendingInitialBalance = null;
    if ((e.code || '') === 'auth/email-already-in-use') {
      goStep(1);
      setError('Konto z tym adresem już istnieje — zaloguj się.');
    } else {
      setError2(plError(e.code || e.message));
    }
  }
}

// Reset hasła: wysyła e-mail z linkiem do ustawienia nowego hasła.
async function forgotPassword() {
  const email = (elEmail?.value || '').trim();
  if (!email) { setError('Wpisz swój adres e-mail powyżej i kliknij ponownie.'); return; }
  setError(''); setBusy(true);
  try {
    await sendPasswordResetEmail(auth, email);
    setBusy(false);
    setInfo(`Jeśli konto istnieje, wysłaliśmy link resetujący na ${email}. Sprawdź skrzynkę (także spam).`);
  } catch (e) {
    setBusy(false);
    setError(plError(e.code || e.message));
  }
}

const btnForgot = document.getElementById('authForgot');
if (btnForgot) btnForgot.onclick = forgotPassword;

if (btnSignIn) btnSignIn.onclick = signIn;
if (btnSignUp) btnSignUp.onclick = startSignUp;
if (btnFinish) btnFinish.onclick = finishSignUp;
if (btnBack) btnBack.onclick = () => goStep(1);
if (elPass) elPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') signIn(); });
if (elInitBalance) elInitBalance.addEventListener('keydown', (e) => { if (e.key === 'Enter') finishSignUp(); });

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
