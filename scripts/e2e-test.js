// Automatyczny test end-to-end warstwy chmury (model: profil + dokumenty per miesiąc).
// Tworzy konto testowe, zapisuje/odczytuje profil i miesiące, sprawdza reguły,
// mechanikę migracji (usunięcie pola json + zapis miesięcy w batchu), po czym sprząta.
const { app, BrowserWindow } = require('electron');

const code = `(async () => {
  const V = 'https://www.gstatic.com/firebasejs/11.1.0';
  const { initializeApp } = await import(V + '/firebase-app.js');
  const { getAuth, createUserWithEmailAndPassword, deleteUser } = await import(V + '/firebase-auth.js');
  const { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch, deleteField } = await import(V + '/firebase-firestore.js');
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

    const profileRef = doc(db, 'users', user.uid);
    const monthsCol = collection(db, 'users', user.uid, 'months');

    // 1) Zapis w nowym formacie: profil + miesiąc
    await setDoc(profileRef, { version: 1, initialBalance: 1500, categories: ['Alfa', 'Beta'] });
    await setDoc(doc(monthsCol, '2026-07'), { salary: 5000, expenses: [{ id: 'x1', category: 'Alfa', name: 'Test', amount: 123.45, date: '2026-07-05' }] });
    log('write_new_format', 'ok');

    // 2) Odczyt i weryfikacja
    const prof = await getDoc(profileRef);
    const months = await getDocs(monthsCol);
    let m0 = null; months.forEach(d => { if (d.id === '2026-07') m0 = d.data(); });
    const okProf = prof.exists() && prof.data().initialBalance === 1500 && prof.data().categories.length === 2;
    const okMonth = m0 && m0.salary === 5000 && m0.expenses.length === 1 && m0.expenses[0].amount === 123.45;
    log('read_back', (okProf && okMonth) ? 'ok' : 'MISMATCH');

    // 3) Reguły: cudzy profil i cudza podkolekcja mają być zablokowane
    let denied1 = false, denied2 = false;
    try { await getDoc(doc(db, 'users', 'obcy-' + Date.now())); } catch (e) { denied1 = (e && e.code === 'permission-denied'); }
    try { await getDoc(doc(db, 'users', 'obcy-' + Date.now(), 'months', '2026-07')); } catch (e) { denied2 = (e && e.code === 'permission-denied'); }
    log('rules_deny_doc', denied1 ? 'ok' : 'FAIL(otwarte!)');
    log('rules_deny_subcol', denied2 ? 'ok' : 'FAIL(otwarte!)');

    // 4) Mechanika migracji: stary blob json -> batch (miesiące + usunięcie json)
    await setDoc(profileRef, { json: JSON.stringify({ version: 1, initialBalance: 777, categories: ['Stara'], months: { '2026-06': { salary: 4000, expenses: [{ id: 'm1', category: 'Stara', name: 'Blob', amount: 50, date: '2026-06-10' }] } } }) }, { merge: true });
    const batch = writeBatch(db);
    batch.set(profileRef, { version: 1, initialBalance: 777, categories: ['Stara'], json: deleteField() }, { merge: true });
    batch.set(doc(monthsCol, '2026-06'), { salary: 4000, expenses: [{ id: 'm1', category: 'Stara', name: 'Blob', amount: 50, date: '2026-06-10' }] });
    await batch.commit();
    const prof2 = await getDoc(profileRef);
    const june = await getDoc(doc(monthsCol, '2026-06'));
    const okMig = prof2.exists() && prof2.data().json === undefined && prof2.data().initialBalance === 777 && june.exists() && june.data().salary === 4000;
    log('migration_mechanics', okMig ? 'ok' : 'MISMATCH');

    // 5) Sprzątanie
    await deleteDoc(doc(monthsCol, '2026-07'));
    await deleteDoc(doc(monthsCol, '2026-06'));
    await deleteDoc(profileRef);
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
