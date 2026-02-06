const { app, BrowserWindow } = require('electron');
const path = require('path');

// The desktop app loads the Next.js web app in an Electron window.
// In development, it proxies to localhost:3000.
// In production, it serves the built Next.js app.

const isDev = process.env.NODE_ENV !== 'production';
const WEB_URL = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../web/out/index.html')}`;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Infernet Protocol',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadURL(WEB_URL);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// TODO: Start Infernet node in the main process
// const { InfernetNode } = require('@infernet/core');
// const node = new InfernetNode({ ... });
// node.start();
