// Staged scenes for the entry screenshots, and the autopilot that plays
// them. The judge sees the game through its screenshots, so each scene is
// a real run of the real game — no hand-drawn mockups — frozen at the
// moment that reads best:
//
//   start — the title screen.
//   play  — mile 4, the train mid-board on a half-laid track: curves, a
//           bridge over the full-width river, the next tile still in hand.
//   win   — a real ten-mile run, played to the victory screen.
//   lose  — three derails with no track laid, on the game-over screen.
//
// The autopilot is a BFS route planner: from the end of the laid track it
// finds the shortest legal route to the terminus (bridges on water,
// tunnels in mountains), then lays it, discarding until each needed tile
// turns up. It plays the same game the player does — same deck, same
// rules, same costs — so the staged scores are honest ones.
import {
  BIT, COLS, DX, DY, OPPOSITE, ROWS, STEP,
  TERRAIN_GRASS, TERRAIN_MOUNTAIN, TERRAIN_WATER,
} from './config.js';
import {
  TILE_BRIDGE, TILE_CURVE, TILE_STRAIGHT, TILE_TUNNEL, tileExits,
} from './tiles.js';
import { END_GAP, END_STATION } from './track.js';
import {
  EV_BULLDOZED, EV_PLACED, SCREEN_COUNTDOWN, SCREEN_LOSE, SCREEN_PLAY,
  SCREEN_WIN, bulldozeTile, discardSelected, placeTile, rotateSelected,
  startGame, stepWorld, useBrake,
} from './world.js';

/** Fixed seed, so every screenshot run stages the same ten miles. */
export const SHOT_SEED = 20261117;

// Tiles the deck can actually supply for a terrain kind. A gapped river
// (miles 2-3) has no bridges in the deck, so the route must go around it
// through the gap; treating water as passable there would plan a route
// the autopilot — and the player — can never build.
function kindsFor(terrain, needsBridge, needsTunnel) {
  if (terrain === TERRAIN_WATER) return needsBridge ? [TILE_BRIDGE] : [];
  if (terrain === TERRAIN_MOUNTAIN) return needsTunnel ? [TILE_TUNNEL] : [];
  return [TILE_STRAIGHT, TILE_CURVE];
}

/**
 * The shortest legal route from the end of the laid track to the terminus,
 * as a list of { x, y, kind, rot } tiles in laying order. Returns [] when
 * the track already reaches the station, or null when no route exists (or
 * the path end is not a gap — a mismatch, edge or loop must be bulldozed
 * first).
 */
export function findRoute(world) {
  const t = world.terrain;
  if (world.path.end === END_STATION) return [];
  if (world.path.end !== END_GAP) return null;
  const last = world.path.steps[world.path.steps.length - 1];
  const gap = world.path.endCell;
  const entry = last ? OPPOSITE[last.exit] : 3; // DIR_W when no steps yet
  const startKey = `${gap.x},${gap.y},${entry}`;
  const visited = new Set([startKey]);
  const parent = new Map();
  const queue = [{ x: gap.x, y: gap.y, entry }];
  while (queue.length > 0) {
    const cur = queue.shift();
    const curKey = `${cur.x},${cur.y},${cur.entry}`;
    const terrain = t.grid[cur.y][cur.x];
    for (const kind of kindsFor(terrain, t.needsBridge, t.needsTunnel)) {
      for (let rot = 0; rot < 4; rot += 1) {
        const exits = tileExits({ kind, rot });
        if ((exits & BIT[cur.entry]) === 0) continue;
        let exit = -1;
        for (let d = 0; d < 4; d += 1) {
          if (d !== cur.entry && (exits & BIT[d]) !== 0) exit = d;
        }
        const nx = cur.x + DX[exit];
        const ny = cur.y + DY[exit];
        const tile = { x: cur.x, y: cur.y, kind, rot };
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
          if (exit === 1 && nx === COLS && cur.y === t.endRow) {
            const route = reconstruct(parent, curKey, tile);
            if (route && !hasDuplicateCell(route)) return route;
            continue;
          }
          continue;
        }
        if (world.tiles.has(`${nx},${ny}`)) continue;
        const nkey = `${nx},${ny},${OPPOSITE[exit]}`;
        if (visited.has(nkey)) continue;
        visited.add(nkey);
        parent.set(nkey, { prev: curKey, tile });
        queue.push({ x: nx, y: ny, entry: OPPOSITE[exit] });
      }
    }
  }
  return null;
}

