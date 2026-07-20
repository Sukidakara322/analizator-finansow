// Narzędzie: renderuje aplikację w Electronie i zapisuje zrzuty ekranu do podglądu wyglądu.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:8123/index.html';

const SAMPLE = `(() => {
  const now = new Date();
  const key = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const sample = { version:1,
    categories:['Jedzenie','Transport','Rachunki','Rozrywka','Zdrowie','Ubrania','Inne'],
    months: { [key]: { startingBalance:2000, salary:5200, expenses:[
      {id:'a',category:'Jedzenie',name:'Biedronka',amount:420.50,date:key+'-05'},
      {id:'b',category:'Jedzenie',name:'Lidl',amount:180.20,date:key+'-12'},
      {id:'c',category:'Transport',name:'Paliwo',amount:300,date:key+'-03'},
      {id:'d',category:'Rozrywka',name:'Kino i Netflix',amount:120,date:key+'-08'},
      {id:'e',category:'Rachunki',name:'Prąd i internet',amount:250,date:key+'-10'},
      {id:'f',category:'Zdrowie',name:'Apteka',amount:75.99,date:key+'-15'}
    ] } } };
  document.getElementById('authGate').hidden = true;
  document.getElementById('appRoot').hidden = false;
  window.App.start(sample);
  return true;
})()`;

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name), img.toPNG());
  console.log('zapisano', name);
}

app.whenReady().then(() => {
  // Sesja w pamięci (partycja bez "persist:") — brak starego cache i service workera.
  const win = new BrowserWindow({ show: false, width: 1240, height: 940, webPreferences: { partition: 'shots-fresh' } });
  win.loadURL(URL);
  win.webContents.once('did-finish-load', async () => {
    await new Promise(r => setTimeout(r, 2500));
    await shot(win, 'login.png');                 // ekran logowania
    await win.webContents.executeJavaScript(SAMPLE);
    await new Promise(r => setTimeout(r, 800));
    await shot(win, 'app-desktop.png');           // główny widok (desktop)
    app.quit();
  });
});
