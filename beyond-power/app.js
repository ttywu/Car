"use strict";

// Beyond Power Control: drives a Beyond Power resistance machine over Web Bluetooth.
// The vendor protocol is not public, so every UUID and command comes from a user profile.

const MIN_LB = 5;
const MAX_LB = 200;
const LB_PER_KG = 2.20462;
const PROFILE_KEY = "bp-control-profile";
const PREFS_KEY = "bp-control-prefs";

// Services the browser is allowed to open in addition to the profile's own.
// Web Bluetooth hides any service not listed here, so common fitness ones are included.
const COMMON_SERVICES = [
  "generic_access",
  "device_information",
  "battery_service",
  "fitness_machine",
  "cycling_power",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
];

const MODE_NAMES = ["Weight", "Eccentric", "Chains", "Isokinetic", "Elastic"];

const $ = (id) => document.getElementById(id);

const state = {
  weightLb: 20,
  unit: "lb",
  mode: 0,
  loaded: false,
  demo: false,
  device: null,
  server: null,
  writeChar: null,
  notifyChar: null,
  reps: 0,
  repPhase: "down",
  repLow: Infinity,
  repHigh: -Infinity,
  forceHistory: [],
};

const profileFields = {
  namePrefix: "pNamePrefix",
  service: "pService",
  write: "pWrite",
  notify: "pNotify",
  extra: "pExtra",
  setWeight: "cSetWeight",
  setMode: "cSetMode",
  load: "cLoad",
  unload: "cUnload",
  forceOff: "tForceOff",
  forceType: "tForceType",
  forceScale: "tForceScale",
  posOff: "tPosOff",
  posType: "tPosType",
  posScale: "tPosScale",
};

let profile = {};

// ---------- storage ----------

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private window); the app still works for this session.
  }
}

function loadProfile() {
  profile = readJson(PROFILE_KEY);
  for (const [key, id] of Object.entries(profileFields)) {
    if (profile[key] !== undefined) $(id).value = profile[key];
  }
  const prefs = readJson(PREFS_KEY);
  if (prefs.unit === "kg") state.unit = "kg";
  if (Number.isFinite(prefs.weightLb)) state.weightLb = clampLb(prefs.weightLb);
}

function collectProfile() {
  const p = {};
  for (const [key, id] of Object.entries(profileFields)) {
    p[key] = $(id).value.trim();
  }
  return p;
}

function saveProfile() {
  profile = collectProfile();
  writeJson(PROFILE_KEY, profile);
  log("Profile saved.");
}

function savePrefs() {
  writeJson(PREFS_KEY, { unit: state.unit, weightLb: state.weightLb });
}

// ---------- logging ----------

function log(message) {
  const el = $("log");
  const time = new Date().toLocaleTimeString();
  el.textContent += `[${time}] ${message}\n`;
  el.scrollTop = el.scrollHeight;
}

const toHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ").toUpperCase();

// ---------- command encoding ----------

function encodeValue(value, type) {
  const v = Math.round(value);
  switch (type) {
    case "u8":
      return [v & 0xff];
    case "u16le":
      return [v & 0xff, (v >> 8) & 0xff];
    case "u16be":
      return [(v >> 8) & 0xff, v & 0xff];
    case "u32le":
      return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
    default:
      throw new Error(`Unknown type "${type}"`);
  }
}

// Turns "A1 {weight_lb10:u16le} 00" into bytes.
function encodeCommand(template, vars) {
  const bytes = [];
  const tokens = template.match(/\{[^}]+\}|[0-9a-fA-F]{2}|\S+/g) || [];
  for (const token of tokens) {
    if (token.startsWith("{")) {
      const [name, type = "u8"] = token.slice(1, -1).split(":");
      if (!(name in vars)) throw new Error(`Unknown placeholder "${name}"`);
      bytes.push(...encodeValue(vars[name], type));
    } else if (/^[0-9a-fA-F]{2}$/.test(token)) {
      bytes.push(parseInt(token, 16));
    } else {
      throw new Error(`Bad token "${token}"`);
    }
  }
  return new Uint8Array(bytes);
}

