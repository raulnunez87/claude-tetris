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
    level = baseLevel + Math.floor(lines / 10);
    dropInterval = speedFor(level);
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    updateHUD();
  } else {
    combo = 0;
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
  showGameOverRecords();
  overlay.classList.remove('hidden');
  focusNameInput();
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
  baseLevel = startLevel; // fija el nivel de esta partida
  level = baseLevel;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  hideGameOverRecords();
  dropInterval = speedFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Records ----
const RECORDS_KEY = 'tetris-records';
const LAST_NAME_KEY = 'tetris-last-name';
const MAX_SCORES = 5;
const MAX_NAME_LEN = 12;

const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const startRecordsEl = document.getElementById('start-records');
const startStatsEl = document.getElementById('start-stats');
const overlayRecords = document.getElementById('overlay-records');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordBadge = document.getElementById('record-badge');
const overRecordsEl = document.getElementById('over-records');
const overStatsEl = document.getElementById('over-stats');

let combo = 0;
let maxCombo = 0;
let pendingRecord = null;

function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || typeof data !== 'object') return emptyRecords();
    const scores = (Array.isArray(data.scores) ? data.scores : [])
      .filter(r => r && Number.isFinite(r.score))
      .map(r => ({
        name: String(r.name ?? '').slice(0, MAX_NAME_LEN) || 'Anónimo',
        score: r.score,
        lines: Number.isFinite(r.lines) ? r.lines : 0,
        level: Number.isFinite(r.level) ? r.level : 1,
        date: typeof r.date === 'string' ? r.date : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
    return {
      scores,
      bestCombo: Number.isFinite(data.bestCombo) ? data.bestCombo : 0,
      maxLines: Number.isFinite(data.maxLines) ? data.maxLines : 0,
    };
  } catch (e) {
    return emptyRecords();
  }
}

function saveRecords(rec) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(rec));
  } catch (e) { /* almacenamiento no disponible */ }
}

function loadLastName() {
  try { return localStorage.getItem(LAST_NAME_KEY) || ''; } catch (e) { return ''; }
}

function saveLastName(name) {
  try { localStorage.setItem(LAST_NAME_KEY, name); } catch (e) { /* ignorar */ }
}

function qualifiesForTop(rec, pts) {
  if (pts <= 0) return false;
  return rec.scores.length < MAX_SCORES || pts > rec.scores[rec.scores.length - 1].score;
}

function statsText(rec) {
  return `Mejor combo: ${rec.bestCombo} · Líneas máximas: ${rec.maxLines}`;
}

// Los nombres son entrada del usuario: todo se escribe con textContent.
function renderRecords(tableBox, statsBox, rec, highlight) {
  tableBox.textContent = '';
  const table = document.createElement('table');
  table.className = 'records-table';
  const head = table.createTHead().insertRow();
  ['#', 'Nombre', 'Puntos', 'Líneas'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  });
  const body = table.createTBody();
  if (rec.scores.length === 0) {
    const td = body.insertRow().insertCell();
    td.colSpan = 4;
    td.className = 'records-empty';
    td.textContent = 'Sin récords todavía';
  }
  rec.scores.forEach((r, i) => {
    const tr = body.insertRow();
    if (r === highlight) tr.className = 'records-highlight';
    [i + 1, r.name, r.score.toLocaleString(), r.lines].forEach(v => {
      tr.insertCell().textContent = v;
    });
  });
  tableBox.appendChild(table);
  statsBox.textContent = statsText(rec);
}

function hideGameOverRecords() {
  // Si se reinicia sin pulsar Guardar, no se pierde la puntuación que entraba en el top
  if (pendingRecord) commitPendingRecord();
  overlayRecords.classList.add('hidden');
  nameForm.classList.add('hidden');
  recordBadge.classList.add('hidden');
}

function showGameOverRecords() {
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);

  pendingRecord = null;
  recordBadge.classList.add('hidden');
  overlayRecords.classList.remove('hidden');
  if (qualifiesForTop(rec, score)) {
    pendingRecord = { score, lines, level };
    nameForm.classList.remove('hidden');
    nameInput.value = loadLastName().slice(0, MAX_NAME_LEN);
    overRecordsEl.textContent = '';
    overStatsEl.textContent = statsText(rec);
  } else {
    nameForm.classList.add('hidden');
    renderRecords(overRecordsEl, overStatsEl, rec, null);
  }
}

function commitPendingRecord() {
  const name = nameInput.value.trim().slice(0, MAX_NAME_LEN) || 'Anónimo';
  const entry = {
    name,
    score: pendingRecord.score,
    lines: pendingRecord.lines,
    level: pendingRecord.level,
    date: new Date().toISOString(),
  };
  pendingRecord = null;
  const rec = loadRecords();
  rec.scores.push(entry);
  // sort estable: ante un empate, la entrada nueva queda por debajo
  rec.scores.sort((a, b) => b.score - a.score);
  rec.scores = rec.scores.slice(0, MAX_SCORES);
  saveRecords(rec);
  saveLastName(name);
  return { rec, entry };
}

