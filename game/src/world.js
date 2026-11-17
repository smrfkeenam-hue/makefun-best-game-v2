// The game itself: state, rules, scoring and the fixed-step simulation.
// Screens: title -> countdown -> play -> (banner between miles) -> win/lose,
// with paused over play. The world owns the terrain, the laid tiles, the
// track path, the deck and hand, the train, and the feedback (particles,
// floating scores, transient messages) the renderer draws.
//
// The rules, in one place:
//  - Lay track ahead of the train. It never waits.
//  - Straight/curve go on grass, bridges on water, tunnels in mountains.
//  - A tile that would loop the track is refused.
//  - A laid tile can be bulldozed (right-click, -15) until the train reaches it.
//  - A derail costs one car; the train restarts at the station, track kept.
//  - Finish mile 5 to repair one car. Finish mile 10 to win.
import {
  BRAKE_MAX, BRAKE_SECONDS, BRAKE_START, COLS, COUNTDOWN_SECONDS,
  COST_BULLDOZE, COST_DISCARD, MILE_BANNER_SECONDS, REPAIR_MILE,
  ROWS, SCORE_COAL, SCORE_MILE, SCORE_PLACE, SCORE_TIME_BONUS_MAX,
  START_CARS, STEP, TOTAL_MILES, speedForMile,
} from './config.js';
import { createRandom } from './random.js';
import {
  TILE_BRIDGE, TILE_TERRAIN, TILE_TUNNEL, buildDeck, drawHand, makeTile,
  TILE_STRAIGHT,
} from './tiles.js';
import { TERRAIN_GRASS, TERRAIN_MOUNTAIN, TERRAIN_WATER } from './config.js';
import { generateMile } from './terrain.js';
import {
  END_LOOP, buildPath, pathPoint, pathStepIndex,
} from './track.js';
import {
  TRAIN_ARRIVED, TRAIN_COAL, TRAIN_DERAILED, applyBrake, createTrain,
  stepTrain,
} from './train.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_COUNTDOWN = 'countdown';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BANNER = 'banner';
export const SCREEN_WIN = 'win';
export const SCREEN_LOSE = 'lose';

/** Events the world raises, for sound and feedback. */
export const EV_PLACED = 'placed';
export const EV_ROTATED = 'rotated';
export const EV_DISCARDED = 'discarded';
export const EV_BULLDOZED = 'bulldozed';
export const EV_BRAKE = 'brake';
export const EV_COAL = 'coal';
export const EV_DERAIL = 'derail';
export const EV_MILE = 'mile';
export const EV_WIN = 'win';
export const EV_LOSE = 'lose';
export const EV_START = 'start';
export const EV_INVALID = 'invalid';
export const EV_COUNT = 'count';

/** A fresh world, on the title screen, no game started. */
export function createWorld(random) {
  return {
    random: random || createRandom(1),
    screen: SCREEN_TITLE,
    seed: 1,
    mile: 1,
    score: 0,
    best: 0,
    cars: START_CARS,
    brakes: BRAKE_START,
    coalCount: 0,
    terrain: null,
    tiles: new Map(),
    path: { steps: [], end: 'gap', endCell: { x: 0, y: 0 } },
    deck: [],
    hand: [],
    selected: 0,
    train: createTrain(),
    countdown: 0,
    banner: 0,
    bannerText: '',
    mileTime: 0,
    totalTime: 0,
    coalTaken: new Set(),
    particles: [],
    floaters: [],
    message: null,
    messageUntil: 0,
    clock: 0,
    muted: false,
    lastCount: -1,
    respawnPending: false, // after a derail, the fresh train waits for the countdown
  };
}

/** Start a new run from the title screen. */
export function startGame(world, seed) {
  world.seed = seed;
  world.random = createRandom(seed);
  world.mile = 1;
  world.score = 0;
  world.cars = START_CARS;
  world.brakes = BRAKE_START;
  world.coalCount = 0;
  world.totalTime = 0;
  world.particles = [];
  world.floaters = [];
  world.message = null;
  setupMile(world);
  world.screen = SCREEN_COUNTDOWN;
  world.countdown = COUNTDOWN_SECONDS;
  world.lastCount = COUNTDOWN_SECONDS;
  return [{ type: EV_START }];
}

