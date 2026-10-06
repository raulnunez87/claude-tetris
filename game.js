'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // N - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins ----
// Cada skin define `colors` (índice 0 = null, 1-8 = piezas) y `drawBlock`.
// El dispatcher `drawBlock` envuelve la llamada en save()/restore() para que
// ningún skin deje globalAlpha/shadowBlur/shadowColor alterados.

function drawBlockRetro(context, x, y, colorIndex, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = SKINS.retro.colors[colorIndex];
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBlockNeon(context, x, y, colorIndex, size, alpha) {
  const color = SKINS.neon.colors[colorIndex];
  const px = x * size + 2, py = y * size + 2, s = size - 4;
  context.globalAlpha = alpha ?? 1;
  // cuerpo de color pleno con resplandor (shadowBlur + shadowColor)
  context.shadowColor = color;
  context.shadowBlur = 14;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  // núcleo más claro para dar sensación de luz
  context.fillStyle = 'rgba(255,255,255,0.28)';
  context.fillRect(px + 3, py + 3, s - 6, s - 6);
  context.strokeStyle = '#ffffff';
  context.globalAlpha = (alpha ?? 1) * 0.6;
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  context.globalAlpha = 1;
  context.shadowBlur = 0;
}

// Rectángulo redondeado con arcTo (sin depender de roundRect)
function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawBlockPastel(context, x, y, colorIndex, size, alpha) {
  const color = SKINS.pastel.colors[colorIndex];
  const px = x * size + 2, py = y * size + 2, s = size - 4;
  const r = Math.max(2, size * 0.28);
  context.globalAlpha = alpha ?? 1;
  roundedRectPath(context, px, py, s, s, r);
  context.fillStyle = color;
  context.fill();
  // brillo suave arriba a la izquierda
  roundedRectPath(context, px + 3, py + 3, s * 0.55, s * 0.28, Math.min(r * 0.5, s * 0.12));
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fill();
  // borde sutil
  roundedRectPath(context, px, py, s, s, r);
  context.strokeStyle = 'rgba(80,60,110,0.35)';
  context.lineWidth = 1;
  context.stroke();
  context.globalAlpha = 1;
}

function drawBlockPixel(context, x, y, colorIndex, size, alpha) {
  const color = SKINS.pixel.colors[colorIndex];
  const px = x * size, py = y * size;
  const cells = 6;                    // cuadrícula de 6x6 "píxeles" por bloque
  const u = size / cells;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  // textura de tablero de ajedrez en dos tonos
  context.fillStyle = 'rgba(0,0,0,0.14)';
  for (let r = 0; r < cells; r++)
    for (let c = 0; c < cells; c++)
      if ((r + c) % 2 === 0) context.fillRect(px + c * u, py + r * u, u, u);
  // bisel claro arriba/izquierda
  context.fillStyle = 'rgba(255,255,255,0.55)';
  context.fillRect(px, py, size, u);
  context.fillRect(px, py, u, size);
  // bisel oscuro abajo/derecha
  context.fillStyle = 'rgba(0,0,0,0.55)';
  context.fillRect(px, py + size - u, size, u);
  context.fillRect(px + size - u, py, u, size);
  context.globalAlpha = 1;
}

const SKINS = {
  retro: {
    name: 'Retro',
    colors: COLORS,
    drawBlock: drawBlockRetro,
  },
  neon: {
    name: 'Neón',
    colors: [
      null,
      '#00e5ff', // I
      '#ffea00', // O
      '#d500f9', // T
      '#00e676', // S
      '#ff1744', // Z
      '#2979ff', // J
      '#ff9100', // L
      '#b0bec5', // N
    ],
    drawBlock: drawBlockNeon,
  },
  pastel: {
    name: 'Pastel',
    colors: [
      null,
      '#8fd9e6', // I
      '#ffe58f', // O
      '#cc9fe8', // T
      '#a3e3b2', // S
      '#f4a3a9', // Z
      '#a0c4f2', // J
      '#f8c08a', // L
      '#bdbdc8', // N
    ],
    drawBlock: drawBlockPastel,
  },
  pixel: {
    name: 'Pixel art',
    colors: [
      null,
      '#2bb3c0', // I
      '#e6b800', // O
      '#9c3fb5', // T
      '#3f9b4a', // S
      '#c62f2f', // Z
      '#3a6fd1', // J
      '#e07b12', // L
      '#757575', // N
    ],
    drawBlock: drawBlockPixel,
  },
};

const DEFAULT_SKIN = 'retro';
let currentSkin = DEFAULT_SKIN;

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  SKINS[currentSkin].drawBlock(context, x, y, colorIndex, size, alpha);
  context.restore();
}

function applySkin(id) {
  currentSkin = Object.prototype.hasOwnProperty.call(SKINS, id) ? id : DEFAULT_SKIN;
  for (const key of Object.keys(SKINS)) document.body.classList.remove('skin-' + key);
  document.body.classList.add('skin-' + currentSkin);
  // Redibuja de inmediato (también en pausa o game over); seguro si aún no hay estado
  if (board && current) draw();
  if (next) drawNext();
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target && /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName) && e.code !== 'KeyP') return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

const themeToggle = document.getElementById('theme-toggle');
const toggleIcon = themeToggle.querySelector('.toggle-icon');
const toggleLabel = themeToggle.querySelector('.toggle-label');

function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    toggleIcon.textContent = '☀';
    toggleLabel.textContent = 'DARK';
  } else {
    document.body.classList.remove('light-mode');
    toggleIcon.textContent = '☾';
    toggleLabel.textContent = 'LIGHT';
  }
}

const savedTheme = localStorage.getItem('tetris-theme');
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
});

// ---- Skins: selector y persistencia ----
const skinSelect = document.getElementById('skin-select');

for (const [id, skin] of Object.entries(SKINS)) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = skin.name;
  skinSelect.appendChild(opt);
}

let savedSkin = DEFAULT_SKIN;
try { savedSkin = localStorage.getItem('tetris-skin') || DEFAULT_SKIN; } catch (e) {}
applySkin(savedSkin);
skinSelect.value = currentSkin;

// Escape/Enter sueltan el foco para que las teclas de juego vuelvan a funcionar
skinSelect.addEventListener('keydown', e => {
  if (e.code === 'Escape' || e.code === 'Enter') skinSelect.blur();
});

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  try { localStorage.setItem('tetris-skin', currentSkin); } catch (e) {}
  skinSelect.blur();
});

init();