// ---------- CONSTANTS ----------
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#e67e22', '#9b59b6'];
// Alphabet default names
const DEFAULT_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];

// ---------- GLOBAL STATE ----------
let N = 6;
let players = [];
let currentPlayer = 0;
let extraTurn = false;
let gameOver = false;
let isAiThinking = false;

// Grid Matrices
let H, V, boxes;
let H_owner, V_owner;
let lastMove = null; // Tracks the most recently drawn edge {type, row, col}
let undoStack = [];

let canvas, ctx;
let offscreenCanvas, offscreenCtx;
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
const decPlayersBtn = document.getElementById('decPlayersBtn');
const incPlayersBtn = document.getElementById('incPlayersBtn');
const namesContainer = document.getElementById('playerNamesContainer');
const gridSizeInput = document.getElementById('gridSize');
const gridModal = document.getElementById('gridModal');
const gridGridOptions = document.getElementById('gridGridOptions');
const closeGridModalBtn = document.getElementById('closeGridModalBtn');
const enableBotInput = document.getElementById('enableBot');
const botDifficultySelect = document.getElementById('botDifficulty');
const botDifficultyWrapper = document.getElementById('botDifficultyWrapper');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

canvas = document.getElementById('gameCanvas');
ctx = canvas.getContext('2d');

offscreenCanvas = document.createElement('canvas');
offscreenCtx = offscreenCanvas.getContext('2d');

// ---------- STEPPER LISTENERS ----------
incPlayersBtn.addEventListener('click', () => {
  let val = parseInt(playerCountInput.value, 10);
  if (val < 6) {
    playerCountInput.value = val + 1;
    updatePlayerNamesUI();
  }
});

decPlayersBtn.addEventListener('click', () => {
  let val = parseInt(playerCountInput.value, 10);
  if (val > 2) {
    playerCountInput.value = val - 1;
    updatePlayerNamesUI();
  }
});

// ---------- GRID SELECTION MODAL ----------
gridSizeInput.addEventListener('click', () => {
  gridGridOptions.innerHTML = '';
  for (let size = 3; size <= 10; size++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'grid-opt-btn';
    btn.textContent = `${size} x ${size}`;
    btn.addEventListener('click', () => {
      N = size;
      gridSizeInput.value = `${size} x ${size}`;
      gridModal.classList.add('hidden');
    });
    gridGridOptions.appendChild(btn);
  }
  gridModal.classList.remove('hidden');
});

closeGridModalBtn.addEventListener('click', () => {
  gridModal.classList.add('hidden');
});

// ---------- SETUP SCREEN DYNAMICS ----------
function updatePlayerNamesUI() {
  const count = parseInt(playerCountInput.value, 10);
  const botEnabled = enableBotInput.checked;
  
  botDifficultyWrapper.style.display = botEnabled ? 'block' : 'none';
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

    const isBotRow = botEnabled && (i === count - 1);
    
    if (isBotRow) {
      nameInput.value = `Bot 🤖`;
      nameInput.disabled = true;
    } else {
      nameInput.value = DEFAULT_NAMES[i];
      nameInput.disabled = false;
    }

    row.appendChild(colorDot);
    row.appendChild(nameInput);
    namesContainer.appendChild(row);
  }
}

enableBotInput.addEventListener('change', updatePlayerNamesUI);
updatePlayerNamesUI();

// ---------- GAME INITIALISATION ----------
function initGame() {
  const count = parseInt(playerCountInput.value, 10);
  const botEnabled = enableBotInput.checked;
  const botDiff = botDifficultySelect.value;
  const nameInputs = document.querySelectorAll('#playerNamesContainer input');

  players = [];
  for (let i = 0; i < count; i++) {
    const isBot = botEnabled && (i === count - 1);
    players.push({
      name: nameInputs[i].value.trim() || DEFAULT_NAMES[i],
      color: COLORS[i],
      score: 0,
      isAi: isBot,
      difficulty: isBot ? botDiff : null
    });
  }

  H = Array.from({ length: N }, () => new Uint8Array(N - 1));
  V = Array.from({ length: N - 1 }, () => new Uint8Array(N));
  H_owner = Array.from({ length: N }, () => new Int8Array(N - 1).fill(-1));
  V_owner = Array.from({ length: N - 1 }, () => new Int8Array(N).fill(-1));

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
  isAiThinking = false;
  lastMove = null;
  undoStack = [];

  createScoreboardUI();

  setupDiv.classList.add('hidden');
  gameUI.classList.remove('hidden');
  canvas.classList.remove('hidden');
  overlay.classList.add('hidden');

  resizeCanvas();
  updateExternalUI();
  draw();
  undoBtn.disabled = true;

  triggerAiIfNeeded();
}

