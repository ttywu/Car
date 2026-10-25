const { app, BrowserWindow, ipcMain, net, protocol, session, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// Web Bluetooth sits behind these switches on Linux; they are harmless elsewhere.
app.commandLine.appendSwitch("enable-experimental-web-platform-features");
app.commandLine.appendSwitch("enable-web-bluetooth");

// Serve the UI from app:// so it runs in a secure context, which Web Bluetooth requires.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const APP_DIR = path.join(__dirname, "app");
const ICON = path.join(__dirname, "build", "icon.png");

let mainWindow = null;
let chooseDevice = null;
let closing = false;

function serveApp() {
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(APP_DIR, decodeURIComponent(pathname === "/" ? "/index.html" : pathname)));
    if (!file.startsWith(APP_DIR + path.sep)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 380,
    minHeight: 500,
    title: "Beyond Power Control",
    backgroundColor: "#0b1120",
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Chromium asks the app to pick a device; the web UI shows the list and answers via IPC.
  // This fires again each time the list of nearby devices changes.
  mainWindow.webContents.on("select-bluetooth-device", (event, devices, callback) => {
    event.preventDefault();
    chooseDevice = callback;
    mainWindow.webContents.send(
      "bt-devices",
      devices.map((d) => ({ id: d.deviceId, name: d.deviceName || "Unnamed device" }))
    );
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  // Give the UI a moment to unload the machine before the window goes away.
  mainWindow.on("close", (event) => {
    if (closing) return;
    event.preventDefault();
    closing = true;
    mainWindow.webContents.send("app-closing");
    setTimeout(() => mainWindow?.destroy(), 1500);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    closing = false;
  });

  mainWindow.loadURL("app://bp/index.html");
}

ipcMain.on("bt-choose", (_event, deviceId) => {
  if (!chooseDevice) return;
  chooseDevice(deviceId || "");
  chooseDevice = null;
});

ipcMain.on("close-ready", () => mainWindow?.destroy());

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    serveApp();

    // Windows and Linux may ask to confirm pairing. The user started the connection,
    // so confirm it; PIN entry isn't supported, so point them to system settings.
    session.defaultSession.setBluetoothPairingHandler((details, callback) => {
      if (details.pairingKind === "providePin") {
        mainWindow?.webContents.send(
          "bt-log",
          "The machine asked for a PIN. Pair it in your system Bluetooth settings first, then connect again."
        );
        callback({ confirmed: false });
      } else {
        callback({ confirmed: true });
      }
    });

    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
