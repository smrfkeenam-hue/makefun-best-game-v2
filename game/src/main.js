// Boot and wiring: the fixed-step loop, input routing, sound triggers,
// best-score persistence, and the ?shot= staging hook the screenshots
// use. The world owns the rules; this file owns the browser around it.
//
// In shot mode (?shot=start|play|win|lose) the world is staged once and
// then frozen — no stepping, no input — and window.__shotReady is set
// after the first frame, so the screenshot script knows the scene is set.
import {
  BEST_KEY, BOARD_X, BOARD_Y, CELL, COLS, ROWS, STEP,
} from './config.js';
import { createAudio } from './audio.js';
import { consumeClicks, consumeKeys, createInput } from './input.js';
import { createRenderer, uiRects } from './render.js';
import { stageShot } from './shots.js';
import {
  EV_BRAKE, EV_BULLDOZED, EV_COAL, EV_COUNT, EV_DERAIL, EV_DISCARDED,
  EV_INVALID, EV_LOSE, EV_MILE, EV_PLACED, EV_ROTATED, EV_START, EV_WIN,
  SCREEN_BANNER, SCREEN_COUNTDOWN, SCREEN_LOSE, SCREEN_PAUSED,
  SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
  bulldozeTile, createWorld, discardSelected, placeTile, rebuildMile,
  rotateSelected, startGame, stepWorld, useBrake,
} from './world.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const world = createWorld();
// Debug hook for the Playwright test (and anyone poking at the game in
// the console): the live world, read-only in practice.
window.__world = world;
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

let pausedFrom = SCREEN_PLAY;
let readySignaled = false;
let lastStatus = '';

// ---- best score ------------------------------------------------------
function loadBest() {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    world.best = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    world.best = 0;
  }
}

function saveBest() {
  if (world.score <= world.best) return;
  world.best = world.score;
  try {
    localStorage.setItem(BEST_KEY, String(world.best));
  } catch { /* storage unavailable: the best lives in this session only */ }
}

loadBest();

// ---- screenshot staging ----------------------------------------------
const shotParam = new URLSearchParams(window.location.search).get('shot');
const frozen = shotParam !== null && shotParam !== '';
if (frozen) {
  try {
    stageShot(world, shotParam);
  } catch (err) {
    // A failed staging must still produce a screenshot, not a blank page.
    console.error('shot staging failed', err);
  }
  window.__shotError = null;
}

// ---- actions -----------------------------------------------------------
function newRun() {
  const events = startGame(world, Date.now());
  handleEvents(events);
}

function toTitle() {
  world.screen = SCREEN_TITLE;
}

function toggleMute() {
  world.muted = !world.muted;
  audio.setMuted(world.muted);
  if (!world.muted) audio.click();
}

function togglePause() {
  if (world.screen === SCREEN_PLAY || world.screen === SCREEN_COUNTDOWN) {
    pausedFrom = world.screen;
    world.screen = SCREEN_PAUSED;
  } else if (world.screen === SCREEN_PAUSED) {
    world.screen = pausedFrom;
  }
}

function handleEvents(events) {
  for (const ev of events) {
    switch (ev.type) {
      case EV_START: audio.whistle(); break;
      case EV_PLACED: audio.place(); break;
      case EV_ROTATED: audio.rotate(); break;
      case EV_DISCARDED: audio.discard(); break;
      case EV_BULLDOZED: audio.bulldoze(); break;
      case EV_BRAKE: audio.brake(); break;
      case EV_COAL: audio.coal(); break;
      case EV_DERAIL: audio.crash(); break;
      case EV_MILE: audio.whistle(); break;
      case EV_WIN: audio.win(); saveBest(); break;
      case EV_LOSE: audio.lose(); saveBest(); break;
      case EV_COUNT: audio.countBeep(ev.n === 0); break;
      case EV_INVALID: break; // silent: the message on screen says it
      default: break;
    }
  }
}

