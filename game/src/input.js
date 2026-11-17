// Raw input: mouse clicks (in canvas coordinates) and key actions, queued
// for the main loop to consume once a frame. Hit-testing lives in main.js,
// which knows the current screen's button layout; this module only reports
// where the player clicked and which keys went down.
//
// Keys: 1/2/3 pick a hand tile, R rotates it, Space brakes, D discards,
// P or Esc pauses, M mutes, Enter confirms, T goes back to the title.
// Right-click bulldozes a laid tile (the context menu is suppressed).
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './config.js';

const KEY_ACTIONS = {
  Digit1: 'select0',
  Digit2: 'select1',
  Digit3: 'select2',
  KeyR: 'rotate',
  Space: 'brake',
  KeyD: 'discard',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
  Enter: 'confirm',
  KeyT: 'title',
};

/** Attach input listeners to the canvas. Returns the input handle. */
export function createInput(canvas) {
  const input = {
    clicks: [],
    keys: [],
    hover: null,
    destroy() {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
    },
  };

  function toCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  }

  function onMouseDown(event) {
    const p = toCanvas(event.clientX, event.clientY);
    input.clicks.push({ x: p.x, y: p.y, button: event.button });
  }

  function onMouseMove(event) {
    input.hover = toCanvas(event.clientX, event.clientY);
  }

  function onMouseLeave() {
    input.hover = null;
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  function onKeyDown(event) {
    const action = KEY_ACTIONS[event.code];
    if (!action) return;
    event.preventDefault();
    if (!event.repeat) input.keys.push(action);
  }

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  return input;
}

/** Take and clear the clicks queued since the last call. */
export function consumeClicks(input) {
  const out = input.clicks;
  input.clicks = [];
  return out;
}

/** Take and clear the key actions queued since the last call. */
export function consumeKeys(input) {
  const out = input.keys;
  input.keys = [];
  return out;
}
