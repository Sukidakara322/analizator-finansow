// Narzędzie testowe: ładuje aplikację w ukrytym oknie Electron przez HTTP,
// zbiera komunikaty konsoli i błędy, sprawdza stan strony, po czym kończy.
const { app, BrowserWindow } = require('electron');

const URL = process.env.TEST_URL || 'http://localhost:8123/index.html';

app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 800 });
  const logs = [];

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    logs.push(`[c${level}] ${message}  (${sourceId}:${line})`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logs.push(`[fail-load] ${code} ${desc} ${url}`);
  });
  win.webContents.on('render-process-gone', (_e, d) => logs.push(`[render-gone] ${JSON.stringify(d)}`));

  win.loadURL(URL);

  setTimeout(() => {
    win.webContents.executeJavaScript(`(function(){
      var gate = document.getElementById('authGate');
      var appRoot = document.getElementById('appRoot');
      return {
        title: document.title,
        gateVisible: !!(gate && !gate.hidden),
        appHidden: !!(appRoot && appRoot.hidden),
        hasStore: !!window.store,
        isCloud: !!(window.store && window.store.isCloud),
        hasApp: !!(window.App && typeof window.App.start === 'function')
      };
    })()`).then((res) => {
      console.log('RESULT ' + JSON.stringify(res));
      console.log('LOGS:\n' + (logs.join('\n') || '(brak komunikatów)'));
      app.quit();
    }).catch((err) => {
      console.log('EVAL-ERR ' + err);
      console.log('LOGS:\n' + logs.join('\n'));
      app.quit();
    });
  }, 8000);
});