function createScoreboardUI() {
  scoreList.innerHTML = '';
  players.forEach((p, idx) => {
    const li = document.createElement('li');
    li.id = `score-player-${idx}`;
    li.style.borderLeft = `4px solid ${p.color}`;
    scoreList.appendChild(li);
  });
}

function updateExternalUI() {
  const p = players[currentPlayer];
  const icon = p.isAi ? '🤖' : '👤';
  turnIndicator.innerHTML = `Turn: ${icon} <strong>${p.name}</strong> 
    <span style="color:${p.color}; margin-left:5px;">●</span>`;
  
  players.forEach((pl, idx) => {
    const el = document.getElementById(`score-player-${idx}`);
    if (el) {
      const plIcon = pl.isAi ? '🤖' : '👤';
      el.innerHTML = `${plIcon} <strong>${pl.score}</strong>: ${pl.name}`;
    }
  });
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const container = canvas.parentElement || document.body;
  const maxWidth = container.clientWidth - 32;
  
  canvasSize = Math.max(260, Math.min(maxWidth, 560));

  canvas.width = canvasSize * dpr;
  canvas.height = canvasSize * dpr;
  canvas.style.width = `${canvasSize}px`;
  canvas.style.height = `${canvasSize}px`;

  offscreenCanvas.width = canvas.width;
  offscreenCanvas.height = canvas.height;

  ctx.resetTransform();
  ctx.scale(dpr, dpr);
  offscreenCtx.resetTransform();
  offscreenCtx.scale(dpr, dpr);

  dotSpacing = canvasSize / (N + 1);
  margin = dotSpacing;

  renderStaticBackground();
}

window.addEventListener('resize', () => {
  if (canvas && setupDiv.classList.contains('hidden')) {
    resizeCanvas();
    draw();
  }
});

// ---------- RENDERING STATIC BACKGROUND (HIGH VISIBILITY DOTS) ----------
function renderStaticBackground() {
  offscreenCtx.clearRect(0, 0, canvasSize, canvasSize);

  // Faint grid lines
  offscreenCtx.strokeStyle = 'rgba(200, 210, 220, 0.25)';
  offscreenCtx.lineWidth = 0.5;
  offscreenCtx.beginPath();
  for (let i = 0; i < N; i++) {
    const pos = margin + i * dotSpacing;
    const start = margin;
    const end = margin + (N - 1) * dotSpacing;
    
    offscreenCtx.moveTo(pos, start);
    offscreenCtx.lineTo(pos, end);
    offscreenCtx.moveTo(start, pos);
    offscreenCtx.lineTo(end, pos);
  }
  offscreenCtx.stroke();

  // Dark & Prominent Board Dots
  offscreenCtx.fillStyle = '#2c3e50';
  offscreenCtx.strokeStyle = '#ffffff';
  offscreenCtx.lineWidth = 1.5;

  const radius = Math.max(4, dotSpacing * 0.1); // Scaled visible dot radius
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const x = margin + c * dotSpacing;
      const y = margin + r * dotSpacing;
      offscreenCtx.beginPath();
      offscreenCtx.arc(x, y, radius, 0, Math.PI * 2);
      offscreenCtx.fill();
      offscreenCtx.stroke();
    }
  }
}

// ---------- INPUT & MOVE EXECUTION ----------
function handlePointerDown(e) {
  if (gameOver || isAiThinking || players[currentPlayer].isAi) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvasSize / rect.width;
  const scaleY = canvasSize / rect.height;

  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;

  tryPlaceEdgeByClick(cx, cy);
}

function tryPlaceEdgeByClick(cx, cy) {
  const colFloat = (cx - margin) / dotSpacing;
  const rowFloat = (cy - margin) / dotSpacing;

  const nearestCol = Math.round(colFloat);
  const nearestRow = Math.round(rowFloat);

  const dx = colFloat - nearestCol;
  const dy = rowFloat - nearestRow;

  const threshold = 0.4;

  if (Math.abs(dy) < threshold && colFloat >= 0 && colFloat <= N - 1) {
    const c = Math.floor(colFloat);
    const r = nearestRow;
    if (r >= 0 && r < N && c >= 0 && c < N - 1 && !H[r][c]) {
      placeEdge('H', r, c);
      return true;
    }
  }

  if (Math.abs(dx) < threshold && rowFloat >= 0 && rowFloat <= N - 1) {
    const r = Math.floor(rowFloat);
    const c = nearestCol;
    if (c >= 0 && c < N && r >= 0 && r < N - 1 && !V[r][c]) {
      placeEdge('V', r, c);
      return true;
    }
  }

  return false;
}

