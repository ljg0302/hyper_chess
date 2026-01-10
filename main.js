import { setupCanvas, draw } from "./render.js";
import { makeInitialState } from "./state.js";
import { opponent, SUMMON_COST, CAPTURE_VALUE } from "./config.js";
import { mouseToIdx } from "./input.js";
import { applyCrossCapturesUntilStable, checkFiveAndLine } from "./rules.js";
import { SimpleAI } from "./ai_engine.js";

// =====================
// DOM
// =====================
const canvas = document.getElementById("board");
const turnText = document.getElementById("turnText");
const scoreText = document.getElementById("scoreText");
const statusText = document.getElementById("statusText");
const resetBtn = document.getElementById("resetBtn");

// Summon UI (index.html에 이미 있음)
const summonCard = document.getElementById("summonCard");
const summonInfo = document.getElementById("summonInfo");
const summonCellText = document.getElementById("summonCellText");
const summonCancelBtn = document.getElementById("summonCancelBtn");
const summonBtns = summonCard?.querySelectorAll("button[data-kind]") ?? [];

// =====================
// Canvas
// =====================
setupCanvas(canvas);

// =====================
// Game State + UI State
// =====================
let state = makeInitialState();

// selection / hover
let selected = null;              // [i,j] or null
let legalMoves = new Set();       // "i,j"
let legalCaps = new Set();        // "i,j"
let hover = null;                 // [i,j] or null (보라색 호버링용)

// summon target cell
let summonCell = null;            // [i,j] or null

// swap2
// phase:
//  - "swap2_p1_3"        : P1이 3수(B,W,B) 배치
//  - "swap2_p2_choice"   : P2가 선택(바로 색 고르기 OR 2수 더 두고 P1에게 넘기기)
//  - "swap2_p2_pick"     : P2가 흑/백 고르는 화면
//  - "swap2_p2_add2"     : P2가 2수(W,B) 더 배치
//  - "swap2_p1_pick"     : P1이 흑/백 고르는 화면
//  - "play"              : 일반 플레이
//
// playerTurn: 1 or 2 (플레이어)
// turn: 1 or 2 (색: 1=BLACK, 2=WHITE)
// playerColor: {1: color, 2: color}
function initSwap2Fields() {
  state.phase = "swap2_p1_3";
  state.opening = [];                 // swap2 오프닝에 둔 돌 기록 [{i,j,piece, turnColor}]
  state.moveNo = 0;                   // 오프닝 카운트
  state.playerTurn = 1;
  state.playerColor = { 1: 1, 2: 2 }; // 기본 임시
  state.turn = 1;                     // 첫 수는 black
}
initSwap2Fields();

// =====================
// AI
// =====================
let aiEnabled = false;
let aiSide = 2;             // 기본: WHITE가 AI
const ai = new SimpleAI({ side: aiSide });

// header에 AI 토글 붙이기(HTML 수정 없이 JS에서 생성)
(function mountAiToggle() {
  const headerBtns = document.querySelector("header .buttons");
  if (!headerBtns) return;

  const wrap = document.createElement("label");
  wrap.style.display = "inline-flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "8px";
  wrap.style.marginLeft = "10px";
  wrap.style.userSelect = "none";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = aiEnabled;

  const txt = document.createElement("span");
  txt.textContent = "AI";
  txt.style.fontWeight = "700";

  const sel = document.createElement("select");
  sel.innerHTML = `
    <option value="2">AI = WHITE</option>
    <option value="1">AI = BLACK</option>
  `;
  sel.value = String(aiSide);

  cb.addEventListener("change", () => {
    aiEnabled = cb.checked;
    showTurnOverlay(aiEnabled ? "AI ON" : "AI OFF");
    maybeRunAI();
  });
  sel.addEventListener("change", () => {
    aiSide = Number(sel.value);
    ai.side = aiSide;
    showTurnOverlay(aiSide === 1 ? "AI = BLACK" : "AI = WHITE");
    maybeRunAI();
  });

  wrap.appendChild(cb);
  wrap.appendChild(txt);
  wrap.appendChild(sel);
  headerBtns.appendChild(wrap);
})();

