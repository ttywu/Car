// Records two Car Dash runs and places them side by side in realistic iPhone frames.
// Usage: node tools/record-iphone-duo.js  (requires Playwright and ffmpeg)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { recordRun, iphone, scale } = require('./record-iphone-demo');

const root = path.resolve(__dirname, '..');
const outFile = path.join(root, 'media', 'car-dash-iphone-duo.mp4');

// Full iPhone screen, as when the game is added to the Home Screen.
const viewport = { width: iphone.screen.width, height: iphone.screen.height };
const screenW = viewport.width * scale;
const screenH = viewport.height * scale;
const bezel = 36;
const frameW = screenW + bezel * 2;
const frameH = screenH + bezel * 2;
const out = { width: 1920, height: 1080 };
const phoneH = 980;
const phoneW = Math.round((frameW * phoneH) / frameH / 2) * 2;
const gap = 140;

const frameHtml = `<!doctype html><html><body style="margin:0;background:transparent">
<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b8f96"/><stop offset="0.5" stop-color="#3d4046"/><stop offset="1" stop-color="#9a9ea5"/>
    </linearGradient>
    <mask id="screen">
      <rect width="100%" height="100%" fill="white"/>
      <rect x="${bezel}" y="${bezel}" width="${screenW}" height="${screenH}" rx="110" fill="black"/>
    </mask>
  </defs>
  <g mask="url(#screen)">
    <rect width="${frameW}" height="${frameH}" rx="${110 + bezel}" fill="url(#edge)"/>
    <rect x="6" y="6" width="${frameW - 12}" height="${frameH - 12}" rx="${104 + bezel}" fill="#050505"/>
  </g>
  <rect x="${frameW / 2 - 126}" y="${bezel + 22}" width="252" height="74" rx="37" fill="#000"/>
  <g fill="#fff" font-family="Arial, Helvetica, sans-serif" font-weight="700">
    <text x="${bezel + 150}" y="${bezel + 72}" font-size="34" text-anchor="middle">9:41</text>
    <g transform="translate(${frameW - bezel - 230}, ${bezel + 48})">
      <rect x="0" y="18" width="7" height="10" rx="2"/><rect x="11" y="13" width="7" height="15" rx="2"/>
      <rect x="22" y="7" width="7" height="21" rx="2"/><rect x="33" y="1" width="7" height="27" rx="2"/>
      <path d="M62 10 a24 24 0 0 1 34 0 l-4 4 a18 18 0 0 0 -26 0z M69 17 a14 14 0 0 1 20 0 l-4 4 a8 8 0 0 0 -12 0z M76 24 l3 -3 l3 3 l-3 3z"/>
      <rect x="112" y="2" width="50" height="25" rx="7" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="3"/>
      <rect x="117" y="7" width="38" height="15" rx="3"/><rect x="165" y="10" width="4" height="9" rx="2" fill-opacity="0.5"/>
    </g>
  </g>
</svg></body></html>`;

const backgroundHtml = `<!doctype html><html><body style="margin:0;width:${out.width}px;height:${out.height}px;
  background:radial-gradient(circle at 50% 30%, #1d3b57 0%, #0b1220 60%, #05080f 100%)"></body></html>`;

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardash-duo-'));
  const browser = await chromium.launch();

  const page = await browser.newPage({ viewport: { width: frameW, height: frameH } });
  await page.setContent(frameHtml);
  const framePng = path.join(tmpDir, 'frame.png');
  await page.screenshot({ path: framePng, omitBackground: true });
  await page.setViewportSize(out);
  await page.setContent(backgroundHtml);
  const bgPng = path.join(tmpDir, 'background.png');
  await page.screenshot({ path: bgPng });
  await page.close();

  const [left, right] = await Promise.all([1, 2].map((n) => {
    const dir = path.join(tmpDir, `run${n}`);
    fs.mkdirSync(dir);
    return recordRun(browser, { viewport, dir });
  }));
  await browser.close();

  const x1 = Math.round((out.width - phoneW * 2 - gap) / 2);
  const x2 = x1 + phoneW + gap;
  const y = Math.round((out.height - phoneH) / 2);
  const phone = (input, label) => `[${input}:v]scale=${screenW}:${screenH}:flags=lanczos,format=rgba,pad=${frameW}:${frameH}:${bezel}:${bezel}:black@0[s${label}];`
    + `[s${label}][f${label}]overlay=0:0,scale=${phoneW}:${phoneH}[p${label}];`;
  const filter = `[3:v]split[fa][fb];${phone(1, 'a')}${phone(2, 'b')}`
    + `[0:v][pa]overlay=${x1}:${y}:shortest=1[bg1];[bg1][pb]overlay=${x2}:${y}:shortest=1,format=yuv420p[v]`;

  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-loop', '1', '-i', bgPng, '-i', left, '-i', right, '-i', framePng,
    '-filter_complex', filter, '-map', '[v]', '-r', '30',
    '-c:v', 'libx264', '-crf', '22', '-movflags', '+faststart',
    outFile,
  ]);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`Saved ${path.relative(root, outFile)}`);
})();
