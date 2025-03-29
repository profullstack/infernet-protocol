import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // System information
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  // PocketBase database operations
  db: {
    connect: (url) => ipcRenderer.invoke('db-connect', url),
    query: (collection, filter) => ipcRenderer.invoke('db-query', collection, filter),
    create: (collection, data) => ipcRenderer.invoke('db-create', collection, data),
    update: (collection, id, data) => ipcRenderer.invoke('db-update', collection, id, data),
    delete: (collection, id) => ipcRenderer.invoke('db-delete', collection, id)
  },
  
  // WebSocket connections for real-time communication
  socket: {
    connect: (url) => ipcRenderer.invoke('socket-connect', url),
    disconnect: () => ipcRenderer.invoke('socket-disconnect'),
    send: (event, data) => ipcRenderer.invoke('socket-send', event, data),
    on: (channel, callback) => {
      // Create a listener for this channel
      const subscription = (event, ...args) => callback(...args);
      ipcRenderer.on(`socket-${channel}`, subscription);
      
      // Return a function to remove the listener
      return () => {
        ipcRenderer.removeListener(`socket-${channel}`, subscription);
      };
    }
  },
  
  // Docker operations for task execution
  docker: {
    listContainers: () => ipcRenderer.invoke('docker-list-containers'),
    runContainer: (config) => ipcRenderer.invoke('docker-run-container', config),
    stopContainer: (id) => ipcRenderer.invoke('docker-stop-container', id),
    getContainerLogs: (id) => ipcRenderer.invoke('docker-get-container-logs', id)
  },
  
  // Content delivery system operations
  content: {
    uploadFile: (path) => ipcRenderer.invoke('content-upload-file', path),
    downloadFile: (hash, destination) => ipcRenderer.invoke('content-download-file', hash, destination),
    getFileStatus: (hash) => ipcRenderer.invoke('content-get-file-status', hash)
  }
});

console.log('Preload script loaded'); // Add this line for debugging reaso
