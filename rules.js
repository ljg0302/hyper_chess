import { BOARD_SIZE, CAPTURE_VALUE, opponent, inBounds } from "./config.js";

function crossNeighbors(i, j) {
  return [[i-1,j],[i+1,j],[i,j-1],[i,j+1]];
}

export function applyCrossCapturesUntilStable(board, score) {
  let changed = true;
  while (changed) {
    changed = false;
    const toRemove = [];

    for (let i=0;i<BOARD_SIZE;i++) {
      for (let j=0;j<BOARD_SIZE;j++) {
        const p = board[i][j];
        if (!p) continue;

        const opp = opponent(p.owner);
        let ok = true;

        for (const [ni,nj] of crossNeighbors(i,j)) {
          if (!inBounds(ni,nj)) { ok = false; break; }
          const q = board[ni][nj];
          if (!q || q.owner !== opp) { ok = false; break; }
        }

        if (ok) toRemove.push([i,j,opp,p.kind]);
      }
    }

    if (toRemove.length) {
      changed = true;
      for (const [i,j,capturer,kind] of toRemove) {
        if (board[i][j]) {
          board[i][j] = null;
          score[capturer] += (CAPTURE_VALUE[kind] ?? 1);
        }
      }
    }
  }
}

export function checkFiveAndLine(board, i, j, owner) {
  const p0 = board[i][j];
  if (!p0 || p0.owner !== owner) return [false, null];

  const dirs = [[1,0],[0,1],[1,1],[1,-1]];

  for (const [di,dj] of dirs) {
    const cells = [[i,j]];

    let ni = i + di, nj = j + dj;
    while (inBounds(ni,nj)) {
      const p = board[ni][nj];
      if (p && p.owner === owner) {
        cells.push([ni,nj]);
        ni += di; nj += dj;
      } else break;
    }

    ni = i - di; nj = j - dj;
    while (inBounds(ni,nj)) {
      const p = board[ni][nj];
      if (p && p.owner === owner) {
        cells.unshift([ni,nj]);
        ni -= di; nj -= dj;
      } else break;
    }

    if (cells.length >= 5) return [true, [cells[0], cells[cells.length-1]]];
  }

  return [false, null];
}
export function legalForSelected(board, si, sj, owner) {
  const me = board[si][sj];
  const moves = [];
  const caps = [];
  if (!me) return { moves, caps };
  if (me.owner !== owner) return { moves, caps };

  // ✅ 지금은 S만 구현
  if (me.kind === "S") {
    // 상하좌우 1칸 이동(빈칸)
    for (const [di, dj] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const ni = si + di, nj = sj + dj;
      if (inBounds(ni, nj) && board[ni][nj] === null) moves.push([ni, nj]);
    }
    // 대각선 1칸 캡처(상대)
    for (const [di, dj] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const ni = si + di, nj = sj + dj;
      if (!inBounds(ni, nj)) continue;
      const t = board[ni][nj];
      if (t && t.owner !== owner) caps.push([ni, nj]);
    }
  }

  return { moves, caps };
}
