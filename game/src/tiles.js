// Track tiles: what each kind connects, how rotation turns it, and the deck
// the player draws from. A tile is { kind, rot }: rot counts 90-degree
// clockwise turns from the tile's base orientation.
//
// Exits are a bitmask over the four directions (BIT in config.js):
//   straight: E+W base, N+S when rotated once.
//   curve:    N+E base, then E+S, S+W, W+N.
//   bridge:   E+W base (only on water), N+S when rotated once.
//   tunnel:   E+W base (only on mountain), N+S when rotated once.
import { BIT, DIR_E, DIR_N, DIR_S, DIR_W, HAND_SIZE } from './config.js';

export const TILE_STRAIGHT = 'straight';
export const TILE_CURVE = 'curve';
export const TILE_BRIDGE = 'bridge';
export const TILE_TUNNEL = 'tunnel';

/** Base exits (rotation 0) for each kind. */
const BASE_EXITS = {
  [TILE_STRAIGHT]: BIT[DIR_E] | BIT[DIR_W],
  [TILE_CURVE]: BIT[DIR_N] | BIT[DIR_E],
  [TILE_BRIDGE]: BIT[DIR_E] | BIT[DIR_W],
  [TILE_TUNNEL]: BIT[DIR_E] | BIT[DIR_W],
};

/** Human names, shown in the hand and the help text. */
export const TILE_NAMES = {
  [TILE_STRAIGHT]: 'Straight',
  [TILE_CURVE]: 'Curve',
  [TILE_BRIDGE]: 'Bridge',
  [TILE_TUNNEL]: 'Tunnel',
};

/** Where each kind may be laid: grass only, or its own terrain. */
export const TILE_TERRAIN = {
  [TILE_STRAIGHT]: 'grass',
  [TILE_CURVE]: 'grass',
  [TILE_BRIDGE]: 'water',
  [TILE_TUNNEL]: 'mountain',
};

/** Rotate an exit mask 90 degrees clockwise, `rot` times. */
export function rotateMask(mask, rot) {
  let out = mask;
  for (let i = 0; i < (rot % 4); i += 1) {
    const n = (out & BIT[DIR_N]) !== 0;
    const e = (out & BIT[DIR_E]) !== 0;
    const s = (out & BIT[DIR_S]) !== 0;
    const w = (out & BIT[DIR_W]) !== 0;
    out = (w ? BIT[DIR_N] : 0) | (n ? BIT[DIR_E] : 0) | (e ? BIT[DIR_S] : 0) | (s ? BIT[DIR_W] : 0);
  }
  return out;
}

/** The exits of a tile after its rotation. */
export function tileExits(tile) {
  return rotateMask(BASE_EXITS[tile.kind], tile.rot);
}

/** Does this tile open toward `direction`? */
export function tileOpens(tile, direction) {
  return (tileExits(tile) & BIT[direction]) !== 0;
}

/** A fresh tile of a kind, unrotated. */
export function makeTile(kind) {
  return { kind, rot: 0 };
}

/**
 * Build a mile's deck: straights and curves plus the bridges and tunnels
 * the mile's terrain needs. The first few cards are arranged so the player
 * is never stuck waiting for the one tile the terrain demands.
 */
export function buildDeck(random, needsBridge, needsTunnel) {
  const deck = [];
  for (let i = 0; i < 6; i += 1) deck.push(makeTile(TILE_STRAIGHT));
  for (let i = 0; i < 6; i += 1) deck.push(makeTile(TILE_CURVE));
  if (needsBridge) {
    deck.push(makeTile(TILE_BRIDGE));
    deck.push(makeTile(TILE_BRIDGE));
  }
  if (needsTunnel) {
    deck.push(makeTile(TILE_TUNNEL));
    deck.push(makeTile(TILE_TUNNEL));
  }
  random.shuffle(deck);
  // Guarantee: a needed bridge/tunnel turns up within the first five
  // draws. Cards are drawn with pop(), so "first" means the tail of the
  // array — each needed kind gets its own tail slot, so placing one never
  // displaces the other.
  const placeAtTail = (kind, slot) => {
    if (deck[slot].kind === kind) return;
    const at = deck.findIndex((t) => t.kind === kind);
    if (at < 0) return;
    const tmp = deck[slot];
    deck[slot] = deck[at];
    deck[at] = tmp;
  };
  if (needsBridge) placeAtTail(TILE_BRIDGE, deck.length - 1);
  if (needsTunnel) placeAtTail(TILE_TUNNEL, deck.length - 2);
  return deck;
}

/** Draw the opening hand from a deck. */
export function drawHand(deck) {
  const hand = [];
  while (hand.length < HAND_SIZE && deck.length > 0) hand.push(deck.pop());
  return hand;
}