function commandVars() {
  const kg = state.weightLb / LB_PER_KG;
  return {
    weight_lb: state.weightLb,
    weight_kg: kg,
    weight_lb10: state.weightLb * 10,
    weight_kg10: kg * 10,
    mode: state.mode,
  };
}

async function writeBytes(char, bytes) {
  if (char.properties.write && char.writeValueWithResponse) {
    await char.writeValueWithResponse(bytes);
  } else if (char.writeValueWithoutResponse) {
    await char.writeValueWithoutResponse(bytes);
  } else {
    await char.writeValue(bytes);
  }
}

async function sendCommand(name, label) {
  const template = profile[name];
  if (state.demo) {
    log(`Demo: ${label}`);
    return true;
  }
  if (!state.server?.connected) {
    log(`Not connected; "${label}" not sent.`);
    return false;
  }
  if (!template) {
    log(`No "${label}" command in the profile; nothing sent.`);
    return false;
  }
  if (!state.writeChar) {
    log("No write characteristic found; check the profile UUIDs.");
    return false;
  }
  try {
    const bytes = encodeCommand(template, commandVars());
    await writeBytes(state.writeChar, bytes);
    log(`Sent ${label}: ${toHex(bytes)}`);
    return true;
  } catch (err) {
    log(`Failed to send ${label}: ${err.message}`);
    return false;
  }
}

// ---------- controls ----------

function clampLb(lb) {
  return Math.min(MAX_LB, Math.max(MIN_LB, lb));
}

function displayWeight() {
  return state.unit === "lb"
    ? Math.round(state.weightLb)
    : Math.round((state.weightLb / LB_PER_KG) * 2) / 2;
}

function renderWeight() {
  $("weightValue").textContent = displayWeight();
  $("unitBtn").textContent = state.unit;
  const slider = $("weightSlider");
  if (state.unit === "lb") {
    slider.min = MIN_LB;
    slider.max = MAX_LB;
    slider.step = 1;
  } else {
    slider.min = Math.ceil(MIN_LB / LB_PER_KG);
    slider.max = Math.floor(MAX_LB / LB_PER_KG);
    slider.step = 0.5;
  }
  slider.value = displayWeight();
}

let weightTimer = null;

function setWeightLb(lb) {
  state.weightLb = clampLb(lb);
  renderWeight();
  savePrefs();
  // Debounce so dragging the slider doesn't flood the machine.
  clearTimeout(weightTimer);
  weightTimer = setTimeout(() => {
    sendCommand("setWeight", `weight ${displayWeight()} ${state.unit}`);
  }, 250);
}

function setWeightInUnit(value) {
  setWeightLb(state.unit === "lb" ? value : value * LB_PER_KG);
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode").forEach((btn) => {
    const active = Number(btn.dataset.mode) === mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-checked", active);
  });
  sendCommand("setMode", `mode ${MODE_NAMES[mode]}`);
}

function renderLoad() {
  $("loadBtn").classList.toggle("active", state.loaded);
  $("loadBtn").textContent = state.loaded ? "Loaded" : "Load";
  $("loadState").textContent = state.loaded ? "Loaded" : "Unloaded";
}

async function load() {
  if (await sendCommand("load", "load")) {
    state.loaded = true;
    renderLoad();
  }
}

async function unload() {
  // Always show unloaded locally; a failed send is reported in the log.
  state.loaded = false;
  renderLoad();
  await sendCommand("unload", "unload");
}

// ---------- telemetry ----------

function readNumber(view, offset, type) {
  if (!Number.isInteger(offset) || offset < 0) return null;
  const size = type === "u8" ? 1 : 2;
  if (offset + size > view.byteLength) return null;
  switch (type) {
    case "u8":
      return view.getUint8(offset);
    case "u16be":
      return view.getUint16(offset, false);
    case "i16le":
      return view.getInt16(offset, true);
    default:
      return view.getUint16(offset, true);
  }
}

function parseTelemetry(view) {
  const scale = (s) => Number(s) || 1;
  const force = profile.forceOff === "" || profile.forceOff === undefined
    ? null
    : readNumber(view, Number(profile.forceOff), profile.forceType);
  const pos = profile.posOff === "" || profile.posOff === undefined
    ? null
    : readNumber(view, Number(profile.posOff), profile.posType);
  updateTelemetry(
    force === null ? null : force / scale(profile.forceScale),
    pos === null ? null : pos / scale(profile.posScale)
  );
}

