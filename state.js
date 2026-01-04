// HyperChess/js/state.js
import { BOARD_SIZE } from "./config.js";

export function makeEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null)
  );
}

export function makeInitialState() {
  return {
    board: makeEmptyBoard(),
    score: { 1: 0, 2: 0 }, // color score: 1=Black, 2=White

    gameOver: false,
    winner: 0,
    winLine: null,
    lastAction: null,

    // ===== Swap2 =====
    moveNo: 0,
    phase: "swap2_p1_3", // swap2_p1_3 -> swap2_p2_choice -> swap2_p2_2 -> normal
    playerTurn: 1,       // 1 or 2
    playerColor: { 1: null, 2: null }, // normal로 넘어가면 확정됨

    // ===== UI / Interaction =====
    hover: null,         // [i,j] or null
    selected: null,      // [i,j] or null
    summonCell: null,    // [i,j] or null (우클릭으로 지정)
  };
}
