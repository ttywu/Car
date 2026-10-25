// Copies the shared web UI from ../beyond-power into ./app so Electron can package it.
const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "..", "beyond-power");
const target = path.join(__dirname, "..", "app");
const files = ["index.html", "app.js", "style.css", "icon.svg", "manifest.webmanifest"];

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(source, file), path.join(target, file));
}
console.log(`Copied ${files.length} files to ${target}`);