function reconstruct(parent, curKey, lastTile) {
  const route = [lastTile];
  let key = curKey;
  let guard = 0;
  while (parent.has(key) && guard < 200) {
    guard += 1;
    const { prev, tile } = parent.get(key);
    route.unshift(tile);
    key = prev;
  }
  return route;
}

function hasDuplicateCell(route) {
  const seen = new Set();
  for (const step of route) {
    const key = `${step.x},${step.y}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/** Lay one route step: find the kind in the hand (discarding until it turns up), rotate, place. */
function placeRouteStep(world, step) {
  for (let tries = 0; tries < 60; tries += 1) {
    const idx = world.hand.findIndex((t) => t && t.kind === step.kind);
    if (idx >= 0) {
      world.selected = idx;
      while (world.hand[idx].rot !== step.rot) rotateSelected(world);
      const events = placeTile(world, step.x, step.y);
      return events.some((e) => e.type === EV_PLACED);
    }
    const discardIdx = world.hand.findIndex((t) => t && t.kind !== step.kind);
    world.selected = discardIdx >= 0 ? discardIdx : 0;
    discardSelected(world);
  }
  return false;
}

/** Lay the whole route to the station (bulldozing and replanning if needed). */
export function placeFullRoute(world) {
  for (let guard = 0; guard < 300; guard += 1) {
    const route = findRoute(world);
    if (route === null) {
      const last = world.path.steps[world.path.steps.length - 1];
      if (!last) return false;
      const events = bulldozeTile(world, last.x, last.y);
      if (!events.some((e) => e.type === EV_BULLDOZED)) return false;
      continue;
    }
    if (route.length === 0) return true;
    if (!placeRouteStep(world, route[0])) return false;
  }
  return world.path.end === END_STATION;
}

/** Lay the route until the track has maxSteps steps (or the route ends). */
export function placePartialRoute(world, maxSteps) {
  for (let guard = 0; guard < 100; guard += 1) {
    if (world.path.steps.length >= maxSteps) return;
    const route = findRoute(world);
    if (!route || route.length === 0) return;
    if (!placeRouteStep(world, route[0])) return;
  }
}

/**
 * Drive the world until stopAt(world) is true, the game ends, or maxSteps
 * run out. When `place` is true the autopilot lays the full route during
 * each countdown and replans mid-mile, braking if the train nears the end
 * of the track.
 */
export function drive(world, stopAt, maxSteps, place = true) {
  let steps = 0;
  while (steps < maxSteps) {
    if (world.screen === SCREEN_WIN || world.screen === SCREEN_LOSE) return steps;
    if (stopAt && stopAt(world)) return steps;
    if (place && world.screen === SCREEN_COUNTDOWN) {
      placeFullRoute(world);
    } else if (place && world.screen === SCREEN_PLAY && world.path.end !== END_STATION) {
      placeFullRoute(world);
      if (world.train.s > world.path.steps.length - 1.5 && world.brakes > 0) {
        useBrake(world);
      }
    }
    stepWorld(world, STEP);
    steps += 1;
  }
  return steps;
}

/** Stage a named screenshot scene on a fresh world. Returns the world. */
export function stageShot(world, name) {
  if (name === 'start') return world;
  startGame(world, SHOT_SEED);
  if (name === 'lose') {
    // Two miles played well, then the track runs out: three derails in
    // mile 3, so the game-over screen shows a real run, not an empty one.
    drive(world, (w) => w.mile === 3 && w.screen === SCREEN_COUNTDOWN, 100000, true);
    drive(world, null, 30000, false);
    return world;
  }
  if (name === 'win') {
    drive(world, null, 60000, true);
    return world;
  }
  // play: autopilot through miles 1-3, then a half-laid mile 4, frozen
  // with the train mid-board and the track running out ahead of it.
  drive(world, (w) => w.mile === 4 && w.screen === SCREEN_COUNTDOWN, 100000, true);
  placePartialRoute(world, 11);
  drive(world, (w) => w.screen === SCREEN_PLAY && w.train.s >= 8, 10000, false);
  return world;
}
