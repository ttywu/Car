const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const messageEl = document.getElementById('message');

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
  best: Number(localStorage.getItem('carGameBest') || 0),
  lastTime: 0,
  spawnTimer: 0,
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
  state.started = false;
  state.gameOver = false;
  state.score = 0;
  state.spawnTimer = 0;
  state.enemySpeed = 4;
  state.enemies = [];
  state.targetLane = 1;
  state.player.lane = state.targetLane;
  resetPlayerPosition();
  scoreEl.textContent = '0';
  showMessage('Car Dash', 'Dodge traffic with the arrow keys, A/D, or the buttons below.', 'Start game');
}

function beginGame() {
  if (state.gameOver) {
    state.enemies = [];
    state.score = 0;
    state.spawnTimer = 0;
    state.enemySpeed = 4;
    state.targetLane = 1;
    state.player.lane = state.targetLane;
    resetPlayerPosition();
  }

  state.started = true;
  state.gameOver = false;
  messageEl.classList.remove('visible');
}

function movePlayer(direction) {
  if (!state.started || state.gameOver) {
    return;
  }

  state.targetLane = clamp(state.targetLane + direction, 0, laneCount - 1);
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  bestEl.textContent = String(state.best);
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

function update(dt) {
  if (!state.started || state.gameOver) {
    return;
  }

  state.player.lane += (state.targetLane - state.player.lane) * Math.min(1, dt / 90);
  state.player.x = laneCenter(state.player.lane) - state.player.width / 2;
  state.player.tilt = (state.player.lane - 1) * 10;

  state.score += dt * 0.02;
  state.enemySpeed += dt * 0.0008;
  road.scroll = (road.scroll + state.enemySpeed * (dt / 16.67)) % 54;

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy();
    state.spawnTimer = clamp(1200 - state.score * 10, 550, 1200);
  }

  for (const enemy of state.enemies) {
    enemy.y += state.enemySpeed * (dt / 16.67);
  }

  state.enemies = state.enemies.filter((enemy) => enemy.y < canvas.height + 100);

  for (const enemy of state.enemies) {
    const hit = !!(
      state.player.x < enemy.x + enemy.width &&
      state.player.x + state.player.width > enemy.x &&
      state.player.y < enemy.y + enemy.height &&
      state.player.y + state.player.height > enemy.y
    );

    if (hit) {
      state.gameOver = true;
      state.best = Math.max(state.best, Math.floor(state.score));
      localStorage.setItem('carGameBest', String(state.best));
      showMessage('Crash!', `Score: ${Math.floor(state.score)}`, 'Play again');
      updateHud();
      return;
    }
  }

  if (Math.floor(state.score) > state.best) {
    state.best = Math.floor(state.score);
    localStorage.setItem('carGameBest', String(state.best));
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

function drawBackground() {
  drawRoad();

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

  if (key === ' ' || key === 'enter') {
    event.preventDefault();
    if (!state.started || state.gameOver) {
      beginGame();
    }
  }
});

messageEl.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-action="start"]')) {
    beginGame();
  }
});

document.querySelectorAll('.control-button').forEach((button) => {
  button.addEventListener('click', () => {
    movePlayer(Number(button.dataset.direction));
  });
});

updateHud();
resetGame();
requestAnimationFrame(loop);