// =====================
// Turn Overlay (크게 잠깐 뜨는 안내)
// =====================
let overlayTimer = null;
const overlay = (() => {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.top = "18%";
  el.style.transform = "translate(-50%, -50%)";
  el.style.padding = "18px 26px";
  el.style.borderRadius = "16px";
  el.style.background = "rgba(20,20,20,0.88)";
  el.style.color = "white";
  el.style.fontSize = "32px";
  el.style.fontWeight = "900";
  el.style.letterSpacing = "0.5px";
  el.style.zIndex = "9999";
  el.style.display = "none";
  el.style.boxShadow = "0 12px 30px rgba(0,0,0,0.25)";
  document.body.appendChild(el);
  return el;
})();

function showTurnOverlay(text) {
  overlay.textContent = text;
  overlay.style.display = "block";
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => {
    overlay.style.display = "none";
  }, 900);
}

// =====================
// Swap2 Modal (Close 버튼 없음, Back 포함)
// =====================
let swapModal = null;

function ensureSwapModal() {
  if (swapModal) return swapModal;

  const bg = document.createElement("div");
  bg.style.position = "fixed";
  bg.style.inset = "0";
  bg.style.background = "rgba(0,0,0,0.35)";
  bg.style.zIndex = "9998";
  bg.style.display = "none";
  bg.style.alignItems = "center";
  bg.style.justifyContent = "center";

  const panel = document.createElement("div");
  panel.style.width = "min(560px, 92vw)";
  panel.style.background = "white";
  panel.style.borderRadius = "16px";
  panel.style.padding = "16px";
  panel.style.boxShadow = "0 16px 40px rgba(0,0,0,0.25)";

  const title = document.createElement("div");
  title.style.fontSize = "18px";
  title.style.fontWeight = "900";
  title.style.marginBottom = "8px";

  const desc = document.createElement("div");
  desc.style.color = "#333";
  desc.style.lineHeight = "1.4";
  desc.style.marginBottom = "12px";

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.flexWrap = "wrap";
  btnRow.style.gap = "10px";

  panel.appendChild(title);
  panel.appendChild(desc);
  panel.appendChild(btnRow);
  bg.appendChild(panel);
  document.body.appendChild(bg);

  swapModal = { bg, title, desc, btnRow };
  return swapModal;
}

function openSwapModal({ title, desc, buttons }) {
  const m = ensureSwapModal();
  m.title.textContent = title;
  m.desc.innerHTML = desc;

  m.btnRow.innerHTML = "";
  for (const b of buttons) {
    const btn = document.createElement("button");
    btn.textContent = b.label;
    btn.style.padding = "10px 12px";
    btn.style.borderRadius = "12px";
    btn.style.border = "1px solid #ccc";
    btn.style.background = "#fff";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "800";
    btn.addEventListener("click", b.onClick);
    m.btnRow.appendChild(btn);
  }

  m.bg.style.display = "flex";
}

function closeSwapModal() {
  if (!swapModal) return;
  swapModal.bg.style.display = "none";
}

// =====================
// Summon Panel Helpers
// =====================
function openSummon(i, j) {
  summonCell = [i, j];
  hover = [i, j]; // 우클릭 위치 보라 호버링
  if (summonCard) summonCard.style.display = "block";
  if (summonCellText) summonCellText.textContent = `(${i}, ${j})`;

  syncSummonInfo();
}

function closeSummon() {
  summonCell = null;
  if (summonCard) summonCard.style.display = "none";
  if (summonCellText) summonCellText.textContent = "-";
  syncSummonInfo();
}

function syncSummonInfo() {
  if (!summonInfo) return;

  const me = state.turn;
  const myScore = state.score?.[me] ?? 0;
  const can = (k) => myScore >= (SUMMON_COST[k] ?? 999);

  summonInfo.innerHTML =
    `<div style="display:flex;gap:10px;flex-wrap:wrap;">
      <div><b>My Score:</b> ${myScore}</div>
      <div><b>Cost</b> N:${SUMMON_COST.N} B:${SUMMON_COST.B} R:${SUMMON_COST.R} Q:${SUMMON_COST.Q}</div>
    </div>`;

  for (const btn of summonBtns) {
    const k = btn.getAttribute("data-kind");
    btn.disabled = !can(k);
    btn.style.opacity = btn.disabled ? "0.45" : "1";
  }
}