/** Lay out a mile: terrain, deck, hand, pre-laid starter track, fresh train. */
export function setupMile(world) {
  world.terrain = generateMile(world.random, world.mile);
  world.tiles = new Map();
  world.coalTaken = new Set();
  world.deck = buildDeck(world.random, world.terrain.needsBridge, world.terrain.needsTunnel);
  world.hand = drawHand(world.deck);
  world.selected = 0;
  world.brakes = BRAKE_START;
  world.mileTime = 0;
  world.train = createTrain();
  // Two starter straights out of the station, so the train always has
  // somewhere to go while the player lays the rest.
  world.tiles.set(`0,${world.terrain.startRow}`, makeTile(TILE_STRAIGHT));
  world.tiles.set(`1,${world.terrain.startRow}`, makeTile(TILE_STRAIGHT));
  rebuildPath(world);
}

/** Rebuild the track path from the laid tiles. */
export function rebuildPath(world) {
  world.path = buildPath(world.tiles, world.terrain.startRow, world.terrain.endRow);
}

/** Can the selected tile be laid on (x, y)? Returns an error string or ''. */
function placementError(world, x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return 'Off the board.';
  if (world.tiles.has(`${x},${y}`)) return 'Track is already there.';
  const tile = world.hand[world.selected];
  if (!tile) return 'No tile selected.';
  const terrain = world.terrain.grid[y][x];
  const want = TILE_TERRAIN[tile.kind];
  if (want === 'grass' && terrain !== TERRAIN_GRASS) {
    return tile.kind === TILE_BRIDGE ? 'Bridges go on water.' : 'Mountains need a tunnel.';
  }
  if (want === 'water' && terrain !== TERRAIN_WATER) return 'Bridges go on water.';
  if (want === 'mountain' && terrain !== TERRAIN_MOUNTAIN) return 'Tunnels go in mountains.';
  // Simulate: a tile that loops the track is refused.
  const trial = new Map(world.tiles);
  trial.set(`${x},${y}`, { kind: tile.kind, rot: tile.rot });
  const path = buildPath(trial, world.terrain.startRow, world.terrain.endRow);
  if (path.end === END_LOOP) return 'That would loop the track!';
  return '';
}

/** Lay the selected tile on (x, y). Returns events. */
export function placeTile(world, x, y) {
  if (world.screen !== SCREEN_PLAY && world.screen !== SCREEN_COUNTDOWN) return [];
  const error = placementError(world, x, y);
  if (error) {
    showMessage(world, error);
    return [{ type: EV_INVALID }];
  }
  const tile = world.hand[world.selected];
  world.tiles.set(`${x},${y}`, { kind: tile.kind, rot: tile.rot });
  world.hand[world.selected] = drawOne(world);
  world.score += SCORE_PLACE;
  addFloater(world, x, y, `+${SCORE_PLACE}`, '#f1c40f');
  rebuildPath(world);
  return [{ type: EV_PLACED, x, y }];
}

/** Rotate the selected tile 90 degrees clockwise. */
export function rotateSelected(world) {
  const tile = world.hand[world.selected];
  if (!tile) return [];
  tile.rot = (tile.rot + 1) % 4;
  return [{ type: EV_ROTATED }];
}

/** Discard the selected tile and draw another (-10 points, floor 0). */
export function discardSelected(world) {
  if (world.screen !== SCREEN_PLAY && world.screen !== SCREEN_COUNTDOWN) return [];
  if (!world.hand[world.selected]) return [];
  world.score = Math.max(0, world.score - COST_DISCARD);
  world.hand[world.selected] = drawOne(world);
  return [{ type: EV_DISCARDED }];
}

/** Bulldoze a laid tile the train has not reached yet (-15 points, floor 0). */
export function bulldozeTile(world, x, y) {
  if (world.screen !== SCREEN_PLAY && world.screen !== SCREEN_COUNTDOWN) return [];
  const key = `${x},${y}`;
  if (!world.tiles.has(key)) return [];
  const stepIndex = pathStepIndex(world.path, x, y);
  if (stepIndex >= 0 && stepIndex <= Math.floor(world.train.s)) {
    showMessage(world, 'The train already passed there.');
    return [{ type: EV_INVALID }];
  }
  world.tiles.delete(key);
  world.score = Math.max(0, world.score - COST_BULLDOZE);
  rebuildPath(world);
  return [{ type: EV_BULLDOZED, x, y }];
}

