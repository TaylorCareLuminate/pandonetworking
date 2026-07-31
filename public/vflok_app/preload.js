// ============================================================================
// vFlok Hospital Dashboard - Preload Script
// ============================================================================
// This script runs in the renderer process but has access to Node.js APIs
// It creates a secure bridge between the renderer and main process
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Database queries
  queryHospitals: (options) => ipcRenderer.invoke('db:query-hospitals', options),
  queryHealthSystems: (options) => ipcRenderer.invoke('db:query-health-systems', options),
  getAllHospitals: () => ipcRenderer.invoke('db:get-all-hospitals'),
  getAllHealthSystems: () => ipcRenderer.invoke('db:get-all-health-systems'),
  getUniqueValues: (field) => ipcRenderer.invoke('db:get-unique-values', field),
  getStats: (options) => ipcRenderer.invoke('db:get-stats', options),
  exportCSV: (options) => ipcRenderer.invoke('db:export-csv', options),

  // Contacts
  queryContacts: (options) => ipcRenderer.invoke('db:query-contacts', options),
  getContactStats: (options) => ipcRenderer.invoke('db:get-contact-stats', options),
  getHSWithContacts: () => ipcRenderer.invoke('db:get-hs-with-contacts'),
  getComputedHSDistributions: () => ipcRenderer.invoke('db:get-computed-hs-distributions'),

  // App controls
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // Utility
  platform: process.platform,
  isElectron: true
});

console.log('✅ Preload script loaded - electronAPI exposed');
