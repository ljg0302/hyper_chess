import {
  BOARD_SIZE, CELL, MARGIN, BOARD_W, BOARD_H,
  STONE_RADIUS, LINE_COLOR, COLORS
} from "./config.js";

export function setupCanvas(canvas) {
  canvas.width = BOARD_W;
  canvas.height = BOARD_H;
}

function idxToXY(i, j) {
  return [MARGIN + j * CELL, MARGIN + i * CELL];
}

export function draw(state, canvas, ui = {}) {
  const ctx = canvas.getContext("2d");

  // background
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ebc878";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // grid
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;

  for (let k = 0; k < BOARD_SIZE; k++) {
    const [x1, y] = idxToXY(k, 0);
    const [x2] = idxToXY(k, BOARD_SIZE - 1);
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();

    const [x, y1] = idxToXY(0, k);
    const [, y2] = idxToXY(BOARD_SIZE - 1, k);
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
  }

  // UI states
  const selected = ui.selected;                 // [i,j] or null
  const legalMoves = ui.legalMoves || new Set();
  const legalCaps = ui.legalCaps || new Set();
  const hover = ui.hover;                       // [i,j] or null
  const rightHover = ui.rightHover;             // [i,j] or null

  // hover ring (기본: 빈칸에서만)
  if (hover && !selected && !state.gameOver) {
    const [hi, hj] = hover;
    if (!state.board[hi][hj]) {
      const [x, y] = idxToXY(hi, hj);
      const col = (state.turn === 1) ? COLORS.black : COLORS.white;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // right-click hover ring (보라색)
  if (rightHover) {
    const [ri, rj] = rightHover;
    const [x, y] = idxToXY(ri, rj);
    ctx.strokeStyle = "#9b4dff";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, STONE_RADIUS + 10, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
  }

  // legal moves (yellow)
  for (const k of legalMoves) {
    const [i, j] = k.split(",").map(Number);
    const [x, y] = idxToXY(i, j);
    ctx.strokeStyle = COLORS.yellow;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, STONE_RADIUS + 9, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
  }

  // legal captures (green)
  for (const k of legalCaps) {
    const [i, j] = k.split(",").map(Number);
    const [x, y] = idxToXY(i, j);
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, STONE_RADIUS + 9, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
  }

  // pieces
  ctx.font = "14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < BOARD_SIZE; i++) {
    for (let j = 0; j < BOARD_SIZE; j++) {
      const p = state.board[i][j];
      if (!p) continue;

      const [x, y] = idxToXY(i, j);

      if (p.kind === "S") {
        if (p.owner === 1) {
          ctx.fillStyle = COLORS.black;
          ctx.beginPath(); ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = COLORS.white;
          ctx.beginPath(); ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = COLORS.black;
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = (p.owner === 1) ? COLORS.black : COLORS.white;
        ctx.beginPath(); ctx.arc(x, y, STONE_RADIUS + 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = COLORS.black;
        ctx.stroke();

        ctx.fillStyle = (p.owner === 1) ? COLORS.white : COLORS.black;
        ctx.fillText(p.kind, x, y + 0.5);
      }
    }
  }

  // selected ring
  if (selected) {
    const [si, sj] = selected;
    const p = state.board[si][sj];
    if (p) {
      const [x, y] = idxToXY(si, sj);
      ctx.strokeStyle = COLORS.blue;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, STONE_RADIUS + 9, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // last action ring
  if (state.lastAction) {
    const [i, j] = state.lastAction;
    const p = state.board[i][j];
    if (p) {
      const [x, y] = idxToXY(i, j);
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, STONE_RADIUS + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // win line
  if (state.winLine) {
    const [[i1, j1], [i2, j2]] = state.winLine;
    const [x1, y1] = idxToXY(i1, j1);
    const [x2, y2] = idxToXY(i2, j2);
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.lineWidth = 1;
  }
}