// Counts a rep each time the cable goes out and comes back by a clear margin.
function countRep(pos) {
  const margin = 5;
  state.repLow = Math.min(state.repLow, pos);
  state.repHigh = Math.max(state.repHigh, pos);
  if (state.repPhase === "down" && pos > state.repLow + margin * 2) {
    state.repPhase = "up";
    state.repHigh = pos;
  } else if (state.repPhase === "up" && pos < state.repHigh - margin * 2) {
    state.repPhase = "down";
    state.repLow = pos;
    state.reps += 1;
    $("repValue").textContent = state.reps;
  }
}

function updateTelemetry(force, pos) {
  if (force !== null) {
    $("forceValue").textContent = `${force.toFixed(1)}`;
    state.forceHistory.push(force);
    if (state.forceHistory.length > 200) state.forceHistory.shift();
    drawChart();
  }
  if (pos !== null) {
    $("posValue").textContent = `${pos.toFixed(1)}`;
    countRep(pos);
  }
}

function resetReps() {
  state.reps = 0;
  state.repPhase = "down";
  state.repLow = Infinity;
  state.repHigh = -Infinity;
  $("repValue").textContent = "0";
}

function drawChart() {
  const canvas = $("forceChart");
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const data = state.forceHistory;
  if (data.length < 2) return;
  const max = Math.max(10, ...data) * 1.1;
  ctx.strokeStyle = "#f97316";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / 199) * width;
    const y = height - (v / max) * height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// ---------- demo mode ----------

let demoTimer = null;

function startDemo() {
  if (state.server?.connected) {
    log("Disconnect the machine before using demo mode.");
    return;
  }
  state.demo = true;
  setStatus("Demo mode (no machine)", "demo");
  $("demoBtn").textContent = "Exit demo";
  let t = 0;
  demoTimer = setInterval(() => {
    t += 0.05;
    const pos = state.loaded ? 30 + 30 * Math.sin(t * 1.6) : 0;
    let force = 0;
    if (state.loaded) {
      const extra = { 0: 1, 1: Math.sin(t * 1.6) < 0 ? 1.3 : 1, 2: 0.7 + pos / 100, 3: 0.9, 4: 0.6 + pos / 80 };
      force = state.weightLb * extra[state.mode] + (Math.random() - 0.5) * 2;
    }
    updateTelemetry(force, pos);
  }, 50);
  log("Demo mode on. Controls are simulated.");
}

function stopDemo() {
  clearInterval(demoTimer);
  state.demo = false;
  state.loaded = false;
  renderLoad();
  setStatus("Not connected", "");
  $("demoBtn").textContent = "Demo mode";
  log("Demo mode off.");
}

// ---------- Bluetooth ----------

function setStatus(text, kind) {
  $("statusText").textContent = text;
  $("statusDot").className = `dot ${kind}`;
}

function normalizeUuid(value) {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (/^(0x)?[0-9a-f]{4}$/.test(v)) return BluetoothUUID.canonicalUUID(parseInt(v.replace("0x", ""), 16));
  return v;
}

function profileServices() {
  const list = [profile.service, ...(profile.extra || "").split(",")]
    .map((u) => (u ? normalizeUuid(u) : null))
    .filter(Boolean);
  return [...new Set([...list, ...COMMON_SERVICES])];
}

async function connect() {
  if (state.server?.connected) {
    state.device.gatt.disconnect();
    return;
  }
  if (state.demo) stopDemo();
  profile = collectProfile();
  const options = { optionalServices: profileServices() };
  if (profile.namePrefix) options.filters = [{ namePrefix: profile.namePrefix }];
  else options.acceptAllDevices = true;

  try {
    setStatus("Choose your machine…", "");
    const device = await navigator.bluetooth.requestDevice(options);
    state.device = device;
    device.addEventListener("gattserverdisconnected", onDisconnected);
    setStatus(`Connecting to ${device.name || "device"}…`, "");
    state.server = await device.gatt.connect();
    setStatus(`Connected: ${device.name || device.id}`, "on");
    $("connectBtn").textContent = "Disconnect";
    log(`Connected to ${device.name || device.id}.`);
    await discover();
  } catch (err) {
    setStatus("Not connected", "");
    log(`Connection failed: ${err.message}`);
  }
}

