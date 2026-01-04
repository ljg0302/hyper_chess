// HyperChess/js/ai_engine.js
// Python ai_engine.py 포팅 (동일 로직/우선순위)
// - 즉시승리 -> 즉시패배방지(시뮬 기반) -> 열린3 방어 -> 평가함수
// - PLACE / SUMMON / MOVE 모두 고려
// - 십자포획, 소환비용, 캡처 점수 반영

import { SUMMON_COST, CAPTURE_VALUE, opponent as oppFn } from "./config.js";

// =========================
// AI Settings (Python 값 그대로)
// =========================
const AI_SIDE_DEFAULT = 2;     // 1=BLACK, 2=WHITE
const RADIUS = 2;
const MAX_CANDIDATES = 260;

const COUNT_FOR_OMOK = new Set(["S", "N", "B", "R", "Q"]);
const CROSS_CAPTURE_ALL_PIECES = true;

// -------------------------
// Seeded RNG (mulberry32)
// -------------------------
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function nowSeed() {
  return (Date.now() ^ (Math.random() * 1e9)) >>> 0;
}
function randChoice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function shuffleInPlace(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// -------------------------
// Action helper
// -------------------------
export function Action(kind, data) {
  return { kind, data }; // data: tuple-like array
}

function opponent(p) {
  // config.js opponent가 있으면 그것 사용
  return typeof oppFn === "function" ? oppFn(p) : (p === 1 ? 2 : 1);
}

function inBounds(n, i, j) {
  return 0 <= i && i < n && 0 <= j && j < n;
}

function deepCopyBoard(board) {
  // board[i][j] = null | {owner, kind}
  return board.map((row) => row.map((p) => (p ? { owner: p.owner, kind: p.kind } : null)));
}

// =========================
// SimpleAI
// =========================
export class SimpleAI {
  constructor({ side = AI_SIDE_DEFAULT, seed = null } = {}) {
    this.side = side;
    this.rng = mulberry32(seed == null ? nowSeed() : seed >>> 0);
    this.recent = []; // 최근 Action 기록
  }

  // =========================
  // Main entry
  // =========================
  chooseAction(state) {
    if (state.gameOver) return null;
    if (state.turn !== this.side) return null;

    const my = state.turn;
    const opp = opponent(my);

    const candidates = this.generateCandidates(state);
    if (!candidates.length) return null;

    // 1) 즉시 승리
    const win = this.findImmediateWin(state, candidates, my);
    if (win) {
      this._pushRecent(win);
      return win;
    }

    // 2) 즉시 패배 방지(시뮬 기반)
    if (this.hasImmediateThreat(state, opp)) {
      const block = this.bestBlockBySimulation(state, candidates, my, opp);
      if (block) {
        this._pushRecent(block);
        return block;
      }
    }

    // 3) 열린3 방어
    const block3 = this.blockOpenThree(state, candidates, my, opp);
    if (block3) {
      this._pushRecent(block3);
      return block3;
    }

    // 4) 평가함수
    const scored = [];
    const lim = Math.min(MAX_CANDIDATES, candidates.length);
    for (let idx = 0; idx < lim; idx++) {
      const a = candidates[idx];
      const s = this.evaluateAction(state, a);
      scored.push([s, idx, a]);
    }
    scored.sort((A, B) => B[0] - A[0]);

    const bestScore = scored[0][0];
    const top = [];
    for (const [s, _idx, a] of scored) {
      if (s >= bestScore - 1e-6) top.push(a);
      if (top.length >= 10) break;
    }
    const pick = randChoice(this.rng, top.length ? top : [scored[0][2]]);
    this._pushRecent(pick);
    return pick;
  }

  // =========================
  // Threat check
  // =========================
  hasImmediateThreat(state, opp) {
    const baseScore = { 1: state.score?.[1] ?? 0, 2: state.score?.[2] ?? 0 };
    // "상대가 다음 턴에 이길 수 있는 수" 존재 여부
    return this.countOpponentImmediateWins(state.board, baseScore, state.turn) > 0;
  }

  // =========================
  // Candidate generation
  // =========================
  generateCandidates(state) {
    const board = state.board;
    const n = board.length;
    const my = state.turn;

    let empties = this.frontierCells(board, RADIUS);

    // 초반 중앙 유도
    if (!empties.size) {
      const c = Math.floor(n / 2);
      empties = new Set([
        `${c},${c}`,
        `${c},${c - 1}`,
        `${c - 1},${c}`,
        `${c + 1},${c}`,
        `${c},${c + 1}`,
      ]);
    }

    const candidates = [];

    // PLACE
    for (const k of empties) {
      const [i, j] = k.split(",").map(Number);
      if (board[i][j] == null) candidates.push(Action("PLACE", [i, j]));
    }

    // SUMMON
    const myScore = state.score?.[my] ?? 0;
    for (const kind of Object.keys(SUMMON_COST)) {
      const cost = SUMMON_COST[kind];
      if (myScore >= cost) {
        for (const kk of empties) {
          const [i, j] = kk.split(",").map(Number);
          if (board[i][j] == null) candidates.push(Action("SUMMON", [i, j, kind]));
        }
      }
    }

    // MOVE
    const mine = this.myPieces(board, my);
    for (const [si, sj] of mine) {
      const { moves, caps } = this.legalMovesFor(board, si, sj);
      for (const [ti, tj] of moves) candidates.push(Action("MOVE", [si, sj, ti, tj]));
      for (const [ti, tj] of caps) candidates.push(Action("MOVE", [si, sj, ti, tj]));
    }

    const out = this._dedupActions(candidates);
    shuffleInPlace(this.rng, out);
    return out;
  }

  frontierCells(board, radius = 2) {
    const n = board.length;
    let anyPiece = false;
    const cells = new Set();

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (board[i][j] != null) {
          anyPiece = true;
          for (let di = -radius; di <= radius; di++) {
            for (let dj = -radius; dj <= radius; dj++) {
              const ni = i + di, nj = j + dj;
              if (inBounds(n, ni, nj)) cells.add(`${ni},${nj}`);
            }
          }
        }
      }
    }
    return anyPiece ? cells : new Set();
  }

  myPieces(board, owner) {
    const n = board.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = board[i][j];
        if (p && p.owner === owner) out.push([i, j]);
      }
    }
    return out;
  }

  _dedupActions(actions) {
    const seen = new Set();
    const out = [];
    for (const a of actions) {
      const key = `${a.kind}:${a.data.join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(a);
      }
    }
    return out;
  }

  // =========================
  // Omok (5)
  // =========================
  makesFive(board, owner, i, j) {
    const n = board.length;
    const p0 = board[i][j];
    if (!p0 || p0.owner !== owner || !COUNT_FOR_OMOK.has(p0.kind)) return false;

    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];

    for (const [di, dj] of dirs) {
      let cnt = 1;

      let ni = i + di, nj = j + dj;
      while (inBounds(n, ni, nj)) {
        const p = board[ni][nj];
        if (p && p.owner === owner && COUNT_FOR_OMOK.has(p.kind)) {
          cnt++;
          ni += di; nj += dj;
        } else break;
      }

      ni = i - di; nj = j - dj;
      while (inBounds(n, ni, nj)) {
        const p = board[ni][nj];
        if (p && p.owner === owner && COUNT_FOR_OMOK.has(p.kind)) {
          cnt++;
          ni -= di; nj -= dj;
        } else break;
      }

      if (cnt >= 5) return true;
    }
    return false;
  }

  findImmediateWin(state, candidates, my) {
    const baseScore = { 1: state.score?.[1] ?? 0, 2: state.score?.[2] ?? 0 };
    const lim = Math.min(MAX_CANDIDATES, candidates.length);
    for (let idx = 0; idx < lim; idx++) {
      const a = candidates[idx];
      const { board: b2, score: sc2, last } = this.simulate(state.board, baseScore, my, a);
      if (!last) continue;
      const [i, j] = last;
      if (b2[i][j] && this.makesFive(b2, my, i, j)) return a;
    }
    return null;
  }

  // =========================
  // Open-three block
  // =========================
  openThreeEnds(board, owner) {
    const n = board.length;
    const ends = new Set();
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = board[i][j];
        if (!p || p.owner !== owner || !COUNT_FOR_OMOK.has(p.kind)) continue;

        for (const [di, dj] of dirs) {
          // 시작점 조건(앞이 같은 돌이면 시작이 아님)
          const pi = i - di, pj = j - dj;
          if (inBounds(n, pi, pj)) {
            const pp = board[pi][pj];
            if (pp && pp.owner === owner && COUNT_FOR_OMOK.has(pp.kind)) continue;
          }

          // 연속 run 수집
          const cells = [];
          let ni = i, nj = j;
          while (inBounds(n, ni, nj)) {
            const q = board[ni][nj];
            if (q && q.owner === owner && COUNT_FOR_OMOK.has(q.kind)) {
              cells.push([ni, nj]);
              ni += di; nj += dj;
            } else break;
          }

          if (cells.length === 3) {
            const a_i = cells[0][0] - di;
            const a_j = cells[0][1] - dj;
            const b_i = cells[cells.length - 1][0] + di;
            const b_j = cells[cells.length - 1][1] + dj;

            if (
              inBounds(n, a_i, a_j) && board[a_i][a_j] == null &&
              inBounds(n, b_i, b_j) && board[b_i][b_j] == null
            ) {
              ends.add(`${a_i},${a_j}`);
              ends.add(`${b_i},${b_j}`);
            }
          }
        }
      }
    }
    return ends;
  }

  blockOpenThree(state, candidates, my, opp) {
    const ends = this.openThreeEnds(state.board, opp);
    if (!ends.size) return null;

    for (const a of candidates) {
      if (a.kind === "PLACE" || a.kind === "SUMMON") {
        const i = a.data[0], j = a.data[1];
        if (ends.has(`${i},${j}`)) return a;
      }
    }
    for (const a of candidates) {
      if (a.kind === "MOVE") {
        const ti = a.data[2], tj = a.data[3];
        if (ends.has(`${ti},${tj}`)) return a;
      }
    }
    return null;
  }

  // =========================
  // Legal moves (게임 규칙 그대로)
  // =========================
  legalMovesFor(board, si, sj) {
    const n = board.length;
    const me = board[si][sj];
    const moves = new Set();
    const caps = new Set();
    if (!me) return { moves, caps };

    // S
    if (me.kind === "S") {
      for (const [di, dj] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const ni = si + di, nj = sj + dj;
        if (inBounds(n, ni, nj) && board[ni][nj] == null) moves.add(`${ni},${nj}`);
      }
      for (const [di, dj] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        const ni = si + di, nj = sj + dj;
        if (!inBounds(n, ni, nj)) continue;
        const t = board[ni][nj];
        if (t && t.owner !== me.owner) caps.add(`${ni},${nj}`);
      }
      return {
        moves: new Set([...moves].map(s => s.split(",").map(Number))),
        caps: new Set([...caps].map(s => s.split(",").map(Number))),
      };
    }

    // N
    if (me.kind === "N") {
      const jumps = [
        [-2,-1],[-2, 1],[-1,-2],[-1, 2],
        [ 1,-2],[ 1, 2],[ 2,-1],[ 2, 1],
      ];
      for (const [di, dj] of jumps) {
        const ni = si + di, nj = sj + dj;
        if (!inBounds(n, ni, nj)) continue;
        const t = board[ni][nj];
        if (t == null) moves.add(`${ni},${nj}`);
        else if (t.owner !== me.owner) caps.add(`${ni},${nj}`);
      }
      return {
        moves: new Set([...moves].map(s => s.split(",").map(Number))),
        caps: new Set([...caps].map(s => s.split(",").map(Number))),
      };
    }

    // B/R/Q ray
    const ray = (deltas) => {
      for (const [di, dj] of deltas) {
        let ni = si + di, nj = sj + dj;
        while (inBounds(n, ni, nj)) {
          const t = board[ni][nj];
          if (t == null) {
            moves.add(`${ni},${nj}`);
          } else {
            if (t.owner !== me.owner) caps.add(`${ni},${nj}`);
            break;
          }
          ni += di; nj += dj;
        }
      }
    };

    if (me.kind === "B") ray([[-1,-1],[-1, 1],[ 1,-1],[ 1, 1]]);
    else if (me.kind === "R") ray([[-1, 0],[ 1, 0],[ 0,-1],[ 0, 1]]);
    else if (me.kind === "Q") ray([[-1, 0],[ 1, 0],[ 0,-1],[ 0, 1],[-1,-1],[-1, 1],[ 1,-1],[ 1, 1]]);

    return {
      moves: new Set([...moves].map(s => s.split(",").map(Number))),
      caps: new Set([...caps].map(s => s.split(",").map(Number))),
    };
  }

  // =========================
  // Simulation
  // =========================
  simulate(board, score, my, action) {
    const b2 = deepCopyBoard(board);
    const sc = { 1: score?.[1] ?? 0, 2: score?.[2] ?? 0 };
    let last = null;

    if (action.kind === "PLACE") {
      const [i, j] = action.data;
      if (b2[i][j] != null) return { board: b2, score: sc, last: null };
      b2[i][j] = { owner: my, kind: "S" };
      last = [i, j];
    }

    else if (action.kind === "SUMMON") {
      const [i, j, k] = action.data;
      if (b2[i][j] != null) return { board: b2, score: sc, last: null };
      const cost = SUMMON_COST[k] ?? 999;
      if (sc[my] < cost) return { board: b2, score: sc, last: null };
      sc[my] -= cost;
      b2[i][j] = { owner: my, kind: k };
      last = [i, j];
    }

    else if (action.kind === "MOVE") {
      const [si, sj, ti, tj] = action.data;
      const me = b2[si][sj];
      if (!me || me.owner !== my) return { board: b2, score: sc, last: null };
      const target = b2[ti][tj];
      if (target && target.owner === my) return { board: b2, score: sc, last: null };

      if (target && target.owner !== my) sc[my] += (CAPTURE_VALUE[target.kind] ?? 1);

      b2[ti][tj] = me;
      b2[si][sj] = null;
      last = [ti, tj];
    }

    this.applyCrossCaptureUntilStable(b2, sc);
    return { board: b2, score: sc, last };
  }

  applyCrossCaptureUntilStable(board, score) {
    const n = board.length;

    const isTarget = (p) => {
      if (!p) return false;
      return CROSS_CAPTURE_ALL_PIECES ? true : (p.kind === "S");
    };

    const neighbors = (i, j) => [[i-1,j],[i+1,j],[i,j-1],[i,j+1]];

    let changed = true;
    while (changed) {
      changed = false;
      const victims = [];

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const p = board[i][j];
          if (!isTarget(p)) continue;

          const opp = opponent(p.owner);
          let ok = true;

          for (const [ni, nj] of neighbors(i, j)) {
            if (!inBounds(n, ni, nj)) { ok = false; break; }
            const q = board[ni][nj];
            if (!q || q.owner !== opp) { ok = false; break; }
          }

          if (ok) victims.push([i, j, opp, p.kind]);
        }
      }

      if (victims.length) {
        changed = true;
        for (const [i, j, capturer, kind] of victims) {
          if (board[i][j]) {
            board[i][j] = null;
            score[capturer] = (score[capturer] ?? 0) + (CAPTURE_VALUE[kind] ?? 1);
          }
        }
      }
    }
  }

  // =========================
  // (핵심) 상대 즉시 승리 수 카운트
  // =========================
  countOpponentImmediateWins(board, score, me) {
    const opp = opponent(me);
    const actions = this.generateActionsForOwner(board, score, opp);
    let winCount = 0;

    const lim = Math.min(MAX_CANDIDATES, actions.length);
    for (let idx = 0; idx < lim; idx++) {
      const a = actions[idx];
      const { board: b2, last } = this.simulate(board, score, opp, a);
      if (!last) continue;
      const [i, j] = last;
      if (b2[i][j] && this.makesFive(b2, opp, i, j)) {
        winCount++;
        if (winCount >= 6) break; // speed cut
      }
    }
    return winCount;
  }

  generateActionsForOwner(board, score, owner) {
    const n = board.length;

    let empties = this.frontierCells(board, RADIUS);
    if (!empties.size) {
      const c = Math.floor(n / 2);
      empties = new Set([`${c},${c}`]);
    }

    const actions = [];

    for (const k of empties) {
      const [i, j] = k.split(",").map(Number);
      if (board[i][j] == null) actions.push(Action("PLACE", [i, j]));
    }

    for (const kind of Object.keys(SUMMON_COST)) {
      const cost = SUMMON_COST[kind];
      if ((score?.[owner] ?? 0) >= cost) {
        for (const kk of empties) {
          const [i, j] = kk.split(",").map(Number);
          if (board[i][j] == null) actions.push(Action("SUMMON", [i, j, kind]));
        }
      }
    }

    for (const [si, sj] of this.myPieces(board, owner)) {
      const { moves, caps } = this.legalMovesFor(board, si, sj);
      for (const [ti, tj] of moves) actions.push(Action("MOVE", [si, sj, ti, tj]));
      for (const [ti, tj] of caps) actions.push(Action("MOVE", [si, sj, ti, tj]));
    }

    const out = this._dedupActions(actions);
    shuffleInPlace(this.rng, out);
    return out;
  }

  // =========================
  // (핵심) 시뮬로 방어수 고르기
  // =========================
  bestBlockBySimulation(state, candidates, my, opp) {
    const baseScore = { 1: state.score?.[1] ?? 0, 2: state.score?.[2] ?? 0 };
    const before = this.countOpponentImmediateWins(state.board, baseScore, my);

    const safe = [];
    let bestFallbackAction = null;
    let bestFallbackKey = null; // (threat_count, -eval, idx)

    const lim = Math.min(MAX_CANDIDATES, candidates.length);
    for (let idx = 0; idx < lim; idx++) {
      const a = candidates[idx];
      const { board: b2, score: sc2 } = this.simulate(state.board, baseScore, my, a);
      const after = this.countOpponentImmediateWins(b2, sc2, my);
      const tcnt = after;

      let v = this.evaluateActionOnState(state, a, b2, sc2, baseScore);

      if (tcnt === 0) {
        if (after < before) v += 60.0;
        safe.push([v, idx, a]);
      } else {
        const key = [tcnt, -v, idx];
        if (!bestFallbackKey || compareKey(key, bestFallbackKey) < 0) {
          bestFallbackKey = key;
          bestFallbackAction = a;
        }
      }
    }

    if (safe.length) {
      safe.sort((A, B) => B[0] - A[0]);
      return safe[0][2];
    }
    return bestFallbackAction;
  }

  // =========================
  // Evaluation
  // =========================
  evaluateAction(state, action) {
    const baseScore = { 1: state.score?.[1] ?? 0, 2: state.score?.[2] ?? 0 };
    const { board: b2, score: sc2 } = this.simulate(state.board, baseScore, state.turn, action);
    return this.evaluateActionOnState(state, action, b2, sc2, baseScore);
  }

  evaluateActionOnState(state, action, b2, sc2, baseScore) {
    const my = state.turn;
    const opp = opponent(my);

    let score = 0.0;

    // 반복 패널티
    score -= this.repeatPenalty(action);

    // 캡처로 얻은 점수
    const gained = (sc2[my] ?? 0) - (baseScore[my] ?? 0);
    score += gained * 7.0;

    // 소환 장려
    if (action.kind === "SUMMON") {
      const k = action.data[2];
      score += 7.0 + (CAPTURE_VALUE[k] ?? 1) * 0.7;
    }

    // 오목 진행/방해
    score += this.linePotential(b2, my) * 2.2;
    score -= this.linePotential(b2, opp) * 2.0;

    // 압박/위험
    const last = this.actionLastCell(action);
    if (last) {
      const [i, j] = last;
      score += this.pressureBonus(b2, my, i, j);
      score -= this.crossCaptureRiskPenalty(b2, my, i, j) * 1.0;
    }

    return score;
  }

  actionLastCell(action) {
    if (action.kind === "PLACE") return [action.data[0], action.data[1]];
    if (action.kind === "SUMMON") return [action.data[0], action.data[1]];
    if (action.kind === "MOVE") return [action.data[2], action.data[3]];
    return null;
  }

  repeatPenalty(action) {
    let pen = 0.0;
    const recent = this.recent.slice(-8).reverse();
    for (let idx = 0; idx < recent.length; idx++) {
      const a = recent[idx];
      if (a.kind === action.kind && a.data.join(",") === action.data.join(",")) {
        pen += 9.0 / (idx + 1);
      }
    }
    return pen;
  }

  _pushRecent(action) {
    this.recent.push(action);
    if (this.recent.length > 40) this.recent = this.recent.slice(-40);
  }

  pressureBonus(board, my, i, j) {
    const n = board.length;
    let bonus = 0.0;

    let best = 999;
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        const p = board[x][y];
        if (p && p.owner !== my) {
          const d = Math.abs(x - i) + Math.abs(y - j);
          if (d < best) best = d;
        }
      }
    }

    if (best <= 1) bonus += 6.0;
    else if (best === 2) bonus += 3.0;
    else if (best === 3) bonus += 1.0;
    else bonus -= 0.5;

    for (const [ni, nj] of [[i-1,j],[i+1,j],[i,j-1],[i,j+1]]) {
      if (inBounds(n, ni, nj)) {
        const q = board[ni][nj];
        if (q && q.owner !== my) bonus += 2.0;
      }
    }
    return bonus;
  }

  crossCaptureRiskPenalty(board, my, i, j) {
    const n = board.length;
    const p = board[i][j];
    if (!p || p.owner !== my) return 0.0;

    const opp = opponent(my);
    let filledOpp = 0;
    let empties = 0;

    for (const [ni, nj] of [[i-1,j],[i+1,j],[i,j-1],[i,j+1]]) {
      if (!inBounds(n, ni, nj)) continue;
      const q = board[ni][nj];
      if (!q) empties++;
      else if (q.owner === opp) filledOpp++;
    }

    if (filledOpp === 3 && empties === 1) return 6.5;
    if (filledOpp === 2 && empties === 2) return 2.0;
    if (filledOpp === 4) return 9.0;
    return 0.0;
  }

  linePotential(board, owner) {
    const n = board.length;
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];

    let total = 0.0;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = board[i][j];
        if (!p || p.owner !== owner || !COUNT_FOR_OMOK.has(p.kind)) continue;

        for (const [di, dj] of dirs) {
          // 시작점 조건
          const pi = i - di, pj = j - dj;
          if (inBounds(n, pi, pj)) {
            const pp = board[pi][pj];
            if (pp && pp.owner === owner && COUNT_FOR_OMOK.has(pp.kind)) continue;
          }

          let run = 0;
          let ni = i, nj = j;
          while (inBounds(n, ni, nj)) {
            const q = board[ni][nj];
            if (q && q.owner === owner && COUNT_FOR_OMOK.has(q.kind)) {
              run++;
              ni += di; nj += dj;
            } else break;
          }

          if (run >= 2) {
            let openEnds = 0;
            const a_i = i - di, a_j = j - dj;
            const b_i = i + run * di, b_j = j + run * dj;

            if (inBounds(n, a_i, a_j) && board[a_i][a_j] == null) openEnds++;
            if (inBounds(n, b_i, b_j) && board[b_i][b_j] == null) openEnds++;

            if (run === 4) total += 25.0 + openEnds * 6.0;
            else if (run === 3) total += 10.0 + openEnds * 4.0;
            else if (run === 2) total += 4.0 + openEnds * 2.0;
          }
        }
      }
    }

    return total;
  }
}

// lexicographic compare for arrays like [a,b,c]
function compareKey(A, B) {
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    if (A[i] < B[i]) return -1;
    if (A[i] > B[i]) return 1;
  }
  return A.length - B.length;
}
