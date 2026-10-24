const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const fuelEl = document.getElementById('fuel');
const fuelMeterEl = document.getElementById('fuelMeter');
const fuelBarEl = document.getElementById('fuelBar');
const messageEl = document.getElementById('message');
const winMessageEl = document.getElementById('winMessage');
let winMessageTimer;

const laneCount = 3;
const road = {
  x: 70,
  width: 280,
  laneWidth: 280 / laneCount,
  speed: 4,
  scroll: 0,
};

const state = {
  started: false,
  gameOver: false,
  score: 0,
  fuel: 100,
  gasPressed: false,
  backPressed: false,
  best: Number(localStorage.getItem('carGameBest') || 0),
  lastTime: 0,
  spawnTimer: 0,
  stationSpawnTimer: 0,
  enemySpeed: 4,
  targetLane: 1,
  player: {
    lane: 1,
    x: 0,
    y: canvas.height - 110,
    width: 42,
    height: 78,
    color: '#4ca8ff',
    tilt: 0,
  },
  enemies: [],
  gasStations: [],
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function laneCenter(laneIndex) {
  return road.x + road.laneWidth * laneIndex + road.laneWidth / 2;
}

function resetPlayerPosition() {
  state.player.x = laneCenter(state.player.lane) - state.player.width / 2;
  state.player.y = canvas.height - 112;
  state.player.tilt = 0;
}

function showMessage(title, description, actionLabel) {
  messageEl.innerHTML = `
    <div>
      <h1>${title}</h1>
      <p>${description}</p>
      <button class="action-button" type="button" data-action="start">${actionLabel}</button>
    </div>
  `;
  messageEl.classList.add('visible');
}

function resetGame() {
  clearTimeout(winMessageTimer);
  winMessageEl.classList.remove('visible');
  state.started = false;
  state.gameOver = false;
  state.score = 0;
  state.fuel = 100;
  state.gasPressed = false;
  state.backPressed = false;
  state.spawnTimer = 0;
  state.stationSpawnTimer = 0;
  state.enemySpeed = 4;
  state.enemies = [];
  state.gasStations = [];
  state.targetLane = 1;
  state.player.lane = state.targetLane;
  resetPlayerPosition();
  scoreEl.textContent = '0';
  showMessage('Car Dash', 'Dodge traffic with the arrow keys, A/D, or the buttons below.', 'Start game');
}

function beginGame() {
  if (state.gameOver) {
    resetGame();
  }

  state.started = true;
  messageEl.classList.remove('visible');
}

function movePlayer(direction) {
  if (!state.started) {
    return;
  }

  state.targetLane = clamp(state.targetLane + direction, 0, laneCount - 1);
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  bestEl.textContent = String(state.best);
  const fuel = Math.ceil(state.fuel);
  fuelEl.textContent = `${fuel}%`;
  fuelMeterEl.setAttribute('aria-valuenow', String(fuel));
  fuelBarEl.style.width = `${fuel}%`;
  fuelMeterEl.classList.toggle('low', fuel <= 25);
}

function winGame() {
  state.started = false;
  state.gameOver = true;
  state.gasPressed = false;
  state.backPressed = false;
  clearTimeout(winMessageTimer);
  winMessageEl.classList.remove('visible');
  document.querySelectorAll('[data-pedal]').forEach((button) => {
    button.classList.remove('pressed');
  });

  updateHud();
  showMessage('You win!', `Your score: ${Math.floor(state.score)}.`, 'Play again');
}

function updateBestScore() {
  if (Math.floor(state.score) > state.best) {
    state.best = Math.floor(state.score);
    localStorage.setItem('carGameBest', String(state.best));
  }
}

function showRefuelMessage() {
  clearTimeout(winMessageTimer);
  winMessageEl.textContent = 'Refueled!';
  winMessageEl.classList.add('visible');
  winMessageTimer = setTimeout(() => {
    winMessageEl.classList.remove('visible');
  }, 1200);
}

function spawnEnemy() {
  const lane = Math.floor(Math.random() * laneCount);
  const colors = ['#ff5a5f', '#f7b801', '#7bd389', '#d97af1'];
  const width = 42;
  const height = 78;
  const x = laneCenter(lane) - width / 2;

  state.enemies.push({
    x,
    y: -height - 20,
    width,
    height,
    color: colors[Math.floor(Math.random() * colors.length)],
    lane,
  });
}

function spawnGasStation() {
  const side = Math.random() < 0.5 ? 'left' : 'right';
  const width = 60;
  const height = 70;

  state.gasStations.push({
    x: side === 'left' ? 5 : canvas.width - width - 5,
    y: -height,
    width,
    height,
    side,
  });
}

function update(dt) {
  if (!state.started) {
    return;
  }

  state.player.lane += (state.targetLane - state.player.lane) * Math.min(1, dt / 90);
  state.player.x = laneCenter(state.player.lane) - state.player.width / 2;
  state.player.tilt = (state.player.lane - 1) * 10;

  state.score += dt * 0.02;
  updateBestScore();
  const usingGas = state.gasPressed && !state.backPressed && state.fuel > 0;
  if (usingGas) {
    state.fuel = Math.max(0, state.fuel - dt * 0.005);
  }
  const speedMultiplier = state.backPressed ? 0.45 : usingGas ? 1.8 : 1;
  const trafficSpeed = state.enemySpeed * speedMultiplier;
  state.enemySpeed += dt * 0.0003;
  road.scroll = (road.scroll + trafficSpeed * (dt / 16.67)) % 54;

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy();
    state.spawnTimer = clamp(1200 - state.score * 10, 550, 1200);
  }

  state.stationSpawnTimer -= dt;
  if (state.stationSpawnTimer <= 0) {
    spawnGasStation();
    state.stationSpawnTimer = 10000;
  }

  for (const enemy of state.enemies) {
    enemy.y += trafficSpeed * (dt / 16.67);
  }

  for (const station of state.gasStations) {
    station.y += trafficSpeed * (dt / 16.67);
  }

  state.enemies = state.enemies.filter((enemy) => enemy.y < canvas.height + 100);
  state.gasStations = state.gasStations.filter((station) => station.y < canvas.height + 100);

  for (let index = state.gasStations.length - 1; index >= 0; index--) {
    const station = state.gasStations[index];
    const matchingLane = station.side === 'left'
      ? state.player.lane < 0.5
      : state.player.lane > laneCount - 1.5;
    const passingStation = station.y + station.height >= state.player.y &&
      station.y <= state.player.y + state.player.height;

    if (matchingLane && passingStation) {
      state.fuel = Math.min(100, state.fuel + 45);
      showRefuelMessage();
      state.gasStations.splice(index, 1);
    }
  }

  for (let index = state.enemies.length - 1; index >= 0; index--) {
    const enemy = state.enemies[index];
    const hit = !!(
      state.player.x < enemy.x + enemy.width &&
      state.player.x + state.player.width > enemy.x &&
      state.player.y < enemy.y + enemy.height &&
      state.player.y + state.player.height > enemy.y
    );

    if (hit) {
      state.enemies.splice(index, 1);
      winGame();
      return;
    }
  }

  updateHud();
}