/** Spend a brake charge to slow the train. */
export function useBrake(world) {
  if (world.screen !== SCREEN_PLAY) return [];
  if (world.brakes <= 0) {
    showMessage(world, 'Out of brake charges — grab coal to earn more.');
    return [{ type: EV_INVALID }];
  }
  world.brakes -= 1;
  applyBrake(world.train, BRAKE_SECONDS);
  return [{ type: EV_BRAKE }];
}

/**
 * Clear the laid track (except the two starter straights) and restart the
 * train at the station. Costs one car; refused with one car left.
 */
export function rebuildMile(world) {
  if (world.screen !== SCREEN_PLAY && world.screen !== SCREEN_COUNTDOWN) return [];
  if (world.cars <= 1) {
    showMessage(world, 'Only one car left — fix the track instead.');
    return [{ type: EV_INVALID }];
  }
  world.cars -= 1;
  const { startRow } = world.terrain;
  world.tiles = new Map();
  world.tiles.set(`0,${startRow}`, makeTile(TILE_STRAIGHT));
  world.tiles.set(`1,${startRow}`, makeTile(TILE_STRAIGHT));
  world.coalTaken = new Set();
  world.train = createTrain();
  world.countdown = COUNTDOWN_SECONDS;
  world.screen = SCREEN_COUNTDOWN;
  world.lastCount = COUNTDOWN_SECONDS;
  rebuildPath(world);
  showMessage(world, 'Track cleared. One car spent.');
  return [{ type: EV_INVALID }];
}

/** Draw one card, rebuilding the deck when it runs out. */
function drawOne(world) {
  if (world.deck.length === 0) {
    world.deck = buildDeck(world.random, world.terrain.needsBridge, world.terrain.needsTunnel);
  }
  return world.deck.pop();
}

/** Show a transient feedback message for two seconds. */
export function showMessage(world, text) {
  world.message = text;
  world.messageUntil = world.clock + 2;
}

/** Add a floating score text over a board cell. */
function addFloater(world, x, y, text, color) {
  world.floaters.push({ x, y, text, color, life: 1.2 });
}

/** Add a smoke puff at a board position (cell coordinates). */
function addSmoke(world, x, y, big) {
  world.particles.push({
    x, y,
    vx: (Math.random() - 0.5) * 0.4,
    vy: -0.6 - Math.random() * 0.5,
    life: big ? 1.1 : 0.7,
    maxLife: big ? 1.1 : 0.7,
    size: big ? 0.45 : 0.28,
    color: 'smoke',
  });
}

/**
 * Advance the world one fixed step. Returns events for sound and feedback.
 * The train only moves on the play screen; the countdown and the banner
 * tick down on their own screens.
 */