// =====================
// Selection Helpers
// =====================
function clearSelection() {
  selected = null;
  legalMoves.clear();
  legalCaps.clear();
}

function key(i, j) {
  return `${i},${j}`;
}

function computeLegalForSelected(i, j) {
  legalMoves.clear();
  legalCaps.clear();

  const board = state.board;
  const n = board.length;
  const p = board[i][j];
  if (!p) return;

  const inb = (x, y) => 0 <= x && x < n && 0 <= y && y < n;

  // S: 상하좌우 1칸 이동(빈칸), 대각선 1칸 캡처(상대)
  if (p.kind === "S") {
    for (const [di, dj] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const ni = i + di, nj = j + dj;
      if (inb(ni, nj) && board[ni][nj] == null) legalMoves.add(key(ni, nj));
    }
    for (const [di, dj] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const ni = i + di, nj = j + dj;
      if (!inb(ni, nj)) continue;
      const t = board[ni][nj];
      if (t && t.owner !== p.owner) legalCaps.add(key(ni, nj));
    }
    return;
  }

  // N: 나이트
  if (p.kind === "N") {
    const jumps = [
      [-2,-1],[-2, 1],[-1,-2],[-1, 2],
      [ 1,-2],[ 1, 2],[ 2,-1],[ 2, 1],
    ];
    for (const [di, dj] of jumps) {
      const ni = i + di, nj = j + dj;
      if (!inb(ni, nj)) continue;
      const t = board[ni][nj];
      if (!t) legalMoves.add(key(ni, nj));
      else if (t.owner !== p.owner) legalCaps.add(key(ni, nj));
    }
    return;
  }

  // B/R/Q: ray 이동
  const ray = (dirs) => {
    for (const [di, dj] of dirs) {
      let ni = i + di, nj = j + dj;
      while (inb(ni, nj)) {
        const t = board[ni][nj];
        if (!t) {
          legalMoves.add(key(ni, nj));
        } else {
          if (t.owner !== p.owner) legalCaps.add(key(ni, nj));
          break;
        }
        ni += di; nj += dj;
      }
    }
  };

  if (p.kind === "B") ray([[-1,-1],[-1, 1],[ 1,-1],[ 1, 1]]);
  else if (p.kind === "R") ray([[-1, 0],[ 1, 0],[ 0,-1],[ 0, 1]]);
  else if (p.kind === "Q") ray([[-1, 0],[ 1, 0],[ 0,-1],[ 0, 1],[-1,-1],[-1, 1],[ 1,-1],[ 1, 1]]);
}

// =====================
// Core Apply (PLACE / SUMMON / MOVE)  + after-rules
// =====================
function afterAnyAction(lastI, lastJ, actingColor) {
  // 십자포획(연쇄)
  applyCrossCapturesUntilStable(state.board, state.score);

  // 오목 체크(마지막 칸이 살아있다면)
  if (state.board[lastI][lastJ]) {
    const [won, line] = checkFiveAndLine(state.board, lastI, lastJ, actingColor);
    if (won) {
      state.gameOver = true;
      state.winner = actingColor;
      state.winLine = line;
      showTurnOverlay(actingColor === 1 ? "BLACK WINS!" : "WHITE WINS!");
    }
  }
}