// ---- input routing -----------------------------------------------------
function hit(rect, x, y) {
  return rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

function cellAt(x, y) {
  const cx = Math.floor((x - BOARD_X) / CELL);
  const cy = Math.floor((y - BOARD_Y) / CELL);
  if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return null;
  return { x: cx, y: cy };
}

function handleClick(click) {
  audio.unlock();
  const rects = uiRects(world.screen);
  const { x, y } = click;
  if (world.screen === SCREEN_TITLE) {
    if (hit(rects.buttons.start, x, y)) newRun();
    return;
  }
  if (world.screen === SCREEN_PAUSED) {
    if (hit(rects.buttons.resume, x, y)) togglePause();
    else if (hit(rects.buttons.newGame, x, y)) newRun();
    else if (hit(rects.buttons.toTitle, x, y)) toTitle();
    return;
  }
  if (world.screen === SCREEN_WIN || world.screen === SCREEN_LOSE) {
    if (hit(rects.buttons.again, x, y)) newRun();
    else if (hit(rects.buttons.toTitle, x, y)) toTitle();
    return;
  }
  if (world.screen !== SCREEN_PLAY && world.screen !== SCREEN_COUNTDOWN) return;
  // Hand: click to select, click again to rotate.
  for (let i = 0; i < rects.hand.length; i += 1) {
    if (hit(rects.hand[i], x, y)) {
      if (world.selected === i) handleEvents(rotateSelected(world));
      else world.selected = i;
      return;
    }
  }
  if (hit(rects.buttons.discard, x, y)) { handleEvents(discardSelected(world)); return; }
  if (hit(rects.buttons.brake, x, y)) { handleEvents(useBrake(world)); return; }
  if (hit(rects.buttons.rebuild, x, y)) { handleEvents(rebuildMile(world)); return; }
  if (hit(rects.buttons.pause, x, y)) { togglePause(); return; }
  if (hit(rects.buttons.mute, x, y)) { toggleMute(); return; }
  const cell = cellAt(x, y);
  if (!cell) return;
  if (click.button === 2) handleEvents(bulldozeTile(world, cell.x, cell.y));
  else handleEvents(placeTile(world, cell.x, cell.y));
}

function handleKey(action) {
  audio.unlock();
  if (action === 'mute') { toggleMute(); return; }
  if (action === 'pause') {
    if (world.screen === SCREEN_PLAY || world.screen === SCREEN_COUNTDOWN
      || world.screen === SCREEN_PAUSED) togglePause();
    return;
  }
  if (action === 'confirm') {
    if (world.screen === SCREEN_TITLE) newRun();
    else if (world.screen === SCREEN_WIN || world.screen === SCREEN_LOSE) newRun();
    else if (world.screen === SCREEN_PAUSED) togglePause();
    return;
  }
  if (action === 'title') {
    if (world.screen === SCREEN_PAUSED || world.screen === SCREEN_WIN
      || world.screen === SCREEN_LOSE) toTitle();
    return;
  }
  if (world.screen !== SCREEN_PLAY && world.screen !== SCREEN_COUNTDOWN) return;
  if (action === 'select0' || action === 'select1' || action === 'select2') {
    world.selected = Number(action.slice(-1));
  } else if (action === 'rotate') {
    handleEvents(rotateSelected(world));
  } else if (action === 'brake') {
    handleEvents(useBrake(world));
  } else if (action === 'discard') {
    handleEvents(discardSelected(world));
  }
}

function handleInput() {
  for (const click of consumeClicks(input)) handleClick(click);
  for (const key of consumeKeys(input)) handleKey(key);
}

// ---- status line (screen readers) --------------------------------------
function updateStatus() {
  if (!statusEl) return;
  let text = '';
  if (world.screen === SCREEN_TITLE) text = 'STEAMWARD title screen. Press Enter to start.';
  else if (world.screen === SCREEN_WIN) text = `You won! Final score ${world.score}.`;
  else if (world.screen === SCREEN_LOSE) text = `Game over at mile ${world.mile}. Score ${world.score}.`;
  else {
    text = `Mile ${world.mile} of 10. Score ${world.score}. ${world.cars} cars left.`;
  }
  if (text !== lastStatus) {
    lastStatus = text;
    statusEl.textContent = text;
  }
}

// ---- main loop ---------------------------------------------------------
let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!frozen) {
    handleInput();
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      handleEvents(stepWorld(world, STEP));
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0;
    if (world.screen === SCREEN_PLAY) audio.chug(world.train.speed, dt);
  }
  renderer.draw(world, input.hover, now / 1000);
  updateStatus();
  if (!readySignaled) {
    readySignaled = true;
    window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