export function stepWorld(world, dt) {
  const events = [];
  world.clock += dt;
  if (world.message && world.clock > world.messageUntil) world.message = null;

  // Particles and floaters always animate.
  for (const p of world.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  world.particles = world.particles.filter((p) => p.life > 0);
  for (const f of world.floaters) f.life -= dt;
  world.floaters = world.floaters.filter((f) => f.life > 0);

  if (world.screen === SCREEN_COUNTDOWN) {
    const before = Math.ceil(world.countdown);
    world.countdown -= dt;
    const after = Math.ceil(world.countdown);
    if (after !== before && after > 0) events.push({ type: EV_COUNT, n: after });
    if (world.countdown <= 0) {
      if (world.respawnPending) {
        world.train = createTrain();
        world.respawnPending = false;
      }
      world.screen = SCREEN_PLAY;
      events.push({ type: EV_COUNT, n: 0 });
    }
    return events;
  }
  if (world.screen === SCREEN_BANNER) {
    world.banner -= dt;
    if (world.banner <= 0) {
      world.mile += 1;
      setupMile(world);
      world.screen = SCREEN_COUNTDOWN;
      world.countdown = COUNTDOWN_SECONDS;
      world.lastCount = COUNTDOWN_SECONDS;
    }
    return events;
  }
  if (world.screen !== SCREEN_PLAY) return events;

  world.mileTime += dt;
  world.totalTime += dt;

  // Engine smoke while the train rolls.
  if (world.train.speed > 0.2 && Math.random() < dt * 14) {
    const cars = trainCarsForSmoke(world);
    if (cars) addSmoke(world, cars.x, cars.y - 0.25, false);
  }

  const coalAt = (x, y) => {
    const key = `${x},${y}`;
    if (world.coalTaken.has(key)) return null;
    const coal = world.terrain.coals.find((c) => c.x === x && c.y === y);
    return coal || null;
  };
  const trainEvents = stepTrain(
    world.train, dt, world.path, speedForMile(world.mile),
    world.terrain.startRow, coalAt,
  );
  for (const ev of trainEvents) {
    if (ev.type === TRAIN_COAL) {
      world.coalTaken.add(`${ev.coal.x},${ev.coal.y}`);
      world.coalCount += 1;
      world.score += SCORE_COAL;
      if (world.brakes < BRAKE_MAX) world.brakes += 1;
      addFloater(world, ev.coal.x, ev.coal.y, `+${SCORE_COAL}`, '#f1c40f');
      events.push({ type: EV_COAL, coal: ev.coal });
    } else if (ev.type === TRAIN_ARRIVED) {
      const bonus = Math.round(SCORE_TIME_BONUS_MAX
        * Math.max(0, 1 - world.mileTime / 90));
      world.score += SCORE_MILE + bonus;
      if (world.mile >= TOTAL_MILES) {
        world.screen = SCREEN_WIN;
        events.push({ type: EV_WIN });
      } else {
        const repaired = world.mile === REPAIR_MILE && world.cars < START_CARS;
        if (repaired) world.cars += 1;
        world.bannerText = `MILE ${world.mile} COMPLETE  +${SCORE_MILE + bonus}`
          + (repaired ? '  ·  CAR REPAIRED' : '');
        world.banner = MILE_BANNER_SECONDS;
        world.screen = SCREEN_BANNER;
        events.push({ type: EV_MILE });
      }
    } else if (ev.type === TRAIN_DERAILED) {
      world.cars -= 1;
      burstCrash(world);
      if (world.cars <= 0) {
        world.screen = SCREEN_LOSE;
        events.push({ type: EV_LOSE });
      } else {
        // Keep the wrecked train on show during the countdown; the fresh
        // train only leaves the station when the countdown ends.
        world.respawnPending = true;
        world.countdown = COUNTDOWN_SECONDS;
        world.screen = SCREEN_COUNTDOWN;
        world.lastCount = COUNTDOWN_SECONDS;
        showMessage(world, reasonText(ev.reason));
        events.push({ type: EV_DERAIL, reason: ev.reason });
      }
    }
  }
  return events;
}

/** Engine position for the smoke emitter (null when the train is gone). */
function trainCarsForSmoke(world) {
  if (world.train.derailed || world.train.arrived) return null;
  return pathPoint(world.path, world.train.s, world.terrain.startRow);
}

/** Crash debris at the derail point. */
function burstCrash(world) {
  const p = pathPoint(world.path, world.train.s, world.terrain.startRow);
  for (let i = 0; i < 14; i += 1) {
    world.particles.push({
      x: p.x, y: p.y,
      vx: (Math.random() - 0.5) * 3,
      vy: -Math.random() * 2.5,
      life: 0.8 + Math.random() * 0.5,
      maxLife: 1.3,
      size: 0.22 + Math.random() * 0.2,
      color: i % 3 === 0 ? 'fire' : 'smoke',
    });
  }
}

/** Plain-language reason for a derail, shown to the player. */
function reasonText(reason) {
  if (reason === 'gap') return 'Off the end of the track! Lay more, faster.';
  if (reason === 'mismatch') return 'Wrong tile — the track does not join up.';
  if (reason === 'edge') return 'Off the edge! Aim for the station on the right.';
  return 'Derailed!';
}

export { STEP };