function drawRoad() {
  ctx.fillStyle = '#1b2430';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // grass shoulders
  ctx.fillStyle = '#2c9b6a';
  ctx.fillRect(0, 0, road.x, canvas.height);
  ctx.fillRect(road.x + road.width, 0, canvas.width - (road.x + road.width), canvas.height);

  // road
  ctx.fillStyle = road.speed ? '#2a323d' : '#202a35';
  ctx.fillRect(road.x, 0, road.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 4;
  ctx.setLineDash([30, 24]);
  ctx.lineDashOffset = -road.scroll;
  ctx.beginPath();
  ctx.moveTo(road.x + road.laneWidth, 0);
  ctx.lineTo(road.x + road.laneWidth, canvas.height);
  ctx.moveTo(road.x + road.laneWidth * 2, 0);
  ctx.lineTo(road.x + road.laneWidth * 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  // road edge lines
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(road.x, 0);
  ctx.lineTo(road.x, canvas.height);
  ctx.moveTo(road.x + road.width, 0);
  ctx.lineTo(road.x + road.width, canvas.height);
  ctx.stroke();
}

function drawCar(car, isEnemy = false) {
  const { x, y, width, height, color, tilt } = car;
  const bodyColor = color;

  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((tilt * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);

  ctx.fillStyle = bodyColor;
  ctx.fillRect(5, 8, width - 10, height - 16);

  ctx.fillStyle = '#dfeaff';
  ctx.fillRect(10, 18, width - 20, 18);
  ctx.fillRect(10, height - 38, width - 20, 16);

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 12, 6, 16);
  ctx.fillRect(width - 6, 12, 6, 16);
  ctx.fillRect(0, height - 28, 6, 16);
  ctx.fillRect(width - 6, height - 28, 6, 16);

  ctx.fillStyle = '#e0f0ff';
  ctx.fillRect(10, 0, width - 20, 9);
  ctx.fillStyle = '#f4f7fb';
  ctx.fillRect(10, 2, width - 20, 5);

  if (isEnemy) {
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(width * 0.15, 0, 7, 10);
    ctx.fillRect(width * 0.7, 0, 7, 10);
  }

  ctx.restore();
}

function drawGasStation(station) {
  const { x, y, width, height } = station;

  ctx.fillStyle = '#e8edf2';
  ctx.fillRect(x + 8, y + 15, width - 16, height - 15);
  ctx.fillStyle = '#e94b4b';
  ctx.fillRect(x + 4, y + 8, width - 8, 12);
  ctx.fillStyle = '#b82f38';
  ctx.fillRect(x + 8, y + 20, width - 16, 5);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('GAS', x + width / 2, y + 17);

  ctx.fillStyle = '#c5d0da';
  ctx.fillRect(x + 21, y + 31, 20, 29);
  ctx.fillStyle = '#e94b4b';
  ctx.fillRect(x + 24, y + 34, 14, 8);
  ctx.fillStyle = '#263443';
  ctx.fillRect(x + 25, y + 46, 12, 3);
  ctx.fillRect(x + 34, y + 49, 3, 8);
  ctx.strokeStyle = '#263443';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 41, y + 36);
  ctx.bezierCurveTo(x + 52, y + 36, x + 47, y + 50, x + 42, y + 50);
  ctx.stroke();
}

function drawBackground() {
  drawRoad();

  for (const station of state.gasStations) {
    drawGasStation(station);
  }

  for (const enemy of state.enemies) {
    drawCar(enemy, true);
  }

  drawCar(state.player, false);
}

function loop(timestamp) {
  const dt = Math.min(32, timestamp - state.lastTime || 16);
  state.lastTime = timestamp;

  update(dt);
  drawBackground();

  requestAnimationFrame(loop);
}

function setPedal(button, pressed) {
  const pedal = button.dataset.pedal;
  state[`${pedal}Pressed`] = pressed;
  button.classList.toggle('pressed', pressed);
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();

  if (key === 'arrowleft' || key === 'a') {
    event.preventDefault();
    if (!event.repeat) {
      movePlayer(-1);
    }
  }

  if (key === 'arrowright' || key === 'd') {
    event.preventDefault();
    if (!event.repeat) {
      movePlayer(1);
    }
  }

  if (key === 'arrowup' || key === 'w') {
    event.preventDefault();
    state.gasPressed = true;
  }

  if (key === 'arrowdown' || key === 's') {
    event.preventDefault();
    state.backPressed = true;
  }

  if (key === ' ' || key === 'enter') {
    event.preventDefault();
    if (!state.started) {
      beginGame();
    }
  }
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'arrowup' || key === 'w') {
    state.gasPressed = false;
  }
  if (key === 'arrowdown' || key === 's') {
    state.backPressed = false;
  }
});

window.addEventListener('blur', () => {
  state.gasPressed = false;
  state.backPressed = false;
  document.querySelectorAll('[data-pedal]').forEach((button) => {
    button.classList.remove('pressed');
  });
});

messageEl.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-action="start"]')) {
    beginGame();
  }
});

document.querySelectorAll('.control-button').forEach((button) => {
  if (button.hasAttribute('data-direction')) {
    button.addEventListener('click', () => {
      movePlayer(Number(button.dataset.direction));
    });
  }
});

document.querySelectorAll('[data-pedal]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    setPedal(button, true);
  });

  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(eventName, () => setPedal(button, false));
  }
});

updateHud();
resetGame();
requestAnimationFrame(loop);
