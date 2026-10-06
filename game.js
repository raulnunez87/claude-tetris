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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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
  combo = 0;
  maxCombo = 0;
  hideGameOverRecords();
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
  // Records: no interferir al escribir en un campo ni mientras está la pantalla de inicio
  if (isTypingTarget(e.target)) return;
  if (!startScreen.classList.contains('hidden')) {
    const onOtherBtn = e.target.tagName === 'BUTTON' && e.target !== playBtn;
    if (e.code === 'Enter' && !onOtherBtn) { e.preventDefault(); startGame(); }
    return;
  }
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

// El juego espera al botón Jugar: se prepara un primer cuadro detrás de la pantalla de inicio.
init();
cancelAnimationFrame(animId);
draw();
showStartScreen();