function onDisconnected() {
  state.server = null;
  state.writeChar = null;
  state.notifyChar = null;
  state.loaded = false;
  renderLoad();
  setStatus("Not connected", "");
  $("connectBtn").textContent = "Connect machine";
  $("gattTree").innerHTML = '<p class="muted">Not connected.</p>';
  log("Disconnected.");
}

function propList(props) {
  return ["read", "write", "writeWithoutResponse", "notify", "indicate"].filter((p) => props[p]);
}

async function discover() {
  const tree = $("gattTree");
  tree.innerHTML = "";
  const wantWrite = profile.write ? normalizeUuid(profile.write) : null;
  const wantNotify = profile.notify ? normalizeUuid(profile.notify) : null;

  let services = [];
  try {
    services = await state.server.getPrimaryServices();
  } catch (err) {
    log(`Couldn't list services: ${err.message}`);
  }
  if (!services.length) {
    tree.innerHTML =
      '<p class="muted">No visible services. Add the machine\'s service UUID to the profile and reconnect.</p>';
  }

  for (const service of services) {
    const box = document.createElement("div");
    box.className = "svc";
    const title = document.createElement("strong");
    title.textContent = `Service ${service.uuid}`;
    box.append(title);
    let chars = [];
    try {
      chars = await service.getCharacteristics();
    } catch (err) {
      log(`Couldn't read characteristics of ${service.uuid}: ${err.message}`);
    }
    for (const char of chars) {
      if (char.uuid === wantWrite) state.writeChar = char;
      if (char.uuid === wantNotify) state.notifyChar = char;
      box.append(renderCharacteristic(char));
    }
    tree.append(box);
  }

  if (wantWrite && !state.writeChar) log(`Write characteristic ${wantWrite} not found.`);
  if (state.notifyChar) {
    try {
      await subscribe(state.notifyChar, true);
    } catch (err) {
      log(`Couldn't subscribe to telemetry: ${err.message}`);
    }
  }
}

async function subscribe(char, isTelemetry) {
  char.addEventListener("characteristicvaluechanged", (event) => {
    const view = event.target.value;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    // Telemetry arrives many times a second, so only explorer subscriptions are logged.
    if (isTelemetry) parseTelemetry(view);
    else log(`${char.uuid.slice(0, 8)} ⇐ ${toHex(bytes)}`);
  });
  await char.startNotifications();
  log(`Subscribed to ${char.uuid}.`);
}

function renderCharacteristic(char) {
  const row = document.createElement("div");
  row.className = "chr";
  const uuid = document.createElement("span");
  uuid.className = "uuid";
  uuid.textContent = char.uuid;
  const props = document.createElement("span");
  props.className = "props";
  const list = propList(char.properties);
  props.textContent = list.join(", ");
  row.append(uuid, props);

  if (char.properties.read) {
    const btn = document.createElement("button");
    btn.className = "ghost small";
    btn.textContent = "Read";
    btn.onclick = async () => {
      try {
        const view = await char.readValue();
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        const text = new TextDecoder().decode(bytes).replace(/[^\x20-\x7e]/g, ".");
        log(`${char.uuid.slice(0, 8)} read: ${toHex(bytes)}  "${text}"`);
      } catch (err) {
        log(`Read failed: ${err.message}`);
      }
    };
    row.append(btn);
  }
  if (char.properties.notify || char.properties.indicate) {
    const btn = document.createElement("button");
    btn.className = "ghost small";
    btn.textContent = "Subscribe";
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await subscribe(char, false);
        btn.textContent = "Subscribed";
      } catch (err) {
        btn.disabled = false;
        log(`Subscribe failed: ${err.message}`);
      }
    };
    row.append(btn);
  }
  if (char.properties.write || char.properties.writeWithoutResponse) {
    const input = document.createElement("input");
    input.placeholder = "hex bytes, e.g. 01 02";
    const btn = document.createElement("button");
    btn.className = "ghost small";
    btn.textContent = "Write";
    btn.onclick = async () => {
      try {
        const bytes = encodeCommand(input.value, commandVars());
        await writeBytes(char, bytes);
        log(`${char.uuid.slice(0, 8)} ⇒ ${toHex(bytes)}`);
      } catch (err) {
        log(`Write failed: ${err.message}`);
      }
    };
    row.append(input, btn);
  }
  return row;
}

