import { io } from 'socket.io-client';
import { updateStats } from '../stores/app.js';

// Initialize socket connection
let socket;

export function initSocket() {
  // Connect to the server
  socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    autoConnect: true
  });

  // Connection event handlers
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  // Data event handlers
  socket.on('stats', (data) => {
    console.log('Received stats update:', data);
    updateStats(data);
  });

  socket.on('node_update', (data) => {
    console.log('Node update:', data);
    // Handle node update in your application
  });

  socket.on('job_update', (data) => {
    console.log('Job update:', data);
    // Handle job update in your application
  });

  return socket;
}

// Send a message to the server
export function emit(event, data) {
  if (socket && socket.connected) {
    socket.emit(event, data);
  } else {
    console.warn('Socket not connected, cannot emit event:', event);
  }
}

// Disconnect the socket
export function disconnect() {
  if (socket) {
    socket.disconnect();
  }
}

// Reconnect the socket
export function reconnect() {
  if (socket) {
    socket.connect();
  }
}

export default {
  initSocket,
  emit,
  disconnect,
  reconnect
};
