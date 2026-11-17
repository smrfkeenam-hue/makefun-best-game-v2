// Mile layouts: where the rivers, mountains, stations and coal go.
// Deterministic per (game seed, mile): the same seed always builds the same
// ten miles, so a screenshot scene and a test can rely on them.
//
// Difficulty ramps with the mile: mile 1 is open grass; rivers arrive on
// mile 2 (with a gap to route around at first, full-width later, so a bridge
// becomes mandatory); mountains arrive on mile 4. The start row and the
// destination row differ most miles, so a straight line never wins.
import {
  COLS, ROWS, TERRAIN_GRASS, TERRAIN_MOUNTAIN, TERRAIN_WATER,
} from './config.js';

/** How many rivers a mile has, and whether each spans the full height. */
function riverPlan(mile) {
  if (mile < 2) return [];
  if (mile === 2 || mile === 3) return [{ full: false }];
  if (mile === 4 || mile === 5) return [{ full: true }];
  if (mile === 6) return [{ full: true }, { full: false }];
  return [{ full: true }, { full: true }];
}

/** How many mountain clusters a mile has. */
function mountainClusters(mile) {
  if (mile < 4) return 0;
  if (mile < 7) return 2;
  return 3;
}

/**
 * Generate one mile's terrain. Returns { grid, startRow, endRow, coals,
 * needsBridge, needsTunnel }: grid[y][x] is a terrain kind, coals is a list
 * of {x, y} pickup cells.
 */
export function generateMile(random, mile) {
  const grid = [];
  for (let y = 0; y < ROWS; y += 1) {
    grid.push(new Array(COLS).fill(TERRAIN_GRASS));
  }
  const startRow = random.int(2, ROWS - 3);
  let endRow = random.int(1, ROWS - 2);
  if (endRow === startRow) endRow = (endRow + 2) % ROWS;

  // Rivers: vertical bands. A full river must be bridged; a gapped one can
  // be routed around through its gap.
  const rivers = riverPlan(mile);
  const usedColumns = new Set();
  let needsBridge = false;
  for (const river of rivers) {
    let col = random.int(3, COLS - 4);
    while (usedColumns.has(col)) col = random.int(3, COLS - 4);
    usedColumns.add(col);
    const gapRow = river.full ? -1 : random.int(0, ROWS - 1);
    for (let y = 0; y < ROWS; y += 1) {
      // A full river has no gap at all (the old code skipped row 0 by
      // accident: gapRow + 1 is 0 when gapRow is -1).
      if (!river.full && (y === gapRow || y === gapRow + 1)) continue;
      grid[y][col] = TERRAIN_WATER;
    }
    if (river.full) needsBridge = true;
  }

  // Mountains: small clusters, kept clear of the station rows' first and
  // last columns so the start and the destination are always reachable.
  let needsTunnel = false;
  for (let c = 0; c < mountainClusters(mile); c += 1) {
    const cx = random.int(2, COLS - 3);
    const cy = random.int(1, ROWS - 2);
    const size = random.int(2, 4);
    for (let i = 0; i < size; i += 1) {
      const x = Math.min(COLS - 1, Math.max(0, cx + random.int(-1, 1)));
      const y = Math.min(ROWS - 1, Math.max(0, cy + random.int(-1, 1)));
      if (x < 2 && (y === startRow || y === endRow)) continue;
      if (x > COLS - 3 && (y === startRow || y === endRow)) continue;
      if (grid[y][x] === TERRAIN_GRASS) {
        grid[y][x] = TERRAIN_MOUNTAIN;
        needsTunnel = true;
      }
    }
  }

  // Coal pickups on open grass in the middle of the board.
  const coals = [];
  let tries = 0;
  while (coals.length < 3 && tries < 60) {
    tries += 1;
    const x = random.int(3, COLS - 4);
    const y = random.int(0, ROWS - 1);
    if (grid[y][x] !== TERRAIN_GRASS) continue;
    if (coals.some((c) => c.x === x && c.y === y)) continue;
    coals.push({ x, y });
  }

  return {
    grid, startRow, endRow, coals, needsBridge, needsTunnel,
  };
}
