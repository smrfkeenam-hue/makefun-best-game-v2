// The track path: walking from the start station through the laid tiles.
// A path is a list of steps { x, y, entry, exit }: the train enters the cell
// from `entry` (the side it came from) and leaves through `exit`. The walk
// stops at the first cell it cannot enter, and says why:
//
//   'station'  — the path runs off the east edge at the destination row:
//                the mile is complete.
//   'gap'      — the next cell has no tile: the train would derail.
//   'mismatch' — the next cell's tile does not open toward the train.
//   'edge'     — the path runs off any other board edge.
//   'loop'     — the path revisits a cell: placing a tile that does this is
//                refused, so a live path never loops, but the walk still
//                detects it for the placement check.
//
// The train's position is a distance along the path in cell units: step i
// spans [i, i+1). Positions below 0 are on the station platform, west of
// the board, where the train waits before it sets off.
import {
  BIT, COLS, DX, DY, OPPOSITE, ROWS,
} from './config.js';
import { tileExits } from './tiles.js';

export const END_STATION = 'station';
export const END_GAP = 'gap';
export const END_MISMATCH = 'mismatch';
export const END_EDGE = 'edge';
export const END_LOOP = 'loop';

/**
 * Walk the track from the start station. `tiles` maps "x,y" to a tile
 * { kind, rot } (or is a Map with that key). Returns { steps, end,
 * endCell }: steps is the walk, end is one of the END_* reasons, endCell
 * is the cell the walk could not enter (or the exit cell for 'station').
 */
export function buildPath(tiles, startRow, endRow) {
  const get = (x, y) => (tiles instanceof Map
    ? tiles.get(`${x},${y}`) : tiles[`${x},${y}`]);
  const steps = [];
  const seen = new Set();
  let x = 0;
  let y = startRow;
  let entry = 3; // DIR_W: the train comes from the station, west of the board.
  for (;;) {
    const key = `${x},${y}`;
    if (seen.has(key)) return { steps, end: END_LOOP, endCell: { x, y } };
    seen.add(key);
    const tile = get(x, y);
    if (!tile) return { steps, end: END_GAP, endCell: { x, y } };
    const exits = tileExits(tile);
    if ((exits & BIT[entry]) === 0) {
      return { steps, end: END_MISMATCH, endCell: { x, y } };
    }
    // The exit is the tile's other opening.
    let exit = -1;
    for (let d = 0; d < 4; d += 1) {
      if (d !== entry && (exits & BIT[d]) !== 0) exit = d;
    }
    steps.push({ x, y, entry, exit });
    const nx = x + DX[exit];
    const ny = y + DY[exit];
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      if (exit === 1 && nx === COLS && y === endRow) {
        return { steps, end: END_STATION, endCell: { x: nx, y } };
      }
      return { steps, end: END_EDGE, endCell: { x: nx, y: ny } };
    }
    x = nx;
    y = ny;
    entry = OPPOSITE[exit];
  }
}

/** Is the cell (x, y) part of this path? */
export function pathHasCell(path, x, y) {
  return path.steps.some((s) => s.x === x && s.y === y);
}

/** Index of the step on cell (x, y), or -1 when the path never goes there. */
export function pathStepIndex(path, x, y) {
  for (let i = 0; i < path.steps.length; i += 1) {
    if (path.steps[i].x === x && path.steps[i].y === y) return i;
  }
  return -1;
}

/**
 * Where a point at path distance `s` sits, in cell coordinates (fractions
 * allowed). Within a step, straights run edge to edge through the centre
 * and curves follow a quarter-circle arc around the corner the two edges
 * share. Distances below 0 run west along the station platform.
 */
export function pathPoint(path, s, startRow) {
  if (s < 0) return { x: s, y: startRow + 0.5 };
  const i = Math.floor(s);
  const t = Math.min(1, Math.max(0, s - i));
  if (i >= path.steps.length) {
    const last = path.steps[path.steps.length - 1];
    if (!last) return { x: 0, y: startRow + 0.5 };
    // Past the last step: keep going in the exit direction.
    const ex = last.x + 0.5 + DX[last.exit] * (0.5 + (s - path.steps.length));
    const ey = last.y + 0.5 + DY[last.exit] * (0.5 + (s - path.steps.length));
    return { x: ex, y: ey };
  }
  const step = path.steps[i];
  const entryPoint = edgePoint(step.entry);
  const exitPoint = edgePoint(step.exit);
  if (isStraight(step)) {
    return {
      x: step.x + entryPoint.x + (exitPoint.x - entryPoint.x) * t,
      y: step.y + entryPoint.y + (exitPoint.y - entryPoint.y) * t,
    };
  }
  // Curve: quarter-circle around the corner the two edges share.
  const cx = cornerFor(step.entry, step.exit).x;
  const cy = cornerFor(step.entry, step.exit).y;
  const a0 = Math.atan2(entryPoint.y - cy, entryPoint.x - cx);
  let a1 = Math.atan2(exitPoint.y - cy, exitPoint.x - cx);
  while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
  while (a1 - a0 < -Math.PI) a1 += 2 * Math.PI;
  const a = a0 + (a1 - a0) * t;
  return { x: step.x + cx + 0.5 * Math.cos(a), y: step.y + cy + 0.5 * Math.sin(a) };
}

/** Heading (radians, 0 = east) of the path at distance `s`. */
export function pathHeading(path, s, startRow) {
  const eps = 0.02;
  const a = pathPoint(path, Math.max(-2, s - eps), startRow);
  const b = pathPoint(path, s + eps, startRow);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Midpoint of a cell edge, in cell-local coordinates. */
function edgePoint(direction) {
  if (direction === 0) return { x: 0.5, y: 0 }; // N
  if (direction === 1) return { x: 1, y: 0.5 }; // E
  if (direction === 2) return { x: 0.5, y: 1 }; // S
  return { x: 0, y: 0.5 }; // W
}

/** Does this step run straight through the cell? */
function isStraight(step) {
  return (step.entry === 0 && step.exit === 2)
    || (step.entry === 2 && step.exit === 0)
    || (step.entry === 1 && step.exit === 3)
    || (step.entry === 3 && step.exit === 1);
}

/** The cell corner shared by two edges (for a curve's arc centre). */
function cornerFor(entry, exit) {
  const pair = [entry, exit].sort().join(',');
  if (pair === '0,1') return { x: 1, y: 0 }; // N+E
  if (pair === '0,3') return { x: 0, y: 0 }; // N+W
  if (pair === '1,2') return { x: 1, y: 1 }; // E+S
  return { x: 0, y: 1 }; // S+W
}
