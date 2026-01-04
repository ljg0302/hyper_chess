import { CELL, MARGIN, BOARD_W, BOARD_H } from "./config.js";
import { inBounds } from "./config.js";

function idxToXY(i, j) {
  return [MARGIN + j * CELL, MARGIN + i * CELL];
}

export function mouseToIdx(mx, my) {
  if (mx < MARGIN - CELL/2 || mx > BOARD_W - MARGIN + CELL/2) return null;
  if (my < MARGIN - CELL/2 || my > BOARD_H - MARGIN + CELL/2) return null;

  const j = Math.floor((mx - MARGIN) / CELL + 0.5);
  const i = Math.floor((my - MARGIN) / CELL + 0.5);

  if (inBounds(i,j)) {
    const [x,y] = idxToXY(i,j);
    const r2 = (CELL*0.45) * (CELL*0.45);
    const d2 = (mx-x)*(mx-x) + (my-y)*(my-y);
    if (d2 <= r2) return [i,j];
  }
  return null;
}
