// Narzędzie: renderuje aplikację w Electronie i zapisuje zrzuty ekranu do podglądu wyglądu.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:8123/index.html';

const START_APP = `(() => {
  const now = new Date();
  const keyOf = (o) => { const d = new Date(now.getFullYear(), now.getMonth() - o, 1); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); };
  const months = {};
  for (let o = 4; o >= 0; o--) {
    const k = keyOf(o);
    const f = 1 + (4 - o) * 0.12;
    const exp = [
      {id:k+'a',category:'Jedzenie',name:'Biedronka',amount:Math.round(320*f)+0.5,date:k+'-05'},
      {id:k+'b',category:'Jedzenie',name:'Lidl',amount:Math.round(180*f),date:k+'-12'},
      {id:k+'c',category:'Transport',name:'Paliwo',amount:250 + (o%2?40:-20),date:k+'-08'},
      {id:k+'d',category:'Rachunki',name:'Prąd i internet',amount:230 + o*6,date:k+'-10'}
    ];
    if (o < 3) exp.push({id:k+'e',category:'Rozrywka',name:'Kino i Netflix',amount:90 + o*12,date:k+'-14'});
    if (o === 0) exp.push({id:k+'f',category:'Zdrowie',name:'Apteka',amount:75.99,date:k+'-15'});
    months[k] = { salary: 5200, expenses: exp };
  }
  const sample = { version:1, initialBalance:2000,
    categories:['Jedzenie','Transport','Rachunki','Rozrywka','Zdrowie','Ubrania','Inne'],
    months };
  document.getElementById('authGate').hidden = true;
  document.getElementById('appRoot').hidden = false;
  window.App.start(sample);
  return true;
})()`;

const wait = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false, width: 1240, height: 1300, webPreferences: { partition: 'shots-fresh' } });

  async function shot(name) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('zapisano', name);
  }
  const run = (js) => win.webContents.executeJavaScript(js);

  win.loadURL(URL);
  win.webContents.once('did-finish-load', async () => {
    await wait(2500);
    await shot('login1.png');                                  // logowanie krok 1

    await run(`document.getElementById('authEmail').value='test@example.com';
               document.getElementById('authPass').value='haslo123';
               document.getElementById('authSignUp').click();`);
    await wait(400);
    await shot('login2.png');                                  // logowanie krok 2 (stan konta)

    await run(START_APP);
    await wait(700);
    await shot('view-miesiac.png');                            // widok: Miesiąc

    await run(`document.querySelector('#expDate .dp-trigger').click();`);
    await wait(400); await shot('datepicker.png');             // kalendarz otwarty
    await run(`document.querySelector('#expDate .dp-trigger').click();`);

    const nav = (v) => run(`document.querySelector('.nav-btn[data-view=${v}]').click();`);
    await nav('historia'); await wait(400); await shot('view-historia.png');
    await run(`document.querySelector('.edit-btn').click();`);
    await wait(400); await shot('edit-modal.png');             // okno edycji wydatku
    await run(`document.getElementById('editModal').hidden = true;`);

    await nav('ustawienia'); await wait(400); await shot('view-ustawienia.png');

    // Widok mobilny – Miesiąc (formularz z kalendarzem)
    await nav('miesiac');
    win.setSize(430, 900);
    await wait(500);
    await shot('mobile.png');

    app.quit();
  });
});
