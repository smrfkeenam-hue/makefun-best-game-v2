// The runaway train: one engine and two cars following the track path.
// The train's position is a distance `s` along the path in cell units; the
// cars trail at fixed distances behind the engine. Speed ramps up from a
// standstill at the start of a mile, and the brake slows it to a crawl.
//
// The train derails the moment it runs out of track: when its distance
// reaches the path's length and the path does not end at the destination
// station. It never derails for any other reason — a loop is refused at
// placement time, and a wrong-kind tile cannot be laid on its terrain.
import { BRAKE_FACTOR } from './config.js';
import { END_STATION, pathHeading, pathPoint } from './track.js';

/** How far behind the engine each car rides, in path units. */
export const CAR_GAPS = [0, 0.9, 1.8];

/** Events the train can raise while stepping. */
export const TRAIN_DERAILED = 'derailed';
export const TRAIN_ARRIVED = 'arrived';
export const TRAIN_COAL = 'coal';

/** A fresh train, waiting at the station platform. */
export function createTrain() {
  return {
    s: -0.6, // engine waits just west of the board edge, nose on show
    speed: 0, // current speed (cells/s); ramps up from 0
    braking: 0, // seconds of brake left
    derailed: false,
    arrived: false,
    lastStep: -1, // path step index the engine has entered most recently
    shake: 0, // crash shake timer (seconds), for the renderer
  };
}

/**
 * Advance the train one fixed step. `path` is the current track path,
 * `baseSpeed` the mile's speed, `coalAt` a function (x, y) => coal object
 * or null (it is cleared when collected). Returns an array of events:
 * TRAIN_COAL (with the coal), TRAIN_ARRIVED, or TRAIN_DERAILED.
 */
export function stepTrain(train, dt, path, baseSpeed, startRow, coalAt) {
  const events = [];
  if (train.derailed || train.arrived) return events;
  // Ramp up from a standstill over the first two seconds of the mile.
  const target = baseSpeed * (train.braking > 0 ? BRAKE_FACTOR : 1);
  train.speed += (target - train.speed) * Math.min(1, dt * 1.5);
  if (train.braking > 0) train.braking = Math.max(0, train.braking - dt);
  train.s += train.speed * dt;

  // Coal: collected as the engine enters a step whose cell holds some.
  const stepIndex = Math.floor(train.s);
  if (stepIndex > train.lastStep) {
    for (let i = Math.max(0, train.lastStep + 1); i <= stepIndex; i += 1) {
      const step = path.steps[i];
      if (!step) break;
      const coal = coalAt(step.x, step.y);
      if (coal) events.push({ type: TRAIN_COAL, coal });
    }
    train.lastStep = stepIndex;
  }

  // Out of track?
  if (train.s >= path.steps.length) {
    if (path.end === END_STATION) {
      train.arrived = true;
      events.push({ type: TRAIN_ARRIVED });
    } else {
      train.derailed = true;
      train.shake = 0.6;
      events.push({ type: TRAIN_DERAILED, reason: path.end });
    }
  }
  return events;
}

/** Put the brakes on: full brake time from now. */
export function applyBrake(train, seconds) {
  train.braking = seconds;
}

/** Engine and car positions in cell coordinates, with headings. */
export function trainCars(train, path, startRow) {
  return CAR_GAPS.map((gap) => {
    const s = train.s - gap;
    const p = pathPoint(path, s, startRow);
    return { x: p.x, y: p.y, heading: pathHeading(path, s, startRow), s };
  });
}
