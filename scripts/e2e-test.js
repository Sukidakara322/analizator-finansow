// Automatyczny test end-to-end warstwy chmury.
// Ładuje aplikację, tworzy konto testowe, zapisuje/odczytuje dokument w Firestore,
// sprawdza reguły (odmowa dostępu do cudzych danych), po czym kasuje dokument i konto.
const { app, BrowserWindow } = require('electron');

const code = `(async () => {
  const V = 'https://www.gstatic.com/firebasejs/11.1.0';
  const { initializeApp } = await import(V + '/firebase-app.js');
  const { getAuth, createUserWithEmailAndPassword, deleteUser } = await import(V + '/firebase-auth.js');
  const { getFirestore, doc, setDoc, getDoc, deleteDoc } = await import(V + '/firebase-firestore.js');
  const { firebaseConfig } = await import('./firebase-config.js');
  const out = { steps: [] };
  const log = (k, v) => out.steps.push(k + '=' + v);
  let user = null;
  try {
    const fbApp = initializeApp(firebaseConfig, 'e2e');
    const auth = getAuth(fbApp);
    const db = getFirestore(fbApp);
    const email = 'e2e' + Date.now() + '@example.com';
    const cred = await createUserWithEmailAndPassword(auth, email, 'test123456');
    user = cred.user;
    log('signup', 'ok:' + user.uid.slice(0, 6));
    const ref = doc(db, 'users', user.uid);
    const payload = JSON.stringify({ version: 1, categories: ['X'], months: { '2026-07': { salary: 4321 } } });
    await setDoc(ref, { json: payload, updatedAt: Date.now() });
    log('write', 'ok');
    const snap = await getDoc(ref);
    const back = snap.exists() ? JSON.parse(snap.data().json) : null;
    log('read', (back && back.months['2026-07'].salary === 4321) ? 'ok' : 'MISMATCH');
    let denied = false;
    try { await getDoc(doc(db, 'users', 'ktos-inny-' + Date.now())); }
    catch (e) { denied = (e && e.code === 'permission-denied'); }
    log('rules_deny_others', denied ? 'ok' : 'FAIL(otwarte!)');
    await deleteDoc(ref);
    await deleteUser(user);
    log('cleanup', 'ok');
    out.pass = out.steps.every((s) => s.includes('ok'));
  } catch (e) {
    out.error = (e && (e.code || e.message)) || String(e);
    out.pass = false;
    try { if (user) await deleteUser(user); } catch (_) {}
  }
  return out;
})()`;

app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false, width: 900, height: 700 });
  const logs = [];
  win.webContents.on('console-message', (_e, l, m) => logs.push('[c' + l + '] ' + m));
  win.loadURL('http://localhost:8123/index.html');
  win.webContents.once('did-finish-load', async () => {
    try {
      const res = await win.webContents.executeJavaScript(code);
      console.log('E2E ' + JSON.stringify(res));
    } catch (e) {
      console.log('E2E-ERR ' + e);
    }
    if (logs.length) console.log('LOGS:\n' + logs.join('\n'));
    app.quit();
  });
});