function focusNameInput() {
  if (pendingRecord) { nameInput.focus(); nameInput.select(); }
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!pendingRecord) return;
  const { rec, entry } = commitPendingRecord();
  nameForm.classList.add('hidden');
  recordBadge.classList.remove('hidden');
  // saveRecords no muta rec, así que entry sigue siendo la misma referencia en rec.scores
  renderRecords(overRecordsEl, overStatsEl, rec, entry);
  restartBtn.focus();
});

function showStartScreen() {
  renderRecords(startRecordsEl, startStatsEl, loadRecords(), null);
  startScreen.classList.remove('hidden');
  playBtn.focus();
}

function startGame() {
  if (startScreen.classList.contains('hidden')) return;
  startScreen.classList.add('hidden');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  init();
}

playBtn.addEventListener('click', startGame);

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Seguro que quieres borrar todos los récords?')) return;
  try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* ignorar */ }
  renderRecords(startRecordsEl, startStatsEl, emptyRecords(), null);
});

function isTypingTarget(t) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT' || t.isContentEditable);
}

document.addEventListener('keydown', e => {
  const t = e.target;
  const inField = isTypingTarget(t);
  // Pantalla de inicio: solo Enter (para jugar); no se atiende pausa ni controles
  if (!startScreen.classList.contains('hidden')) {
    if (inField) return;
    const onOtherBtn = t.tagName === 'BUTTON' && t !== playBtn;
    if (e.code === 'Enter' && !onOtherBtn) { e.preventDefault(); startGame(); }
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    // Con un campo enfocado solo se atiende P/Esc si es el menú de pausa;
    // en el <select> la P se deja para la búsqueda por letra.
    if (inField && (!pauseMenu.contains(t) || (t.tagName === 'SELECT' && e.code === 'KeyP'))) return;
    if (gameOver) return;
    e.preventDefault();
    if (!e.repeat) togglePause();
    return;
  }
  if (inField) return;
  if (paused || gameOver || isInputBlocked(e)) return;
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

let savedTheme = null;
try { savedTheme = localStorage.getItem('tetris-theme'); } catch (err) { /* almacenamiento no disponible */ }
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  try { localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark'); } catch (err) { /* almacenamiento no disponible */ }
});

// ---- Menú de pausa ----
const START_LEVEL_KEY = 'tetris-start-level';
const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 10;
const RESUME_INPUT_DELAY = 150; // ms sin aceptar teclas del juego tras reanudar

const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');

let startLevel = loadStartLevel(); // ajuste elegido en el menú (próxima partida)
let baseLevel = startLevel;        // nivel con el que empezó la partida en curso
let inputBlockedUntil = 0;
const freshKeys = new Set(); // teclas pulsadas (no repetidas) desde la última reanudación

function speedFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function clampStartLevel(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n)) return MIN_START_LEVEL;
  return Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, n));
}

function loadStartLevel() {
  try {
    return clampStartLevel(localStorage.getItem(START_LEVEL_KEY));
  } catch (err) {
    return MIN_START_LEVEL;
  }
}

function saveStartLevel(n) {
  try {
    localStorage.setItem(START_LEVEL_KEY, String(n));
  } catch (err) { /* almacenamiento no disponible */ }
}

// Ignora teclas del juego justo tras reanudar y repeticiones de teclas
// que ya estaban mantenidas al reanudar (hasta soltarlas y volver a pulsar).
function isInputBlocked(e) {
  const inWindow = performance.now() < inputBlockedUntil;
  if (e.repeat) return inWindow || !freshKeys.has(e.code);
  freshKeys.add(e.code); // pulsación nueva: sus repeticiones sí valdrán
  return inWindow;
}

function openPauseMenu() {
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
  pauseControls.classList.add('hidden');
  controlsBtn.setAttribute('aria-expanded', 'false');
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  inputBlockedUntil = performance.now() + RESUME_INPUT_DELAY;
  freshKeys.clear();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    openPauseMenu();
  }
}

for (let n = MIN_START_LEVEL; n <= MAX_START_LEVEL; n++) {
  const opt = document.createElement('option');
  opt.value = String(n);
  opt.textContent = String(n);
  startLevelSelect.appendChild(opt);
}
startLevelSelect.value = String(startLevel);

startLevelSelect.addEventListener('change', () => {
  startLevel = clampStartLevel(startLevelSelect.value);
  saveStartLevel(startLevel);
});

resumeBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => {
  const open = pauseControls.classList.toggle('hidden') === false;
  controlsBtn.setAttribute('aria-expanded', String(open));
});

document.addEventListener('keyup', e => freshKeys.delete(e.code));
window.addEventListener('blur', () => freshKeys.clear());

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

// El juego espera al botón Jugar: se prepara un primer cuadro detrás de la pantalla de inicio.
init();
cancelAnimationFrame(animId);
draw();
showStartScreen();