function placeEdge(type, row, col) {
  const prevPlayer = currentPlayer;
  const prevExtraTurn = extraTurn;
  const prevLastMove = lastMove;
  const boxesAffected = [];

  if (type === 'H') {
    H[row][col] = 1;
    H_owner[row][col] = currentPlayer;
    if (row > 0) boxesAffected.push({ r: row - 1, c: col, snap: snapshotBox(row - 1, col) });
    if (row < N - 1) boxesAffected.push({ r: row, c: col, snap: snapshotBox(row, col) });
  } else {
    V[row][col] = 1;
    V_owner[row][col] = currentPlayer;
    if (col > 0) boxesAffected.push({ r: row, c: col - 1, snap: snapshotBox(row, col - 1) });
    if (col < N - 1) boxesAffected.push({ r: row, c: col, snap: snapshotBox(row, col) });
  }

  lastMove = { type, row, col };

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
    prevExtraTurn,
    prevLastMove
  });
  undoBtn.disabled = false;

  extraTurn = (boxesCompleted > 0);
  nextTurn();

  updateExternalUI();
  draw();
  
  if (!checkGameOver()) {
    triggerAiIfNeeded();
  }
}

function snapshotBox(r, c) {
  const box = boxes[r][c];
  return { completed: box.completed, owner: box.owner, edgeCount: box.edgeCount };
}

function nextTurn() {
  if (!extraTurn) {
    currentPlayer = (currentPlayer + 1) % players.length;
  }
  extraTurn = false;
}

// ---------- AI DECISION ENGINE ----------
function triggerAiIfNeeded() {
  if (gameOver || !players[currentPlayer].isAi) return;

  isAiThinking = true;
  setTimeout(() => {
    if (gameOver) return;
    const move = computeAiMove(players[currentPlayer].difficulty);
    isAiThinking = false;
    if (move) {
      placeEdge(move.type, move.row, move.col);
    }
  }, 400);
}

function getAvailableEdges() {
  const edges = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N - 1; c++) {
      if (!H[r][c]) edges.push({ type: 'H', row: r, col: c });
    }
  }
  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N; c++) {
      if (!V[r][c]) edges.push({ type: 'V', row: r, col: c });
    }
  }
  return edges;
}

function getEdgeImpact(edge) {
  let maxCount = 0;
  if (edge.type === 'H') {
    if (edge.row > 0) maxCount = Math.max(maxCount, boxes[edge.row - 1][edge.col].edgeCount + 1);
    if (edge.row < N - 1) maxCount = Math.max(maxCount, boxes[edge.row][edge.col].edgeCount + 1);
  } else {
    if (edge.col > 0) maxCount = Math.max(maxCount, boxes[edge.row][edge.col - 1].edgeCount + 1);
    if (edge.col < N - 1) maxCount = Math.max(maxCount, boxes[edge.row][edge.col].edgeCount + 1);
  }
  return maxCount;
}

function computeAiMove(difficulty) {
  const available = getAvailableEdges();
  if (available.length === 0) return null;

  if (difficulty === 'easy') {
    return available[Math.floor(Math.random() * available.length)];
  }

  const completingMoves = available.filter(e => getEdgeImpact(e) === 4);
  if (completingMoves.length > 0) {
    return completingMoves[Math.floor(Math.random() * completingMoves.length)];
  }

  const safeMoves = available.filter(e => getEdgeImpact(e) < 3);

  if (difficulty === 'medium' || difficulty === 'hard') {
    if (safeMoves.length > 0) {
      return safeMoves[Math.floor(Math.random() * safeMoves.length)];
    }
    return available[Math.floor(Math.random() * available.length)];
  }

  return available[0];
}

// ---------- UNDO ----------
function undo() {
  if (undoStack.length === 0 || isAiThinking) return;

  revertLastMove();

  if (players[currentPlayer].isAi && undoStack.length > 0) {
    revertLastMove();
  }

  gameOver = false;
  updateExternalUI();
  draw();
}