function applyAction(action) {
  if (!action || state.gameOver) return;

  const kind = action.kind;
  const data = action.data;

  if (kind === "PLACE") {
    const [i, j] = data;
    if (state.board[i][j]) return;

    state.board[i][j] = { owner: state.turn, kind: "S" };
    state.lastAction = [i, j];

    // swap2 opening 기록
    if (state.phase !== "play") {
      state.opening.push({ i, j, piece: "S", color: state.turn });
    }

    afterAnyAction(i, j, state.turn);
    if (state.gameOver) return;

    advanceTurnAfterMove(i, j);
    return;
  }

  if (kind === "SUMMON") {
    const [i, j, pieceKind] = data;
    if (state.board[i][j]) return;

    const cost = SUMMON_COST[pieceKind] ?? 999;
    if ((state.score[state.turn] ?? 0) < cost) return;

    state.score[state.turn] -= cost;
    state.board[i][j] = { owner: state.turn, kind: pieceKind };
    state.lastAction = [i, j];

    if (state.phase !== "play") {
      state.opening.push({ i, j, piece: pieceKind, color: state.turn });
    }

    afterAnyAction(i, j, state.turn);
    if (state.gameOver) return;

    advanceTurnAfterMove(i, j);
    return;
  }

  if (kind === "MOVE") {
    const [si, sj, ti, tj] = data;
    const me = state.board[si][sj];
    if (!me) return;
    if (me.owner !== state.turn) return;

    // 합법 검사
    computeLegalForSelected(si, sj);
    const k = key(ti, tj);
    if (!legalMoves.has(k) && !legalCaps.has(k)) return;

    const target = state.board[ti][tj];
    if (target && target.owner !== me.owner) {
      // 캡처 점수
      state.score[state.turn] += (CAPTURE_VALUE[target.kind] ?? 1);
    }

    state.board[ti][tj] = me;
    state.board[si][sj] = null;
    state.lastAction = [ti, tj];

    afterAnyAction(ti, tj, state.turn);
    if (state.gameOver) return;

    advanceTurnAfterMove(ti, tj);
    return;
  }
}

// =====================
// Swap2 Turn Control
// =====================
function setTurnByColor(color) {
  state.turn = color; // 1 black 2 white
}

function currentPlayerByColorTurn() {
  // state.turn(색)이 누구(player)인지 찾아줌
  const c = state.turn;
  return state.playerColor[1] === c ? 1 : 2;
}

function advanceTurnAfterMove(lastI, lastJ) {
  // swap2 오프닝 처리
  if (state.phase === "swap2_p1_3") {
    // 3수(B,W,B)
    state.moveNo += 1;
    if (state.moveNo >= 3) {
      // 3수 끝
      state.phase = "swap2_p2_choice";
      setTurnByColor(2); // 다음은 보통 흰 차례이지만 swap2에서는 "선택" 단계
      clearSelection();
      closeSummon();
      openSwap2Choice();
      showTurnOverlay("SWAP2: P2 CHOICE");
      return;
    } else {
      // 색은 B->W->B
      setTurnByColor(state.moveNo === 1 ? 2 : 1);
      showTurnOverlay(state.turn === 1 ? "BLACK" : "WHITE");
      return;
    }
  }

  if (state.phase === "swap2_p2_add2") {
    // 2수(W,B)
    state.moveNo += 1;
    const placedInAdd2 = state.moveNo - 3; // 1..2
    if (placedInAdd2 >= 2) {
      // 2수 끝 -> P1이 색 선택
      state.phase = "swap2_p1_pick";
      clearSelection();
      closeSummon();
      openSwap2PickColorForP1();
      showTurnOverlay("SWAP2: P1 PICKS");
      return;
    } else {
      // 색 진행: 4번째는 W(2), 5번째는 B(1)
      setTurnByColor(placedInAdd2 === 1 ? 1 : 2); // placedInAdd2=1이면 다음은 B
      showTurnOverlay(state.turn === 1 ? "BLACK" : "WHITE");
      return;
    }
  }

  // 일반 플레이
  if (state.phase === "play") {
    state.turn = opponent(state.turn);
    showTurnOverlay(state.turn === 1 ? "BLACK TURN" : "WHITE TURN");
    syncSummonInfo();
    maybeRunAI();
    return;
  }
}

// swap2 modals
function openSwap2Choice() {
  openSwapModal({
    title: "SWAP2",
    desc:
      `P1이 <b>3수</b>(B/W/B)를 배치했습니다.<br/>
       P2는 아래 중 선택하세요.`,
    buttons: [
      {
        label: "① 지금 바로 흑/백 선택",
        onClick: () => {
          state.phase = "swap2_p2_pick";
          openSwap2PickColorForP2();
        },
      },
      {
        label: "② 2수 더 두고(P2) → P1에게 선택권 넘기기",
        onClick: () => {
          // 이 선택은 되돌릴 수 있어야 하므로 현재 오프닝 스냅샷 저장
          state._snap_opening_before_add2 = JSON.stringify(state.opening);
          state._snap_board_before_add2 = JSON.stringify(state.board);
          state._snap_score_before_add2 = JSON.stringify(state.score);

          state.phase = "swap2_p2_add2";
          // 4번째는 WHITE부터 두게 하자(표준 BWB 다음 WB)
          setTurnByColor(2);
          closeSwapModal();
          showTurnOverlay("P2 places 2 (W,B)");
        },
      },
    ],
  });
}

