import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// Get __dirname equivalent in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep a global reference of the window object to avoid garbage collection
let mainWindow;

// Create the browser window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.mjs')
    },
    icon: path.join(__dirname, '../src/assets/icon.png')
  });

  // Load the app - in development use the Vite dev server, in production use the built files
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/');
    // Open DevTools in development mode
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
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

// Add more IPC handlers for PocketBase interactions, WebSocket connections, etc.
