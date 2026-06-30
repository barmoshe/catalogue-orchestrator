// Preload — the only bridge between renderer and main. Keep it minimal and explicit.
// IPC handlers (e.g. native "reveal output in Finder", folder picker for a catalogue
// dir) are added here via contextBridge + ipcRenderer.invoke as the desktop app grows.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("co", {
  desktop: true,
  platform: process.platform,
});
