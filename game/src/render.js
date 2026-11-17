// Everything the player sees, drawn on one canvas: the board (grass, water,
// mountains, stations, track, the train, smoke, floating scores), the HUD,
// the side panel (hand, buttons, help), and every screen (title, countdown,
// pause, mile banner, win, lose).
//
// The layout is fixed at 1280x720 and every button's rectangle is defined
// once here, in uiRects(), so drawing and hit-testing always agree.
// Screens are drawn over the board where it helps the judge see the loop:
// the win and lose screens keep the board behind them, dimmed.
import {
  BOARD_HEIGHT, BOARD_WIDTH, BOARD_X, BOARD_Y, CANVAS_HEIGHT, CANVAS_WIDTH,
  CELL, COLS, PANEL_WIDTH, PANEL_X, ROWS, TOTAL_MILES,
  TERRAIN_GRASS, TERRAIN_MOUNTAIN, TERRAIN_WATER, PALETTE, speedForMile,
} from './config.js';
import {
  TILE_BRIDGE, TILE_CURVE, TILE_STRAIGHT, TILE_TUNNEL, TILE_NAMES,
  tileExits,
} from './tiles.js';
import { pathPoint } from './track.js';
import { trainCars } from './train.js';
import {
  SCREEN_BANNER, SCREEN_COUNTDOWN, SCREEN_LOSE, SCREEN_PAUSED,
  SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
} from './world.js';

// Panel geometry (shared by drawing and hit-testing).
const HAND_Y = 128;
const HAND_H = 116;
const HAND_W = 140;
const HAND_GAP = 12;
const BTN_H = 40;
const BTN_GAP = 8;

/** Button and hand rectangles for the current screen. */
export function uiRects(screen) {
  const x0 = PANEL_X + 8;
  const w = PANEL_WIDTH - 16;
  const hand = [0, 1, 2].map((i) => ({
    x: x0 + i * (HAND_W + HAND_GAP), y: HAND_Y, w: HAND_W, h: HAND_H,
  }));
  const btn = (row) => ({
    x: x0, y: 256 + row * (BTN_H + BTN_GAP), w, h: BTN_H,
  });
  const rects = {
    hand,
    buttons: {
      discard: btn(0),
      brake: btn(1),
      rebuild: btn(2),
      pause: btn(3),
      mute: btn(4),
    },
  };
  if (screen === SCREEN_TITLE) {
    rects.buttons.start = {
      x: CANVAS_WIDTH / 2 - 190, y: 600, w: 380, h: 64,
    };
  }
  // The pause and end screens centre on the board (x 400), not the canvas,
  // so their boxes and buttons never spill over the side panel.
  if (screen === SCREEN_PAUSED) {
    const cx = 400 - 160;
    rects.buttons.resume = { x: cx, y: 300, w: 320, h: 52 };
    rects.buttons.newGame = { x: cx, y: 364, w: 320, h: 52 };
    rects.buttons.toTitle = { x: cx, y: 428, w: 320, h: 52 };
  }
  if (screen === SCREEN_WIN || screen === SCREEN_LOSE) {
    const cx = 400 - 160;
    rects.buttons.again = { x: cx, y: 512, w: 320, h: 56 };
    rects.buttons.toTitle = { x: cx, y: 580, w: 320, h: 52 };
  }
  return rects;
}

