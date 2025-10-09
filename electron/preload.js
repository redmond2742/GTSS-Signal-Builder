// Preload script for Electron
// This runs in a sandboxed context before the web page loads
// Use this to expose safe APIs to the renderer process if needed

const { contextBridge } = require('electron');

// Example: Expose a safe API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,
});

console.log('GTSS Builder Desktop App - Preload script loaded');
