import { writable } from 'svelte/store';

// App-wide settings and state
export const appSettings = writable({
  darkMode: false,
  sidebarCollapsed: false,
  notifications: true
});

// System stats
export const systemStats = writable({
  activeNodes: 0,
  totalJobs: 0,
  gpuUtilization: 0,
  cpuUtilization: 0,
  lastUpdated: null
});

// Active nodes
export const nodes = writable([]);

// Active jobs
export const jobs = writable([]);

// Loading states
export const loading = writable({
  nodes: false,
  jobs: false,
  stats: false
});

// Error states
export const errors = writable({
  nodes: null,
  jobs: null,
  stats: null
});

// Update system stats
export function updateStats(newStats) {
  systemStats.update(stats => ({
    ...stats,
    ...newStats,
    lastUpdated: new Date()
  }));
}

// Toggle dark mode
export function toggleDarkMode() {
  appSettings.update(settings => ({
    ...settings,
    darkMode: !settings.darkMode
  }));
}

// Toggle sidebar
export function toggleSidebar() {
  appSettings.update(settings => ({
    ...settings,
    sidebarCollapsed: !settings.sidebarCollapsed
  }));
}

// Toggle notifications
export function toggleNotifications() {
  appSettings.update(settings => ({
    ...settings,
    notifications: !settings.notifications
  }));
}

// Save settings to local storage
export function saveSettings() {
  let settings;
  appSettings.subscribe(value => {
    settings = value;
  })();
  
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('app-settings', JSON.stringify(settings));
  }
}

// Load settings from local storage
export function loadSettings() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('app-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        appSettings.set(parsed);
      } catch (e) {
        console.error('Failed to parse settings from localStorage', e);
      }
    }
  }
}
