// Bridges the Bluetooth device chooser and window events into the web UI.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bpDesktop", {
  platform: process.platform,
  onDevices: (callback) => ipcRenderer.on("bt-devices", (_event, devices) => callback(devices)),
  chooseDevice: (deviceId) => ipcRenderer.send("bt-choose", deviceId),
  onLog: (callback) => ipcRenderer.on("bt-log", (_event, message) => callback(message)),
  onClosing: (callback) => ipcRenderer.on("app-closing", () => callback()),
  closeReady: () => ipcRenderer.send("close-ready"),
});