/** Create the renderer for a canvas element. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  function draw(world, hover, time) {
    ctx.save();
    ctx.fillStyle = PALETTE.page;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (world.screen === SCREEN_TITLE) {
      drawTitle(world, time);
    } else {
      drawBoard(world, hover, time);
      drawHud(world);
      drawPanel(world, hover);
      drawBottomStrip(world);
      if (world.screen === SCREEN_COUNTDOWN) drawCountdown(world);
      if (world.screen === SCREEN_BANNER) drawBanner(world);
      if (world.screen === SCREEN_PAUSED) drawPaused(world);
      if (world.screen === SCREEN_WIN) drawWin(world);
      if (world.screen === SCREEN_LOSE) drawLose(world);
    }
    ctx.restore();
  }

  // ---- board ---------------------------------------------------------
  function drawBoard(world, hover, time) {
    const t = world.terrain;
    if (!t) return;
    ctx.save();
    // Screen shake while the wreck settles.
    if (world.train.shake > 0) {
      const m = world.train.shake * 14;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      world.train.shake = Math.max(0, world.train.shake - 0.016);
    }
    // Board frame.
    ctx.fillStyle = PALETTE.panelEdge;
    roundRect(BOARD_X - 6, BOARD_Y - 6, BOARD_WIDTH + 12, BOARD_HEIGHT + 12, 10);
    ctx.fill();
    // Cells.
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const px = BOARD_X + x * CELL;
        const py = BOARD_Y + y * CELL;
        const terrain = t.grid[y][x];
        if (terrain === TERRAIN_WATER) {
          ctx.fillStyle = PALETTE.water;
          ctx.fillRect(px, py, CELL, CELL);
          // Animated wave lines.
          ctx.strokeStyle = PALETTE.waterLine;
          ctx.lineWidth = 2;
          ctx.beginPath();
          const off = (time * 24 + y * 17 + x * 11) % 32;
          for (let i = 0; i < 2; i += 1) {
            const wy = py + 18 + i * 26;
            ctx.moveTo(px + 8 + off * 0.4, wy);
            ctx.quadraticCurveTo(px + 20, wy - 5, px + 32, wy);
            ctx.quadraticCurveTo(px + 44, wy + 5, px + 56, wy);
          }
          ctx.stroke();
        } else if (terrain === TERRAIN_MOUNTAIN) {
          ctx.fillStyle = (x + y) % 2 === 0 ? PALETTE.grassA : PALETTE.grassB;
          ctx.fillRect(px, py, CELL, CELL);
          drawMountain(px, py);
        } else {
          ctx.fillStyle = (x + y) % 2 === 0 ? PALETTE.grassA : PALETTE.grassB;
          ctx.fillRect(px, py, CELL, CELL);
          // Grass tufts for texture.
          ctx.strokeStyle = PALETTE.grassEdge;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          const gx = px + 10 + ((x * 7 + y * 13) % 40);
          const gy = py + 12 + ((x * 11 + y * 5) % 38);
          ctx.moveTo(gx, gy + 6);
          ctx.lineTo(gx + 3, gy);
          ctx.moveTo(gx + 6, gy + 6);
          ctx.lineTo(gx + 9, gy + 1);
          ctx.stroke();
        }
      }
    }
    // Coal pickups.
    for (const coal of t.coals) {
      if (world.coalTaken.has(`${coal.x},${coal.y}`)) continue;
      drawCoal(BOARD_X + coal.x * CELL, BOARD_Y + coal.y * CELL, time);
    }
    // Stations: depot on the west edge, terminus on the east.
    drawStationSign(BOARD_X - 4, BOARD_Y + t.startRow * CELL, 'DEPOT', false);
    drawStationSign(BOARD_X + BOARD_WIDTH + 4, BOARD_Y + t.endRow * CELL, 'TERMINUS', true);
    // Destination glow: the player always knows where the train must go.
    const ex = BOARD_X + BOARD_WIDTH;
    const ey = BOARD_Y + t.endRow * CELL + CELL / 2;
    const pulse = 0.5 + 0.3 * Math.sin(time * 3);
    ctx.fillStyle = `rgba(241,196,15,${0.25 * pulse})`;
    ctx.beginPath();
    ctx.arc(ex - 10, ey, 34 + 6 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(ex - 26, ey - 10);
    ctx.lineTo(ex - 6, ey);
    ctx.lineTo(ex - 26, ey + 10);
    ctx.closePath();
    ctx.fill();
    // Laid track.
    for (const [key, tile] of world.tiles) {
      const [x, y] = key.split(',').map(Number);
      drawTile(BOARD_X + x * CELL, BOARD_Y + y * CELL, tile, 1);
    }
    // Ghost tile under the cursor.
    if (hover && (world.screen === SCREEN_PLAY || world.screen === SCREEN_COUNTDOWN)) {
      const gx = Math.floor((hover.x - BOARD_X) / CELL);
      const gy = Math.floor((hover.y - BOARD_Y) / CELL);
      if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS && !world.tiles.has(`${gx},${gy}`)) {
        const tile = world.hand[world.selected];
        if (tile) {
          const ok = ghostOk(world, gx, gy, tile);
          drawTile(BOARD_X + gx * CELL, BOARD_Y + gy * CELL, tile, 0.55);
          ctx.strokeStyle = ok ? PALETTE.ok : PALETTE.danger;
          ctx.lineWidth = 3;
          ctx.strokeRect(BOARD_X + gx * CELL + 2, BOARD_Y + gy * CELL + 2, CELL - 4, CELL - 4);
        }
      }
    }
    // The train.
    drawTrain(world, time);
    // Particles (smoke, crash debris).
    for (const p of world.particles) {
      const px = BOARD_X + p.x * CELL;
      const py = BOARD_Y + p.y * CELL;
      const a = Math.max(0, p.life / p.maxLife);
      const r = p.size * CELL * (1.6 - a * 0.6);
      ctx.fillStyle = p.color === 'fire'
        ? `rgba(231,76,60,${a})` : `rgba(220,220,220,${a * 0.55})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Floating score texts.
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px "Trebuchet MS", Verdana, sans-serif';
    for (const f of world.floaters) {
      const px = BOARD_X + (f.x + 0.5) * CELL;
      const py = BOARD_Y + f.y * CELL - (1.2 - f.life) * 30;
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, px, py);
      ctx.globalAlpha = 1;
    }
    // Transient message toast.
    if (world.message) {
      ctx.font = 'bold 19px "Trebuchet MS", Verdana, sans-serif';
      const w = ctx.measureText(world.message).width + 36;
      ctx.fillStyle = 'rgba(18,33,26,0.92)';
      roundRect(CANVAS_WIDTH / 2 - w / 2 - 140, BOARD_Y + BOARD_HEIGHT - 46, w, 34, 8);
      ctx.fill();
      ctx.fillStyle = PALETTE.cream;
      ctx.textAlign = 'center';
      ctx.fillText(world.message, CANVAS_WIDTH / 2 - 140, BOARD_Y + BOARD_HEIGHT - 22);
    }
    ctx.restore();
  }

  function ghostOk(world, x, y, tile) {
    const terrain = world.terrain.grid[y][x];
    if (tile.kind === TILE_BRIDGE) return terrain === TERRAIN_WATER;
    if (tile.kind === TILE_TUNNEL) return terrain === TERRAIN_MOUNTAIN;
    return terrain === TERRAIN_GRASS;
  }

  function drawMountain(px, py) {
    ctx.fillStyle = PALETTE.mountain;
    ctx.beginPath();
    ctx.moveTo(px + 8, py + 54);
    ctx.lineTo(px + 32, py + 12);
    ctx.lineTo(px + 56, py + 54);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.mountainSnow;
    ctx.beginPath();
    ctx.moveTo(px + 24, py + 26);
    ctx.lineTo(px + 32, py + 12);
    ctx.lineTo(px + 40, py + 26);
    ctx.lineTo(px + 35, py + 22);
    ctx.lineTo(px + 32, py + 27);
    ctx.lineTo(px + 29, py + 22);
    ctx.closePath();
    ctx.fill();
  }

  function drawCoal(px, py, time) {
    const bob = Math.sin(time * 2 + px) * 2;
    ctx.fillStyle = PALETTE.coal;
    ctx.beginPath();
    ctx.arc(px + 32, py + 32 + bob, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px + 24, py + 38 + bob, 7, 0, Math.PI * 2);
    ctx.arc(px + 41, py + 39 + bob, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.coalSpark;
    ctx.beginPath();
    ctx.arc(px + 29, py + 28 + bob, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStationSign(px, py, label, east) {
    ctx.fillStyle = '#5d4a2f';
    ctx.fillRect(px - 4, py + 10, 8, 44);
    ctx.fillStyle = PALETTE.station;
    const w = label === 'DEPOT' ? 62 : 96;
    const sx = east ? px - w + 4 : px - 4;
    roundRect(sx, py + 2, w, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 12px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, sx + w / 2, py + 18);
  }

  // One track tile, drawn at pixel (px, py) with rotation and opacity.
  function drawTile(px, py, tile, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = px + CELL / 2;
    const cy = py + CELL / 2;
    ctx.translate(cx, cy);
    ctx.rotate((tile.rot * Math.PI) / 2);
    ctx.translate(-cx, -cy);
    if (tile.kind === TILE_BRIDGE) {
      ctx.fillStyle = PALETTE.bridge;
      roundRect(px + 4, py + 18, CELL - 8, 28, 4);
      ctx.fill();
      ctx.fillStyle = '#8a6a35';
      for (let i = 0; i < 4; i += 1) ctx.fillRect(px + 10 + i * 14, py + 14, 5, 36);
    } else if (tile.kind === TILE_TUNNEL) {
      ctx.fillStyle = PALETTE.tunnel;
      ctx.beginPath();
      ctx.arc(cx, cy + 6, 24, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(px + 8, cy + 6, CELL - 16, 12);
      ctx.fillStyle = '#3a382f';
      ctx.beginPath();
      ctx.arc(cx, cy + 8, 15, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(px + 17, cy + 8, CELL - 34, 10);
    }
    // Ties then rails, following the tile's exits.
    const exits = tileExits({ kind: tile.kind, rot: 0 });
    drawRailsFor(px, py, exits, tile.kind === TILE_TUNNEL);
    ctx.restore();
  }

  // Rails and ties for a tile in its base orientation (rotation is applied
  // by the caller's transform). Straight: horizontal. Curve: N+E arc.
  function drawRailsFor(px, py, exits, dark) {
    const tie = dark ? PALETTE.tieDark : PALETTE.tie;
    const rail = dark ? PALETTE.railDark : PALETTE.rail;
    const straight = exits === 10; // E+W
    ctx.strokeStyle = tie;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    if (straight) {
      for (let i = 0; i < 5; i += 1) {
        const tx = px + 10 + i * 12;
        ctx.beginPath();
        ctx.moveTo(tx, py + 20);
        ctx.lineTo(tx, py + 44);
        ctx.stroke();
      }
    } else {
      // Curve ties along the arc.
      for (let i = 0; i < 4; i += 1) {
        const a = (Math.PI / 2) * (0.15 + i * 0.23);
        const mx = px + CELL - 6 - Math.cos(a) * 26;
        const my = py + 6 + Math.sin(a) * 26;
        ctx.beginPath();
        ctx.moveTo(mx - 5 * Math.cos(a + Math.PI / 2), my - 5 * Math.sin(a + Math.PI / 2));
        ctx.lineTo(mx + 5 * Math.cos(a + Math.PI / 2), my + 5 * Math.sin(a + Math.PI / 2));
        ctx.stroke();
      }
    }
    ctx.strokeStyle = rail;
    ctx.lineWidth = 3;
    if (straight) {
      for (const off of [-8, 8]) {
        ctx.beginPath();
        ctx.moveTo(px + 2, py + CELL / 2 + off);
        ctx.lineTo(px + CELL - 2, py + CELL / 2 + off);
        ctx.stroke();
      }
    } else {
      // N+E curve: arcs centred on the top-right corner.
      for (const r of [18, 34]) {
        ctx.beginPath();
        ctx.arc(px + CELL - 6, py + 6, r, 0, Math.PI / 2);
        ctx.stroke();
      }
    }
  }

  function drawTrain(world, time) {
    const cars = trainCars(world.train, world.path, world.terrain.startRow);
    const derailed = world.train.derailed;
    // Draw back to front so the engine overlaps the cars.
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const car = cars[i];
      const px = BOARD_X + car.x * CELL;
      const py = BOARD_Y + car.y * CELL;
      if (px < -70 || px > CANVAS_WIDTH + 70 || py < -70 || py > CANVAS_HEIGHT + 70) continue;
      const tilt = derailed && i === 0 ? 0.5 : derailed ? -0.25 : 0;
      drawCar(px, py, car.heading + tilt, i, time);
    }
  }

  function drawCar(px, py, heading, index, time) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading);
    const len = 52;
    const wid = 30;
    // Wheels.
    ctx.fillStyle = '#1a1a1a';
    for (const wx of [-16, 0, 16]) {
      ctx.beginPath();
      ctx.arc(wx, -wid / 2 - 1, 5, 0, Math.PI * 2);
      ctx.arc(wx, wid / 2 + 1, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Body.
    ctx.fillStyle = index === 0 ? PALETTE.engine
      : index === 1 ? PALETTE.carFreight : PALETTE.carPassenger;
    roundRect(-len / 2, -wid / 2, len, wid, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    roundRect(-len / 2, wid / 2 - 8, len, 8, 4);
    ctx.fill();
    if (index === 0) {
      // Engine: chimney, gold dome, cabin, cowcatcher.
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(len / 2 - 16, -wid / 2 - 8, 10, 10);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(6, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.engineDark;
      ctx.fillRect(-len / 2 + 2, -wid / 2 + 2, 14, wid - 4);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(len / 2, -10);
      ctx.lineTo(len / 2 + 10, 0);
      ctx.lineTo(len / 2, 10);
      ctx.closePath();
      ctx.fill();
    } else if (index === 1) {
      // Freight: crates.
      ctx.fillStyle = '#a9804a';
      ctx.fillRect(-14, -9, 12, 18);
      ctx.fillRect(2, -9, 12, 18);
    } else {
      // Passenger: windows.
      ctx.fillStyle = '#aed6f1';
      for (const wx of [-16, -4, 8]) ctx.fillRect(wx, -8, 9, 16);
    }
    ctx.restore();
  }

  // ---- HUD -----------------------------------------------------------
  function drawHud(world) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, CANVAS_WIDTH, 72);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, 70, CANVAS_WIDTH, 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 30px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText('STEAMWARD', 16, 46);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = 'bold 22px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(`MILE ${Math.min(world.mile, TOTAL_MILES)} / ${TOTAL_MILES}`, 300, 45);
    ctx.fillText(`SCORE ${world.score.toLocaleString('en-US')}`, 480, 45);
    // Cars (lives) as little engines.
    for (let i = 0; i < 3; i += 1) {
      const cx = 720 + i * 40;
      ctx.fillStyle = i < world.cars ? PALETTE.engine : 'rgba(255,255,255,0.15)';
      roundRect(cx, 24, 30, 20, 4);
      ctx.fill();
      ctx.fillStyle = i < world.cars ? PALETTE.gold : 'rgba(255,255,255,0.15)';
      ctx.fillRect(cx + 20, 16, 6, 8);
    }
    ctx.fillStyle = PALETTE.creamDim;
    ctx.font = '18px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(`SPEED ${speedForMile(world.mile).toFixed(1)}`, 860, 45);
    ctx.fillText(`BEST ${Math.max(world.best, world.score).toLocaleString('en-US')}`, 1030, 45);
  }

  // ---- side panel ------------------------------------------------------
  function drawPanel(world, hover) {
    ctx.fillStyle = PALETTE.panel;
    roundRect(PANEL_X, BOARD_Y, PANEL_WIDTH, BOARD_HEIGHT, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.cream;
    ctx.font = 'bold 19px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('YOUR HAND  —  click a tile, then the board', PANEL_X + 12, BOARD_Y + 26);
    const rects = uiRects(world.screen);
    // Hand slots.
    world.hand.forEach((tile, i) => {
      const r = rects.hand[i];
      const selected = world.selected === i;
      ctx.fillStyle = selected ? '#2e4a3a' : '#16241c';
      roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.fill();
      ctx.strokeStyle = selected ? PALETTE.gold : PALETTE.panelEdge;
      ctx.lineWidth = selected ? 3 : 2;
      roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.stroke();
      if (tile) {
        drawTile(r.x + (r.w - CELL) / 2, r.y + 8, tile, 1);
        ctx.fillStyle = PALETTE.cream;
        ctx.font = 'bold 16px "Trebuchet MS", Verdana, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(TILE_NAMES[tile.kind], r.x + r.w / 2, r.y + r.h - 10);
      }
      ctx.fillStyle = PALETTE.creamDim;
      ctx.font = '13px "Trebuchet MS", Verdana, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`[${i + 1}]`, r.x + 6, r.y + 16);
    });
    // Buttons.
    drawButton(rects.buttons.discard, `DISCARD SELECTED  (−${10})`, true);
    drawButton(rects.buttons.brake, `BRAKE  —  ${world.brakes} charges  [SPACE]`, world.brakes > 0);
    drawButton(rects.buttons.rebuild, 'REBUILD MILE  (costs 1 car)', world.cars > 1);
    drawButton(rects.buttons.pause, 'PAUSE  [P]', true);
    drawButton(rects.buttons.mute, world.muted ? 'SOUND: OFF  [M]' : 'SOUND: ON  [M]', true);
    // Help box (fits between the last button and the panel bottom).
    const hy = 496;
    ctx.fillStyle = '#16241c';
    roundRect(PANEL_X + 8, hy, PANEL_WIDTH - 16, BOARD_Y + BOARD_HEIGHT - hy - 8, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.cream;
    ctx.font = 'bold 15px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('HOW TO PLAY', PANEL_X + 20, hy + 20);
    ctx.fillStyle = PALETTE.creamDim;
    ctx.font = '14px "Trebuchet MS", Verdana, sans-serif';
    const lines = [
      'Lay track ahead of the train — it never waits.',
      'Bridge rivers, tunnel mountains. Reach TERMINUS.',
      'Coal: +50 points and +1 brake charge.',
      'Right-click a laid tile to remove it (−15).',
    ];
    lines.forEach((line, i) => ctx.fillText(line, PANEL_X + 20, hy + 41 + i * 17));
  }

  function drawButton(rect, label, enabled) {
    ctx.fillStyle = enabled ? '#2e4a3a' : '#22302a';
    roundRect(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
    ctx.strokeStyle = enabled ? PALETTE.gold : PALETTE.panelEdge;
    ctx.lineWidth = enabled ? 2 : 1;
    roundRect(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.stroke();
    ctx.fillStyle = enabled ? PALETTE.cream : PALETTE.creamDim;
    ctx.font = 'bold 16px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 6);
  }

  function drawBottomStrip(world) {
    // Mile progress dots.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.creamDim;
    ctx.font = '15px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText('MILES:', 16, 650);
    for (let m = 1; m <= TOTAL_MILES; m += 1) {
      const cx = 90 + (m - 1) * 26;
      ctx.beginPath();
      ctx.arc(cx, 645, m === world.mile ? 9 : 7, 0, Math.PI * 2);
      if (m < world.mile || world.screen === SCREEN_WIN) ctx.fillStyle = PALETTE.gold;
      else if (m === world.mile) ctx.fillStyle = PALETTE.engine;
      else ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fill();
      if (m === 5) {
        ctx.fillStyle = PALETTE.ok;
        ctx.font = 'bold 11px "Trebuchet MS", Verdana, sans-serif';
        ctx.fillText('+', cx - 3, 649);
      }
    }
    ctx.fillStyle = PALETTE.creamDim;
    ctx.font = '15px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText('Click a tile, then the board  ·  R rotate  ·  Right-click removes a tile  ·  SPACE brake  ·  P pause', 360, 650);
    ctx.fillText('Finish Mile 5 to repair one car.  Coal earns brake charges.', 360, 676);
  }

  // ---- screens ---------------------------------------------------------
  function drawTitle(world, time) {
    // Sky gradient + hills backdrop.
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, '#0e1f16');
    grad.addColorStop(0.6, '#1d3a2f');
    grad.addColorStop(1, '#12211a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    // Moon, stars and hills: the title screen's middle is a night scene.
    ctx.fillStyle = '#f5e9c8';
    ctx.beginPath();
    ctx.arc(1120, 90, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8d9a8';
    ctx.beginPath();
    ctx.arc(1110, 82, 8, 0, Math.PI * 2);
    ctx.arc(1130, 100, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const stars = [[80, 70], [200, 130], [340, 60], [520, 110], [700, 70], [880, 130], [1020, 60], [60, 220], [1220, 220]];
    for (const [sx, sy] of stars) {
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#16301f';
    ctx.beginPath();
    ctx.moveTo(0, 392);
    ctx.quadraticCurveTo(200, 300, 420, 392);
    ctx.quadraticCurveTo(640, 310, 860, 392);
    ctx.quadraticCurveTo(1060, 320, 1280, 392);
    ctx.lineTo(1280, 420);
    ctx.lineTo(0, 420);
    ctx.closePath();
    ctx.fill();
    // Decorative track + train across the middle.
    ctx.fillStyle = PALETTE.tie;
    for (let i = 0; i < 22; i += 1) ctx.fillRect(60 + i * 54, 392, 10, 44);
    ctx.strokeStyle = PALETTE.rail;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, 400);
    ctx.lineTo(1240, 400);
    ctx.moveTo(40, 428);
    ctx.lineTo(1240, 428);
    ctx.stroke();
    const trainX = 200 + ((time * 60) % 900);
    drawCar(trainX, 414, 0, 0, time);
    drawCar(trainX - 62, 414, 0, 1, time);
    drawCar(trainX - 124, 414, 0, 2, time);
    // Title.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 84px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText('STEAMWARD', CANVAS_WIDTH / 2, 130);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = 'italic 26px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText('The train never stops. Lay the track before it does.', CANVAS_WIDTH / 2, 176);
    // Goal + controls boxes.
    const boxY = 452;
    ctx.fillStyle = 'rgba(30,47,38,0.95)';
    roundRect(90, boxY, 500, 130, 12);
    ctx.fill();
    roundRect(690, boxY, 500, 130, 12);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 20px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText('YOUR GOAL', 116, boxY + 30);
    ctx.fillText('CONTROLS', 716, boxY + 30);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '17px "Trebuchet MS", Verdana, sans-serif';
    const goal = [
      'Guide the runaway engine 10 miles to the terminus.',
      'You have 3 cars — each derail costs one.',
      'Lose them all and the run ends.',
    ];
    goal.forEach((line, i) => ctx.fillText(line, 116, boxY + 58 + i * 26));
    const controls = [
      'Click a hand tile, then the board to lay it.',
      'R rotate  ·  Right-click removes a tile (−15).',
      'SPACE brake  ·  D discard (−10)  ·  P pause.',
    ];
    controls.forEach((line, i) => ctx.fillText(line, 716, boxY + 58 + i * 26));
    // Start button.
    const rects = uiRects(SCREEN_TITLE);
    const b = rects.buttons.start;
    ctx.fillStyle = PALETTE.gold;
    roundRect(b.x, b.y, b.w, b.h, 12);
    ctx.fill();
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 26px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▶  START THE RUN', CANVAS_WIDTH / 2, b.y + 42);
    ctx.fillStyle = PALETTE.creamDim;
    ctx.font = '16px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(`or press ENTER   ·   Best score: ${world.best.toLocaleString('en-US')}`, CANVAS_WIDTH / 2, b.y + b.h + 28);
  }

  function drawCountdown(world) {
    const n = Math.ceil(world.countdown);
    ctx.fillStyle = 'rgba(18,33,26,0.45)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 120px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(n > 0 ? String(n) : 'GO!', 400, 360);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = 'bold 26px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(world.respawnPending ? 'The train leaves again — fix the track!' : 'Lay your track — the train is coming!', 400, 420);
  }

  function drawBanner(world) {
    ctx.fillStyle = 'rgba(18,33,26,0.55)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 54px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(world.bannerText, 400, 340);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '22px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(`Next mile: the train runs at ${speedForMile(world.mile + 1).toFixed(1)} cells a second.`, 400, 390);
  }

  function drawPaused(world) {
    ctx.fillStyle = 'rgba(18,33,26,0.8)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.cream;
    ctx.font = 'bold 56px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText('PAUSED', 400, 220);
    ctx.font = '20px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillStyle = PALETTE.creamDim;
    ctx.fillText(`Mile ${world.mile} of ${TOTAL_MILES}  ·  Score ${world.score.toLocaleString('en-US')}  ·  ${world.cars} cars left`, 400, 262);
    const rects = uiRects(SCREEN_PAUSED);
    drawButton(rects.buttons.resume, 'RESUME  [P]', true);
    drawButton(rects.buttons.newGame, 'NEW GAME', true);
    drawButton(rects.buttons.toTitle, 'BACK TO TITLE  [T]', true);
  }

  function drawWin(world) {
    drawEndScreen(world, true);
  }

  function drawLose(world) {
    drawEndScreen(world, false);
  }

  function drawEndScreen(world, won) {
    ctx.fillStyle = 'rgba(18,33,26,0.82)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.textAlign = 'center';
    ctx.fillStyle = won ? PALETTE.gold : PALETTE.danger;
    // The win line is long: a smaller size keeps it inside the board.
    ctx.font = won
      ? 'bold 46px "Trebuchet MS", Verdana, sans-serif'
      : 'bold 56px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(won ? 'ALL ABOARD — YOU MADE IT!' : 'DERAILED!', 400, 190);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '22px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText(
      won ? 'Ten miles, three cars, one runaway engine — and you brought it home.'
        : `The run ends at Mile ${world.mile}. The engine deserved better track.`,
      400, 238,
    );
    // Stats box, centred on the board so it never covers the side panel.
    const minutes = Math.floor(world.totalTime / 60);
    const seconds = Math.floor(world.totalTime % 60);
    const stats = [
      ['SCORE', world.score.toLocaleString('en-US')],
      ['BEST', Math.max(world.best, world.score).toLocaleString('en-US')],
      ['MILES', `${won ? TOTAL_MILES : world.mile - 1} / ${TOTAL_MILES}`],
      ['COAL', String(world.coalCount)],
      ['TIME', `${minutes}:${String(seconds).padStart(2, '0')}`],
    ];
    ctx.fillStyle = 'rgba(30,47,38,0.95)';
    roundRect(400 - 330, 280, 660, 150, 12);
    ctx.fill();
    stats.forEach(([label, value], i) => {
      const x = 400 - 280 + i * 124;
      ctx.fillStyle = PALETTE.creamDim;
      ctx.font = '15px "Trebuchet MS", Verdana, sans-serif';
      ctx.fillText(label, x, 316);
      ctx.fillStyle = PALETTE.cream;
      ctx.font = 'bold 30px "Trebuchet MS", Verdana, sans-serif';
      ctx.fillText(value, x, 356);
    });
    ctx.fillStyle = PALETTE.creamDim;
    ctx.font = '17px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillText('Press ENTER to play again, or T for the title screen.', 400, 470);
    const rects = uiRects(won ? SCREEN_WIN : SCREEN_LOSE);
    drawButton(rects.buttons.again, won ? 'PLAY AGAIN  [ENTER]' : 'TRY AGAIN  [ENTER]', true);
    drawButton(rects.buttons.toTitle, 'TITLE  [T]', true);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { draw };
}
