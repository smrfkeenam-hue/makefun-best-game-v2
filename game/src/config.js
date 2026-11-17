// STEAMWARD — shared constants: board, canvas, tuning, scoring, palette.
// One place for every number the rest of the game agrees on.

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

export const COLS = 12;
export const ROWS = 8;
export const CELL = 64;
export const BOARD_X = 16;
export const BOARD_Y = 88;
export const BOARD_WIDTH = COLS * CELL; // 768
export const BOARD_HEIGHT = ROWS * CELL; // 512

export const PANEL_X = 800;
export const PANEL_WIDTH = CANVAS_WIDTH - PANEL_X - 16; // 464

export const TOTAL_MILES = 10;
export const START_CARS = 3; // lives: a derail costs one car
export const REPAIR_MILE = 5; // finishing this mile restores one car
export const HAND_SIZE = 3;
export const COUNTDOWN_SECONDS = 3;
export const MILE_BANNER_SECONDS = 2.5;

export const STEP = 1 / 60; // fixed simulation step (seconds)
export const MAX_FRAME = 0.25; // longer stalls are dropped, not replayed

// Train speed in cells per second, by mile: 1.00 on mile 1, 2.98 on mile 10.
export function speedForMile(mile) {
  return 1.0 + 0.22 * (mile - 1);
}
export const BRAKE_FACTOR = 0.35; // speed multiplier while braking
export const BRAKE_SECONDS = 3;
export const BRAKE_START = 3; // charges per mile
export const BRAKE_MAX = 5;

// Scoring.
export const SCORE_MILE = 500;
export const SCORE_TIME_BONUS_MAX = 300;
export const SCORE_COAL = 50;
export const SCORE_PLACE = 5;
export const COST_DISCARD = 10;
export const COST_BULLDOZE = 15;

// Directions: N=0, E=1, S=2, W=3. DX/DY step one cell that way.
export const DIR_N = 0;
export const DIR_E = 1;
export const DIR_S = 2;
export const DIR_W = 3;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const OPPOSITE = [2, 3, 0, 1];
// Bit for each direction in a tile's exit mask.
export const BIT = [1, 2, 4, 8];

// Terrain kinds.
export const TERRAIN_GRASS = 0;
export const TERRAIN_WATER = 1;
export const TERRAIN_MOUNTAIN = 2;

// The coherent palette: deep forest green, warm wood, steel, signal red,
// gold accents, cream text. Every drawing in render.js uses only these.
export const PALETTE = {
  page: '#12211a',
  panel: '#1e2f26',
  panelEdge: '#2e4a3a',
  grassA: '#3f7a4e',
  grassB: '#376844',
  grassEdge: '#2c5a38',
  water: '#2e7fa8',
  waterLine: '#7fc4e0',
  mountain: '#8a7a66',
  mountainSnow: '#e8e4da',
  tie: '#6b4a2a',
  tieDark: '#54371f',
  rail: '#c8ccd2',
  railDark: '#9aa0a8',
  bridge: '#a9804a',
  tunnel: '#5d5a52',
  engine: '#c0392b',
  engineDark: '#922b21',
  gold: '#f1c40f',
  carFreight: '#8e5b2f',
  carPassenger: '#2471a3',
  coal: '#1a1a1a',
  coalSpark: '#f39c12',
  cream: '#f5eeda',
  creamDim: '#c9c2ab',
  danger: '#e74c3c',
  ok: '#58d68d',
  station: '#f5eeda',
  smoke: 'rgba(220,220,220,0.55)',
};

export const BEST_KEY = 'steamward-best';