function openSwap2PickColorForP2() {
  openSwapModal({
    title: "SWAP2: P2 picks color",
    desc: `P2가 <b>흑</b> 또는 <b>백</b> 중 하나를 선택합니다.<br/>
          (선택하면 일반 게임이 시작됩니다)`,
    buttons: [
      {
        label: "◀ 뒤로가기",
        onClick: () => {
          state.phase = "swap2_p2_choice";
          openSwap2Choice();
        },
      },
      {
        label: "P2 = BLACK",
        onClick: () => finalizeSwap2ColorPick(2, 1),
      },
      {
        label: "P2 = WHITE",
        onClick: () => finalizeSwap2ColorPick(2, 2),
      },
    ],
  });
}

function openSwap2PickColorForP1() {
  openSwapModal({
    title: "SWAP2: P1 picks color",
    desc: `P2가 2수를 더 두었습니다.<br/>
          이제 P1이 <b>흑/백</b>을 선택합니다.`,
    buttons: [
      {
        label: "◀ 뒤로가기 (P2 추가 2수 취소)",
        onClick: () => {
          // add2로 두었던 2수를 되돌리고 choice로
          if (state._snap_board_before_add2) {
            state.board = JSON.parse(state._snap_board_before_add2);
            state.score = JSON.parse(state._snap_score_before_add2);
            state.opening = JSON.parse(state._snap_opening_before_add2);
          }
          state.moveNo = 3;
          state.phase = "swap2_p2_choice";
          closeSwapModal();
          openSwap2Choice();
          showTurnOverlay("SWAP2: BACK");
        },
      },
      {
        label: "P1 = BLACK",
        onClick: () => finalizeSwap2ColorPick(1, 1),
      },
      {
        label: "P1 = WHITE",
        onClick: () => finalizeSwap2ColorPick(1, 2),
      },
    ],
  });
}

function finalizeSwap2ColorPick(pickerPlayer, pickedColor) {
  // pickerPlayer가 pickedColor를 가져감
  state.playerColor[pickerPlayer] = pickedColor;
  state.playerColor[opponent(pickerPlayer)] = opponent(pickedColor);

  // ✅ moveNo를 opening 기준으로 강제 동기화 (버그 방지)
  state.moveNo = Array.isArray(state.opening) ? state.opening.length : state.moveNo;

  state.phase = "play";
  closeSwapModal();
  clearSelection();
  closeSummon();

  // ✅ 핵심: "항상 흑부터" 같은 고정 금지
  // 마지막 오프닝 수의 색을 기준으로 다음 턴 색 결정
  const last = state.opening?.[state.opening.length - 1];
  if (last && (last.color === 1 || last.color === 2)) {
    state.turn = opponent(last.color); // 다음 색은 무조건 반대색
  } else {
    // 혹시 opening이 비어있으면 안전하게 black
    state.turn = 1;
  }

  const who = currentPlayerByColorTurn();
  showTurnOverlay(`START: ${state.turn === 1 ? "BLACK" : "WHITE"} (P${who})`);

  syncSummonInfo();
  maybeRunAI();
}


