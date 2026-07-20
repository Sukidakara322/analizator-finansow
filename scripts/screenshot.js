// Narzędzie: renderuje aplikację w Electronie i zapisuje zrzuty ekranu do podglądu wyglądu.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:8123/index.html';

const START_APP = `(() => {
  const now = new Date();
  const key = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const prev = now.getMonth() === 0
    ? (now.getFullYear()-1) + '-12'
    : now.getFullYear() + '-' + String(now.getMonth()).padStart(2,'0');
  const sample = { version:1, initialBalance:2000,
    categories:['Jedzenie','Transport','Rachunki','Rozrywka','Zdrowie','Ubrania','Inne'],
    months: {
      [prev]: { salary:5200, expenses:[ {id:'p1',category:'Jedzenie',name:'Zakupy',amount:800,date:prev+'-10'} ] },
      [key]: { salary:5200, expenses:[
        {id:'a',category:'Jedzenie',name:'Biedronka',amount:420.50,date:key+'-05'},
        {id:'b',category:'Jedzenie',name:'Lidl',amount:180.20,date:key+'-12'},
        {id:'c',category:'Transport',name:'Paliwo',amount:300,date:key+'-03'},
        {id:'d',category:'Rozrywka',name:'Kino i Netflix',amount:120,date:key+'-08'},
        {id:'e',category:'Rachunki',name:'Prąd i internet',amount:250,date:key+'-10'},
        {id:'f',category:'Zdrowie',name:'Apteka',amount:75.99,date:key+'-15'}
      ] }
    } };
  document.getElementById('authGate').hidden = true;
  document.getElementById('appRoot').hidden = false;
  window.App.start(sample);
  return true;
})()`;

const wait = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false, width: 1240, height: 940, webPreferences: { partition: 'shots-fresh' } });

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
    await shot('app-top.png');                                 // główny widok – góra

    await run(`document.querySelector('#expCategory .dd-trigger').click();`);
    await wait(400);
    await shot('dropdown.png');                                // dropdown kategorii otwarty
    await run(`document.querySelector('#expCategory .dd-trigger').click();`);

    await run(`window.scrollTo(0, document.body.scrollHeight);`);
    await wait(500);
    await shot('app-bottom.png');                              // lista + wykres miesięczny + stopka

    await run(`window.scrollTo(0,0); document.getElementById('manageCats').click();`);
    await wait(400);
    await shot('modal.png');                                   // okno kategorii

    await run(`document.getElementById('catModal').hidden = true;`);
    win.setSize(430, 900);
    await wait(500);
    await shot('mobile.png');                                  // widok mobilny

    app.quit();
  });
});