function revertLastMove() {
  if (undoStack.length === 0) return;
  const move = undoStack.pop();
  if (undoStack.length === 0) undoBtn.disabled = true;

  if (move.type === 'H') {
    H[move.row][move.col] = 0;
    H_owner[move.row][move.col] = -1;
  } else {
    V[move.row][move.col] = 0;
    V_owner[move.row][move.col] = -1;
  }

  move.boxesAffected.forEach(({ r, c, snap }) => {
    const box = boxes[r][c];
    if (box.completed && !snap.completed) {
      players[box.owner].score--;
    }
    box.completed = snap.completed;
    box.owner = snap.owner;
    box.edgeCount = snap.edgeCount;
  });

  currentPlayer = move.prevPlayer;
  extraTurn = move.prevExtraTurn;
  lastMove = move.prevLastMove;
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
    return true;
  }
  return false;
}

function showResults() {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  resultsList.innerHTML = sorted
    .map((p, i) => `<li>${i + 1}. ${p.isAi ? '🤖' : '👤'} ${p.name} – ${p.score} point${p.score !== 1 ? 's' : ''}</li>`)
    .join('');
  overlay.classList.remove('hidden');
}

// ---------- CANVAS RENDERING (DIMMED PAST LINES + RECENT HIGHLIGHT) ----------
function draw() {
  ctx.clearRect(0, 0, canvasSize, canvasSize);

  // 1. Draw cached background
  ctx.drawImage(offscreenCanvas, 0, 0, canvasSize, canvasSize);

  ctx.lineCap = 'round';

  // 2. Draw Horizontal Edges
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N - 1; c++) {
      if (H[r][c]) {
        const ownerIdx = H_owner[r][c];
        const isRecent = lastMove && lastMove.type === 'H' && lastMove.row === r && lastMove.col === c;
        
        ctx.strokeStyle = players[ownerIdx] ? players[ownerIdx].color : '#ffffff';
        ctx.globalAlpha = isRecent ? 1.0 : 0.45; // Dim past lines
        ctx.lineWidth = isRecent ? 5 : 3.5;       // Highlight recent line thickness

        const x1 = margin + c * dotSpacing;
        const x2 = margin + (c + 1) * dotSpacing;
        const y = margin + r * dotSpacing;
        
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
      }
    }
  }

  // 3. Draw Vertical Edges
  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N; c++) {
      if (V[r][c]) {
        const ownerIdx = V_owner[r][c];
        const isRecent = lastMove && lastMove.type === 'V' && lastMove.row === r && lastMove.col === c;
        
        ctx.strokeStyle = players[ownerIdx] ? players[ownerIdx].color : '#ffffff';
        ctx.globalAlpha = isRecent ? 1.0 : 0.45; // Dim past lines
        ctx.lineWidth = isRecent ? 5 : 3.5;       // Highlight recent line thickness

        const x = margin + c * dotSpacing;
        const y1 = margin + r * dotSpacing;
        const y2 = margin + (r + 1) * dotSpacing;
        
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.stroke();
      }
    }
  }

  ctx.globalAlpha = 1.0; // Reset opacity

  // 4. Draw Completed Boxes
  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N - 1; c++) {
      const box = boxes[r][c];
      if (box.completed) {
        const x = margin + c * dotSpacing;
        const y = margin + r * dotSpacing;
        const size = dotSpacing;

        ctx.fillStyle = COLORS[box.owner % COLORS.length];
        ctx.globalAlpha = 0.45;
        ctx.fillRect(x, y, size, size);

        ctx.globalAlpha = 1.0;
        ctx.font = `bold ${size * 0.45}px Arial`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(players[box.owner].name.charAt(0).toUpperCase(), x + size / 2, y + size / 2);
      }
    }
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
// Add element reference at the top of script.js
const closeOverlayBtn = document.getElementById('closeOverlayBtn');

// Close modal handler
closeOverlayBtn.addEventListener('click', () => {
  overlay.classList.add('hidden');
});

// Updated results display function
function showResults() {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  
  resultsList.innerHTML = sorted
    .map((p, i) => {
      const isWinner = (i === 0);
      const icon = p.isAi ? '🤖' : '👤';
      const rankBadge = isWinner ? '👑' : `#${i + 1}`;
      
      return `
        <li>
          <div class="results-player-info">
            <span>${rankBadge}</span>
            <span>${icon} ${p.name}</span>
          </div>
          <span class="results-score-badge">${p.score} pts</span>
        </li>
      `;
    })
    .join('');

  overlay.classList.remove('hidden');
}

// ---------- EVENT LISTENERS ----------
canvas.addEventListener('pointerdown', handlePointerDown);
startBtn.addEventListener('click', initGame);
undoBtn.addEventListener('click', undo);
homeBtn.addEventListener('click', goHome);
restartBtn.addEventListener('click', () => {
  overlay.classList.add('hidden');
  goHome();
});