// =====================
// Human Input
// =====================
function handleLeftClickCell(i, j) {
  if (state.gameOver) return;

  // swap2 선택 단계에서는 보드 클릭 막기
  if (state.phase === "swap2_p2_choice" || state.phase === "swap2_p2_pick" || state.phase === "swap2_p1_pick") {
    return;
  }

  const p = state.board[i][j];

  // 1) selected가 있으면 -> 이동/캡처 시도 또는 선택 변경 또는 놓기
  if (selected) {
    const [si, sj] = selected;

    // 같은 칸 다시 클릭 = 선택 해제
    if (si === i && sj === j) {
      clearSelection();
      return;
    }

    // 내 말 클릭 -> 선택 변경
    if (p && p.owner === state.turn) {
      selected = [i, j];
      computeLegalForSelected(i, j);
      return;
    }

    // 이동 가능한 칸이면 이동
    const k = key(i, j);
    if (legalMoves.has(k) || legalCaps.has(k)) {
      applyAction({ kind: "MOVE", data: [si, sj, i, j] });
      clearSelection();
      return;
    }

    // 이동 불가 칸을 클릭했으면 선택 해제 후, 빈칸이면 "놓기"
    clearSelection();
    if (!p) {
      applyAction({ kind: "PLACE", data: [i, j] });
    }
    return;
  }

  // 2) 선택이 없으면:
  if (p && p.owner === state.turn) {
    selected = [i, j];
    computeLegalForSelected(i, j);
    return;
  }

  // 빈칸이면 놓기
  if (!p) {
    applyAction({ kind: "PLACE", data: [i, j] });
  }
}

function handleRightClickCell(i, j) {
  if (state.gameOver) return;

  // swap2 선택 단계에서는 소환 막기
  if (state.phase !== "play" && state.phase !== "swap2_p1_3" && state.phase !== "swap2_p2_add2") {
    return;
  }

  // 빈칸에서만 소환 허용
  if (state.board[i][j]) return;

  openSummon(i, j);
}

// =====================
// Summon click
// =====================
for (const btn of summonBtns) {
  btn.addEventListener("click", () => {
    if (!summonCell) return;
    const [i, j] = summonCell;
    const kind = btn.getAttribute("data-kind");
    if (!kind) return;

    applyAction({ kind: "SUMMON", data: [i, j, kind] });

    // 소환 후 닫기
    closeSummon();
    hover = null;
  });
}
summonCancelBtn?.addEventListener("click", () => {
  closeSummon();
  hover = null;
});

// =====================
// Mouse events
// =====================
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const cell = mouseToIdx(mx, my);
  // hover는 우클릭 지점용이라 마우스 이동으로 덮지 않음
  // 다만, "마우스가 보드 밖이면" 우클릭 호버도 정리하고 싶으면 아래 주석 해제
  // if (!cell && !summonCell) hover = null;
});

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const cell = mouseToIdx(mx, my);
  if (!cell) return;
  const [i, j] = cell;

  if (e.button === 0) {
    // left
    handleLeftClickCell(i, j);
  }
});

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const cell = mouseToIdx(mx, my);
  if (!cell) return;
  const [i, j] = cell;

  handleRightClickCell(i, j);
});

// =====================
// Touch: Long-press to Summon (mobile)
// =====================
const LONG_PRESS_MS = 450;

let touchTimer = null;
let touchStartPos = null;       // {x,y}
let touchStartCell = null;      // [i,j]
let touchMoved = false;
let longPressed = false;

function clearTouchTimer() {
  if (touchTimer) {
    clearTimeout(touchTimer);
    touchTimer = null;
  }
}

