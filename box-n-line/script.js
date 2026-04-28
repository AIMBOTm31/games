// ---------- CONSTANTS ----------
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#9b59b6'];
const DEFAULT_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];

// ---------- GLOBAL STATE ----------
let N;
let players = [];
let currentPlayer = 0;
let extraTurn = false;
let gameOver = false;

let H, V, boxes;
let undoStack = [];

let canvas, ctx;
let canvasSize, dotSpacing, margin;

// ---------- DOM ELEMENTS ----------
const setupDiv = document.getElementById('setup');
const gameUI = document.getElementById('gameUI');
const turnIndicator = document.getElementById('turnIndicator');
const scoreList = document.getElementById('scoreList');
const undoBtn = document.getElementById('undoBtn');
const homeBtn = document.getElementById('homeBtn');
const overlay = document.getElementById('overlay');
const resultsList = document.getElementById('resultsList');
const playerCountInput = document.getElementById('playerCount');
const namesContainer = document.getElementById('playerNamesContainer');
const gridSizeInput = document.getElementById('gridSize');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

canvas = document.getElementById('gameCanvas');
ctx = canvas.getContext('2d');

// ---------- SETUP SCREEN DYNAMICS ----------
function updatePlayerNamesUI() {
  const count = parseInt(playerCountInput.value);
  namesContainer.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'player-row';
    const colorDot = document.createElement('span');
    colorDot.className = 'color-dot';
    colorDot.style.backgroundColor = COLORS[i];
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 10;
    nameInput.value = DEFAULT_NAMES[i];
    nameInput.placeholder = 'Player name';
    nameInput.dataset.index = i;
    row.appendChild(colorDot);
    row.appendChild(nameInput);
    namesContainer.appendChild(row);
  }
}
playerCountInput.addEventListener('input', updatePlayerNamesUI);
updatePlayerNamesUI();

// ---------- GAME INITIALISATION ----------
function initGame() {
  const gridSize = parseInt(gridSizeInput.value);
  if (gridSize < 2 || gridSize > 20) {
    alert('Grid size must be between 2 and 20.');
    return;
  }
  N = gridSize;

  const nameInputs = document.querySelectorAll('#playerNamesContainer input');
  players = [];
  for (let i = 0; i < nameInputs.length; i++) {
    players.push({
      name: nameInputs[i].value.trim() || DEFAULT_NAMES[i],
      color: COLORS[i],
      score: 0
    });
  }

  // Initialise grid arrays
  H = Array.from({ length: N }, () => new Array(N - 1).fill(0));
  V = Array.from({ length: N - 1 }, () => new Array(N).fill(0));
  boxes = Array.from({ length: N - 1 }, () =>
    Array.from({ length: N - 1 }, () => ({
      completed: false,
      owner: -1,
      edgeCount: 0
    }))
  );

  currentPlayer = 0;
  extraTurn = false;
  gameOver = false;
  undoStack = [];

  // UI transition
  setupDiv.classList.add('hidden');
  gameUI.classList.remove('hidden');
  canvas.classList.remove('hidden');
  overlay.classList.add('hidden');

  resizeCanvas();
  updateExternalUI();
  draw();
  undoBtn.disabled = true;
}

function resizeCanvas() {
  const maxWidth = canvas.clientWidth;
  canvasSize = Math.min(maxWidth, 600);
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  dotSpacing = canvasSize / (N + 1);
  margin = dotSpacing;   // perfect centring
}

window.addEventListener('resize', () => {
  if (canvas && !setupDiv.classList.contains('hidden')) {
    resizeCanvas();
    draw();
  }
});

// ---------- EXTERNAL UI UPDATE ----------
function updateExternalUI() {
  const p = players[currentPlayer];
  turnIndicator.innerHTML = `Turn: <strong>${p.name}</strong> 
    <span style="color:${p.color}; margin-left:5px;">●</span>`;
  scoreList.innerHTML = players.map(pl =>
    `<li><strong>${pl.score}</strong>: ${pl.name}</li>`
  ).join('');
}

// ---------- INPUT HANDLING (direct edge tap) ----------
function canvasClick(e) {
  if (gameOver) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
  const clientY = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
  const cx = clientX * scaleX;
  const cy = clientY * scaleY;
  tryPlaceEdgeByClick(cx, cy);
}

function tryPlaceEdgeByClick(cx, cy) {
  const threshold = dotSpacing * 0.4;

  // Check all horizontal edges
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N - 1; c++) {
      if (H[r][c] === 1) continue;
      const mx = margin + (c + 0.5) * dotSpacing;
      const my = margin + r * dotSpacing;
      if (Math.hypot(cx - mx, cy - my) < threshold) {
        placeEdge('H', r, c);
        return true;
      }
    }
  }

  // Check all vertical edges
  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N; c++) {
      if (V[r][c] === 1) continue;
      const mx = margin + c * dotSpacing;
      const my = margin + (r + 0.5) * dotSpacing;
      if (Math.hypot(cx - mx, cy - my) < threshold) {
        placeEdge('V', r, c);
        return true;
      }
    }
  }
  return false;
}

