// Records a short Car Dash gameplay video in an emulated iPhone viewport.
// Usage: node tools/record-iphone-demo.js  (requires Playwright and ffmpeg)
// Also exports recordRun() for tools/record-iphone-duo.js.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium, devices } = require('playwright');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'media');
const outFile = path.join(outDir, 'car-dash-iphone-demo.mp4');
const { defaultBrowserType, ...iphone } = devices['iPhone 17 Pro'];
const scale = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Picks the lane with the most clearance ahead of the player.
async function chooseLane(page) {
  return page.evaluate(() => {
    const p = state.player;
    const clearance = [0, 1, 2].map((lane) => {
      const ahead = state.enemies
        .filter((e) => e.lane === lane && e.y + e.height > p.y - 400 && e.y < p.y + p.height)
        .map((e) => p.y - (e.y + e.height));
      return ahead.length ? Math.min(...ahead) : Infinity;
    });
    const current = state.targetLane;
    const neighbors = [current - 1, current + 1].filter((l) => l >= 0 && l <= 2);
    if (clearance[current] > 300) return current;
    return neighbors.sort((a, b) => clearance[b] - clearance[a])[0];
  });
}

async function steerTo(page, lane) {
  const { current, gameOver } = await page.evaluate(() => ({ current: state.targetLane, gameOver: state.gameOver }));
  if (gameOver || lane === current) return;
  // The round can end between the check and the tap; the main loop handles that.
  await page.tap(`[data-direction="${lane > current ? 1 : -1}"]`, { timeout: 1000 }).catch(() => {});
}

// Plays about a minute of Car Dash and returns the path of the raw .webm recording.
async function recordRun(browser, { viewport = iphone.viewport, dir }) {
  const context = await browser.newContext({
    ...iphone,
    viewport,
    // Playwright never scales recordings up, so record at CSS size and upscale with ffmpeg.
    recordVideo: { dir, size: viewport },
  });
  const page = await context.newPage();
  await page.goto(`file://${path.join(root, 'index.html')}`);
  await sleep(1500);

  await page.tap('[data-action="start"]');
  const pressGas = (pressed) => page.evaluate(
    (down) => setPedal(document.querySelector('[data-pedal="gas"]'), down), pressed,
  );
  const start = Date.now();
  let holdingGas = false;

  // Dodge traffic for ~54 seconds, pulsing the gas pedal and grabbing gas stations.
  // An early crash ends the round, so tap Play again and keep driving.
  while (Date.now() - start < 54000) {
    if (await page.evaluate(() => state.gameOver)) {
      holdingGas = false;
      await sleep(2000);
      await page.tap('[data-action="start"]');
      continue;
    }
    const t = Date.now() - start;
    const wantGas = t > 3000 && Math.floor(t / 2500) % 2 === 0;
    if (wantGas !== holdingGas) {
      await pressGas(wantGas);
      holdingGas = wantGas;
    }

    const station = await page.evaluate(() => state.gasStations[0] && state.gasStations[0].side);
    let lane = await chooseLane(page);
    if (station) {
      const stationLane = station === 'left' ? 0 : 2;
      const safe = await page.evaluate((l) => !state.enemies.some(
        (e) => e.lane === l && e.y + e.height > state.player.y - 200 && e.y < state.player.y + state.player.height,
      ), stationLane);
      if (safe) lane = stationLane > lane ? lane + 1 : stationLane < lane ? lane - 1 : lane;
    }
    await steerTo(page, lane);
    await sleep(60);
  }
  if (holdingGas) await pressGas(false);

  // Finish by steering into the next car, which wins the game.
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !(await page.evaluate(() => state.gameOver))) {
    const lane = await page.evaluate(() => {
      const next = state.enemies
        .filter((e) => e.y < state.player.y)
        .sort((a, b) => b.y - a.y)[0];
      return next ? next.lane : state.targetLane;
    });
    await steerTo(page, lane);
    await sleep(150);
  }
  await sleep(2500);

  const video = page.video();
  await context.close();
  return video.path();
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cardash-video-'));
  const browser = await chromium.launch();
  const webm = await recordRun(browser, { dir: tmpDir });
  await browser.close();

  fs.mkdirSync(outDir, { recursive: true });
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', webm, '-vf', `scale=iw*${scale}:ih*${scale}:flags=lanczos`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart',
    outFile,
  ]);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`Saved ${path.relative(root, outFile)}`);
}

module.exports = { recordRun, iphone, scale };

if (require.main === module) {
  main();
}
