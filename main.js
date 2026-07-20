const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// --- Ustalenie lokalizacji pliku z danymi ---
// W trybie deweloperskim (npm start) dane trafiają do folderu "dane" obok aplikacji.
// Po spakowaniu aplikacji dane trafiają obok pliku wykonywalnego.
function getDataDir() {
  const base = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
  return path.join(base, 'dane');
}

function getDataFile() {
  return path.join(getDataDir(), 'finanse.json');
}

// Domyślna, pusta struktura danych
function defaultData() {
  return {
    version: 1,
    categories: ['Jedzenie', 'Transport', 'Rachunki', 'Rozrywka', 'Zdrowie', 'Ubrania', 'Inne'],
    months: {}
  };
}

function ensureDataDir() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readData() {
  try {
    const file = getDataFile();
    if (!fs.existsSync(file)) {
      return defaultData();
    }
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    // Uzupełnienie brakujących pól dla bezpieczeństwa
    if (!parsed.categories) parsed.categories = defaultData().categories;
    if (!parsed.months) parsed.months = {};
    if (!parsed.version) parsed.version = 1;
    return parsed;
  } catch (err) {
    console.error('Błąd odczytu danych:', err);
    return defaultData();
  }
}

function writeData(data) {
  ensureDataDir();
  const file = getDataFile();
  // Zapis atomowy: najpierw do pliku tymczasowego, potem zamiana.
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
  return true;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#0b0913',
    title: 'Analizator Finansów',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Wersja desktopowa ładuje tę samą aplikację co telefon (hostowaną na GitHub Pages),
  // dzięki czemu dane synchronizują się przez chmurę i działa logowanie oraz tryb offline.
  // Gdyby nie było internetu przy pierwszym starcie — awaryjnie ładujemy pliki lokalne.
  const HOSTED_URL = 'https://sukidakara322.github.io/analizator-finansow/';
  mainWindow.loadURL(HOSTED_URL);
  mainWindow.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) mainWindow.loadFile('index.html');
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Kanały IPC ---

ipcMain.handle('data:load', () => {
  return readData();
});

ipcMain.handle('data:save', (_evt, data) => {
  writeData(data);
  return true;
});

ipcMain.handle('data:path', () => {
  return getDataFile();
});

ipcMain.handle('data:openFolder', () => {
  ensureDataDir();
  shell.openPath(getDataDir());
  return true;
});

// Eksport kopii zapasowej do wybranego miejsca
ipcMain.handle('data:export', async (_evt, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Eksportuj kopię danych',
    defaultPath: 'finanse-kopia.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return { ok: true, filePath };
});

// Import danych z pliku
ipcMain.handle('data:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importuj dane z pliku',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false };
  try {
    const raw = fs.readFileSync(filePaths[0], 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.months) parsed.months = {};
    if (!parsed.categories) parsed.categories = defaultData().categories;
    if (!parsed.version) parsed.version = 1;
    writeData(parsed);
    return { ok: true, data: parsed };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
