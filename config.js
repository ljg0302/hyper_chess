export const BOARD_SIZE = 19;
export const CELL = 32;
export const MARGIN = 35;
export const TOP_BAR = 0;   // 웹은 상단바를 HTML로 따로 쓰니 0으로 두자
export const STONE_RADIUS = 12;

export const RIGHT_PANEL = 320;

export const BOARD_W = MARGIN * 2 + CELL * (BOARD_SIZE - 1);
export const BOARD_H = MARGIN * 2 + CELL * (BOARD_SIZE - 1);

export const BG_COLOR = "#ebc878";
export const LINE_COLOR = "#000";

export const COLORS = {
  black: "#000",
  white: "#fff",
  red: "#dc0000",
  blue: "#005adc",
  yellow: "#dcb400",
  green: "#00b400",
  gray: "#5a5a5a",
};

export const SUMMON_COST = { N: 4, B: 4, R: 6, Q: 10 };
export const CAPTURE_VALUE = { S: 1, N: 3, B: 3, R: 5, Q: 9 };

export function opponent(p) {
  return p === 1 ? 2 : 1;
}
export function inBounds(i, j) {
  return 0 <= i && i < BOARD_SIZE && 0 <= j && j < BOARD_SIZE;
}