// ---------- profile import / export ----------

function exportProfile() {
  const blob = new Blob([JSON.stringify(collectProfile(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "beyond-power-profile.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importProfile(file) {
  try {
    const data = JSON.parse(await file.text());
    for (const [key, id] of Object.entries(profileFields)) {
      if (data[key] !== undefined) $(id).value = data[key];
    }
    saveProfile();
    log(`Imported profile from ${file.name}.`);
  } catch (err) {
    log(`Import failed: ${err.message}`);
  }
}

// ---------- install ----------

let installPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  $("installBtn").hidden = false;
});

// ---------- desktop app ----------

// In the Windows/Linux/Mac desktop app, the device chooser is drawn here instead of by a browser.
function setupDesktop() {
  const desktop = window.bpDesktop;
  if (!desktop) return;
  const dialog = $("devicePicker");
  const list = $("deviceList");

  desktop.onDevices((devices) => {
    if (!dialog.open) dialog.showModal();
    if (!devices.length) {
      list.innerHTML = '<p class="muted">Searching…</p>';
      return;
    }
    list.replaceChildren(
      ...devices.map((device) => {
        const btn = document.createElement("button");
        btn.className = "device";
        const name = document.createElement("span");
        name.textContent = device.name;
        const id = document.createElement("small");
        id.textContent = device.id;
        btn.append(name, id);
        btn.addEventListener("click", () => {
          desktop.chooseDevice(device.id);
          dialog.close();
        });
        return btn;
      })
    );
  });
  $("cancelPickerBtn").addEventListener("click", () => {
    desktop.chooseDevice("");
    dialog.close();
  });
  // Esc closes the dialog; tell the app nothing was picked.
  dialog.addEventListener("cancel", () => desktop.chooseDevice(""));
  dialog.addEventListener("close", () => {
    list.innerHTML = '<p class="muted">Searching…</p>';
  });

  desktop.onLog(log);
  desktop.onClosing(async () => {
    if (state.loaded) await unload();
    desktop.closeReady();
  });
}

// ---------- wiring ----------

function init() {
  loadProfile();
  renderWeight();
  renderLoad();

  if (!navigator.bluetooth) {
    $("btWarning").hidden = false;
    $("connectBtn").disabled = true;
  }

  document.querySelectorAll(".step").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = Number(btn.dataset.step);
      setWeightInUnit(displayWeight() + step);
    });
  });
  $("weightSlider").addEventListener("input", (e) => setWeightInUnit(Number(e.target.value)));
  $("unitBtn").addEventListener("click", () => {
    state.unit = state.unit === "lb" ? "kg" : "lb";
    renderWeight();
    savePrefs();
  });
  document.querySelectorAll(".mode").forEach((btn) => {
    btn.setAttribute("role", "radio");
    btn.addEventListener("click", () => setMode(Number(btn.dataset.mode)));
  });
  $("loadBtn").addEventListener("click", () => (state.loaded ? unload() : load()));
  $("stopBtn").addEventListener("click", unload);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") unload();
  });

  $("connectBtn").addEventListener("click", connect);
  $("demoBtn").addEventListener("click", () => (state.demo ? stopDemo() : startDemo()));
  $("resetRepsBtn").addEventListener("click", resetReps);
  $("saveProfileBtn").addEventListener("click", saveProfile);
  $("exportProfileBtn").addEventListener("click", exportProfile);
  $("importProfile").addEventListener("change", (e) => {
    if (e.target.files[0]) importProfile(e.target.files[0]);
    e.target.value = "";
  });
  $("clearLogBtn").addEventListener("click", () => ($("log").textContent = ""));
  $("installBtn").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $("installBtn").hidden = true;
  });

  // Best effort: release the load if the window is closed mid-set.
  window.addEventListener("pagehide", () => {
    if (state.loaded) unload();
  });

  setupDesktop();

  if ("serviceWorker" in navigator && !window.bpDesktop) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  log("Ready. Connect your machine or try demo mode.");
}

init();