function getTouchXY(ev) {
  const t = ev.touches?.[0] || ev.changedTouches?.[0];
  if (!t) return null;
  const rect = canvas.getBoundingClientRect();
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

// 모바일에서 화면 스크롤/줌 제스처가 캔버스 플레이를 방해하지 않게
// (CSS의 touch-action도 같이 추천하지만, JS에서도 방어)
canvas.addEventListener("touchstart", (ev) => {
  if (ev.touches.length !== 1) return;
  ev.preventDefault();

  const pos = getTouchXY(ev);
  if (!pos) return;

  const cell = mouseToIdx(pos.x, pos.y);
  if (!cell) return;

  touchStartPos = pos;
  touchStartCell = cell;
  touchMoved = false;
  longPressed = false;

  clearTouchTimer();
  touchTimer = setTimeout(() => {
    // 롱프레스 트리거
    longPressed = true;
    const [i, j] = touchStartCell;

    // 빈칸이면 소환 패널 열기 (기존 우클릭 로직 재사용)
    handleRightClickCell(i, j);
  }, LONG_PRESS_MS);
}, { passive: false });

canvas.addEventListener("touchmove", (ev) => {
  if (!touchStartPos) return;
  ev.preventDefault();

  const pos = getTouchXY(ev);
  if (!pos) return;

  // 조금이라도 움직이면 롱프레스 취소(스크롤/드래그 방지)
  const dx = pos.x - touchStartPos.x;
  const dy = pos.y - touchStartPos.y;
  const dist2 = dx*dx + dy*dy;

  // 8px 정도 움직이면 취소
  if (dist2 > 64) {
    touchMoved = true;
    clearTouchTimer();
  }
}, { passive: false });

canvas.addEventListener("touchend", (ev) => {
  ev.preventDefault();

  // 롱프레스가 이미 실행됐으면(소환 패널 열림) 탭 행동은 하지 않음
  if (longPressed) {
    clearTouchTimer();
    touchStartPos = null;
    touchStartCell = null;
    longPressed = false;
    return;
  }

  // 롱프레스가 아닌 경우: 탭 = 좌클릭과 동일 처리
  clearTouchTimer();

  if (!touchStartCell || touchMoved) {
    touchStartPos = null;
    touchStartCell = null;
    return;
  }

  const [i, j] = touchStartCell;
  handleLeftClickCell(i, j);

  touchStartPos = null;
  touchStartCell = null;
}, { passive: false });

canvas.addEventListener("touchcancel", () => {
  clearTouchTimer();
  touchStartPos = null;
  touchStartCell = null;
  touchMoved = false;
  longPressed = false;
}, { passive: false });

// =====================
// Reset
// =====================
function fullReset() {
  state = makeInitialState();
  initSwap2Fields();

  hover = null;
  clearSelection();
  closeSummon();
  closeSwapModal();

  syncUI();
  showTurnOverlay("SWAP2 START (P1 places 3)");
}
resetBtn.addEventListener("click", fullReset);

// =====================
// AI Run
// =====================
function maybeRunAI() {
  if (!aiEnabled) return;
  if (state.gameOver) return;
  if (state.phase !== "play") return;
  if (state.turn !== aiSide) return;

  // 사람이 보기 좋게 딜레이
  setTimeout(() => {
    // 혹시 그 사이에 턴이 바뀌었으면 중단
    if (!aiEnabled || state.gameOver || state.phase !== "play" || state.turn !== aiSide) return;

    const action = ai.chooseAction(state);
    if (!action) return;
    applyAction(action);
  }, 150);
}

// =====================
// UI sync
// =====================
function syncUI() {
  const t = state.turn === 1 ? "BLACK" : "WHITE";

  // 플레이어 표시(스왑2 중/후)
  let playerStr = "";
  if (state.playerColor) {
    const p = currentPlayerByColorTurn();
    playerStr = ` (P${p})`;
  }

  turnText.textContent = `TURN: ${t}${playerStr}`;
  scoreText.textContent = `SCORE B:${state.score?.[1] ?? 0}  W:${state.score?.[2] ?? 0}`;

  if (state.gameOver) {
    statusText.textContent = `WINNER: ${state.winner === 1 ? "BLACK" : "WHITE"}`;
  } else {
    // swap2 상태 표시
    if (state.phase === "swap2_p1_3") statusText.textContent = "SWAP2: P1 places 3 (B/W/B)";
    else if (state.phase === "swap2_p2_choice") statusText.textContent = "SWAP2: P2 choice";
    else if (state.phase === "swap2_p2_add2") statusText.textContent = "SWAP2: P2 places 2 (W/B)";
    else statusText.textContent = "";
  }

  syncSummonInfo();
}

// =====================
// Boot
// =====================
(function boot() {
  // summonCard 기본 숨김
  if (summonCard) summonCard.style.display = "none";
  showTurnOverlay("SWAP2 START (P1 places 3)");
  syncUI();
})();

// =====================
// Render loop
// =====================
function loop() {
  syncUI();

  // draw에 ui state 전달
  draw(state, canvas, {
    selected,
    legalMoves,
    legalCaps,
    hover,      // ⚠ render.js에서 hover를 그리도록 반영되어 있어야 보라색이 보임
  });

  requestAnimationFrame(loop);
}
loop();

// =====================
// Swap2: 오프닝 3수 완료 후 자동 모달 호출
// =====================
function maybeOpenSwap2ModalFromLoop() {
  if (state.phase === "swap2_p2_choice") openSwap2Choice();
}
