import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// Get __dirname equivalent in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep a global reference of the window object to avoid garbage collection
let mainWindow;
const isDev = process.env.NODE_ENV === 'development';
// The Electron shell points at the production control plane by default —
// override NEXT_DESKTOP_URL to http://127.0.0.1:8080 for local dev.
const appUrl = process.env.NEXT_DESKTOP_URL || 'https://infernetprotocol.com';

// Create the browser window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#06131a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.mjs')
    }
  });

  // Electron now wraps the root Next.js app.
  mainWindow.loadURL(appUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    // Dereference the window object
    mainWindow = null;
  });
}

// Create window when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  // On macOS it's common to re-create a window when the dock icon is clicked
  app.on('activate', () => {
    if (mainWindow === null) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for communication with renderer process
ipcMain.handle('get-system-info', () => {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem()
  };
});

ipcMain.handle('get-runtime-info', () => ({
  desktop: 'electron',
  renderer: 'nextjs',
  appUrl
}));