// ---------- MOVE EXECUTION ----------
function placeEdge(type, row, col) {
  const prevPlayer = currentPlayer;
  const prevExtraTurn = extraTurn;
  const boxesAffected = [];

  if (type === 'H') {
    H[row][col] = 1;
    if (row > 0) boxesAffected.push({ r: row - 1, c: col, snap: snapshotBox(row - 1, col) });
    if (row < N - 1) boxesAffected.push({ r: row, c: col, snap: snapshotBox(row, col) });
  } else {
    V[row][col] = 1;
    if (col > 0) boxesAffected.push({ r: row, c: col - 1, snap: snapshotBox(row, col - 1) });
    if (col < N - 1) boxesAffected.push({ r: row, c: col, snap: snapshotBox(row, col) });
  }

  let boxesCompleted = 0;
  boxesAffected.forEach(b => {
    const box = boxes[b.r][b.c];
    box.edgeCount++;
    if (box.edgeCount === 4 && !box.completed) {
      box.completed = true;
      box.owner = currentPlayer;
      players[currentPlayer].score++;
      boxesCompleted++;
    }
  });

  undoStack.push({
    type, row, col,
    boxesAffected,
    prevPlayer,
    prevExtraTurn
  });
  undoBtn.disabled = false;

  extraTurn = (boxesCompleted > 0);
  nextTurn();

  updateExternalUI();
  draw();
  checkGameOver();
}

function snapshotBox(r, c) {
  const box = boxes[r][c];
  return { completed: box.completed, owner: box.owner, edgeCount: box.edgeCount };
}

function nextTurn() {
  if (!extraTurn) currentPlayer = (currentPlayer + 1) % players.length;
  extraTurn = false;
}

// ---------- UNDO ----------
function undo() {
  if (undoStack.length === 0) return;
  const move = undoStack.pop();
  if (undoStack.length === 0) undoBtn.disabled = true;

  if (move.type === 'H') H[move.row][move.col] = 0;
  else V[move.row][move.col] = 0;

  move.boxesAffected.forEach(({ r, c, snap }) => {
    const box = boxes[r][c];
    if (box.completed && snap.owner !== -1) players[snap.owner].score--;
    box.completed = snap.completed;
    box.owner = snap.owner;
    box.edgeCount = snap.edgeCount;
  });

  currentPlayer = move.prevPlayer;
  extraTurn = move.prevExtraTurn;
  gameOver = false;
  updateExternalUI();
  draw();
}

// ---------- GAME OVER ----------
function checkGameOver() {
  const totalEdges = 2 * N * (N - 1);
  let drawn = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N - 1; c++) if (H[r][c]) drawn++;
  for (let r = 0; r < N - 1; r++) for (let c = 0; c < N; c++) if (V[r][c]) drawn++;
  if (drawn === totalEdges) {
    gameOver = true;
    showResults();
  }
}

function showResults() {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  resultsList.innerHTML = sorted
    .map((p, i) => `<li>${i + 1}. ${p.name} – ${p.score} point${p.score !== 1 ? 's' : ''}</li>`)
    .join('');
  overlay.classList.remove('hidden');
}

// ---------- RENDERING ----------
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGridFaintLines();
  drawEdges();
  drawBoxes();
  drawDots();
}

function drawGridFaintLines() {
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < N; i++) {
    const x = margin + i * dotSpacing;
    ctx.beginPath();
    ctx.moveTo(x, margin);
    ctx.lineTo(x, margin + (N - 1) * dotSpacing);
    ctx.stroke();
    const y = margin + i * dotSpacing;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(margin + (N - 1) * dotSpacing, y);
    ctx.stroke();
  }
}

function drawEdges() {
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#2c3e50';
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N - 1; c++)
      if (H[r][c]) {
        const x1 = margin + c * dotSpacing, x2 = margin + (c + 1) * dotSpacing;
        const y = margin + r * dotSpacing;
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      }
  for (let r = 0; r < N - 1; r++)
    for (let c = 0; c < N; c++)
      if (V[r][c]) {
        const x = margin + c * dotSpacing;
        const y1 = margin + r * dotSpacing, y2 = margin + (r + 1) * dotSpacing;
        ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
      }
}

function drawBoxes() {
  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N - 1; c++) {
      const box = boxes[r][c];
      const x = margin + c * dotSpacing, y = margin + r * dotSpacing, size = dotSpacing;
      if (box.completed) {
        ctx.fillStyle = COLORS[box.owner % COLORS.length];
        ctx.globalAlpha = 0.5;
        ctx.fillRect(x, y, size, size);
        ctx.globalAlpha = 1.0;
        ctx.font = `bold ${size * 0.5}px Arial`;
        ctx.fillStyle = '#2c3e50';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(players[box.owner].name.charAt(0).toUpperCase(), x + size / 2, y + size / 2);
      }
    }
  }
}

function drawDots() {
  ctx.fillStyle = '#2c3e50';
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const x = margin + c * dotSpacing, y = margin + r * dotSpacing;
      ctx.beginPath();
      ctx.arc(x, y, dotSpacing * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
}

// ---------- HOME BUTTON ----------
function goHome() {
  if (confirm('Return to main menu? Current game will be lost.')) {
    canvas.classList.add('hidden');
    gameUI.classList.add('hidden');
    overlay.classList.add('hidden');
    setupDiv.classList.remove('hidden');
  }
}

// ---------- EVENT LISTENERS ----------
canvas.addEventListener('click', canvasClick);
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  canvasClick(e);
});
startBtn.addEventListener('click', initGame);
undoBtn.addEventListener('click', undo);
homeBtn.addEventListener('click', goHome);
restartBtn.addEventListener('click', () => {
  overlay.classList.add('hidden');
  goHome();
});