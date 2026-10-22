/**
 * Vehicle trajectories for a time-space diagram.
 *
 * A time-space diagram plots distance against time. A vehicle is a line on it;
 * the question the diagram answers is whether a platoon released by one signal
 * reaches the next on green. Two ways of drawing that:
 *
 * - "stop-at-red": simulate vehicles that obey the signals. They slow for a red,
 *   queue behind whoever is already stopped, and discharge when it goes green.
 *   Lines never pass a signal on red, and the stops and queues are the result.
 * - "green-wave": free-flow lines only, drawn only between consecutive signals
 *   that the line reaches on green. Nothing is drawn across a red.
 *
 * Pure and deterministic: no randomness, so the same inputs always draw the same
 * picture.
 */

/** The parts of a signal the simulation needs. */
export interface TrajectoryStop {
  /** Metres from the first signal. */
  distanceM: number;
  /** Seconds after the system reference when the coordinated green starts. */
  offsetS: number;
  /** Coordinated-phase green, in seconds. */
  greenS: number;
  /** Runs free in this pattern: no cycle to obey. */
  free: boolean;
}

export type TrajectoryMode = "stop-at-red" | "green-wave";

/** One vehicle's path: [seconds, metres] points, in time order. */
export interface Trajectory {
  points: [number, number][];
  /** True if the vehicle came (nearly) to rest at some point. */
  stopped: boolean;
}

export interface TrajectoryOptions {
  cycleS: number;
  /** Free-flow speed, metres per second. */
  speedMps: number;
  /** The window to return, in seconds. The simulation starts earlier to warm up. */
  fromS: number;
  toS: number;
  mode: TrajectoryMode;
  /** Seconds between vehicles arriving at the first signal. Default 6. */
  headwayS?: number;
}

// --- Car following ---------------------------------------------------------
// The Intelligent Driver Model: a vehicle's acceleration is its wish to reach
// free-flow speed, minus a braking term that grows as the gap to whatever is in
// front closes. It produces smooth slowing, queues that form at a standstill
// spacing, and a discharge wave when the front of the queue moves off — which is
// the behaviour a time-space diagram exists to show.

/** Comfortable acceleration, m/s². */
const ACCEL = 1.5;
/** Comfortable braking, m/s². */
const BRAKE = 2;
/** Desired time headway to the vehicle ahead, seconds. */
const TIME_HEADWAY = 1.2;
/** Standstill gap to the vehicle ahead, metres. */
const MIN_GAP = 2;
/** Vehicle length, metres. A stopped queue is one vehicle length plus the gap apart. */
const VEHICLE_LENGTH = 5;
/** Free-road exponent. */
const DELTA = 4;

/**
 * A vehicle that would need to brake harder than this to stop at a red it has
 * just met carries on instead. This is the dilemma zone: braking hard to avoid a
 * line is worse than crossing it a moment after the red.
 */
const COMFORT_STOP_DECEL = 3.5;

/** Simulation step, seconds. */
const STEP = 0.25;
/** Record a point every this many steps (so every second). */
const RECORD_EVERY = 4;
/** At or below this speed a vehicle counts as stopped, m/s. */
const STOPPED_BELOW = 0.5;

/**
 * Beyond this multiple of the wanted gap the leader is too far ahead to matter.
 * The model's braking term never quite reaches zero, so without a cutoff every
 * vehicle in free flow would cruise a percent or two under the speed asked for.
 */
const LONG_RANGE_RATIO = 0.25;

const DEFAULT_HEADWAY_S = 6;
/** Seconds between vehicles leaving a queue, about what a real one manages. */
const DISCHARGE_HEADWAY_S = 2.2;
/**
 * Offer no more than this share of the tightest green's capacity. Demand above it
 * piles up cycle after cycle and the diagram becomes a picture of a queue that
 * never clears, rather than of the signal timing.
 */
const MAX_UTILISATION = 0.7;
/** Free-flow lines for the green-wave mode are this far apart in time. */
const WAVE_SPACING_S = 2;

/**
 * How far upstream of the first signal the diagram needs to show, so a queue at
 * the first signal has somewhere to form. A fraction of the corridor with a
 * floor, because a short corridor still queues the same number of vehicles.
 */
export const approachMetres = (corridorLengthM: number): number =>
  Math.max(90, corridorLengthM * 0.06);

/** Is this signal showing its coordinated green at time `t`? */
export function greenAt(stop: TrajectoryStop, t: number, cycleS: number): boolean {
  if (cycleS <= 0) return true;
  const start = ((stop.offsetS % cycleS) + cycleS) % cycleS;
  const phase = (((t - start) % cycleS) + cycleS) % cycleS;
  return phase < Math.min(stop.greenS, cycleS);
}

interface Vehicle {
  x: number;
  v: number;
  /** Index into the signal list of the next stop line this vehicle has yet to cross. */
  next: number;
  points: [number, number][];
  stopped: boolean;
  /** The line this vehicle last decided about, and whether it decided to stop for it. */
  ruledLine: number;
  obey: boolean;
}

/**
 * The braking half of the IDM for one obstacle `gap` metres ahead, closing at
 * `closing` m/s (positive when approaching). Always <= 0.
 */
function interaction(v: number, gap: number, closing: number): number {
  const wanted =
    MIN_GAP + Math.max(0, v * TIME_HEADWAY + (v * closing) / (2 * Math.sqrt(ACCEL * BRAKE)));
  const ratio = wanted / Math.max(gap, 0.1);
  return ratio < LONG_RANGE_RATIO ? 0 : -ACCEL * ratio * ratio;
}

function simulateStopAtRed(
  signals: readonly TrajectoryStop[],
  lengthM: number,
  o: TrajectoryOptions,
): Trajectory[] {
  const { cycleS, speedMps, fromS, toS } = o;
  const tightestGreen = Math.min(...signals.map((s) => Math.min(s.greenS, cycleS)));
  const sustainable = cycleS / ((MAX_UTILISATION * tightestGreen) / DISCHARGE_HEADWAY_S);
  const headway = o.headwayS ?? Math.max(DEFAULT_HEADWAY_S, sustainable);

  const spawnX = -(approachMetres(lengthM) + 120);
  const exitX = lengthM + 150;
  const lines = signals.map((s) => s.distanceM);

  // Long enough before the window that the corridor is already full of traffic
  // and the first signal already has the queue from the previous red.
  const freeFlowTravel = (exitX - spawnX) / speedMps;
  const start = fromS - (freeFlowTravel + 3 * cycleS);

  const active: Vehicle[] = []; // front of the line first
  const finished: Vehicle[] = [];
  let nextSpawn = start;
  const accel: number[] = [];
  let step = 0;

  for (let t = start; t <= toS; t += STEP, step++) {
    // Spawn at the back of the line, if there is room.
    if (t >= nextSpawn) {
      const last = active[active.length - 1];
      const room = last ? last.x - VEHICLE_LENGTH - spawnX : Infinity;
      if (room > MIN_GAP + 6) {
        // Enter at a speed that can still stop in the room there is, not at full
        // speed into the back of a standing queue.
        const v = Math.min(speedMps, Math.sqrt(2 * BRAKE * (room - MIN_GAP)));
        active.push({
          x: spawnX,
          v,
          next: 0,
          points: [],
          stopped: false,
          ruledLine: -1,
          obey: false,
        });
        nextSpawn += headway;
      }
    }

    // Accelerations from the state at the start of the step.
    accel.length = active.length;
    for (let i = 0; i < active.length; i++) {
      const car = active[i];
      while (car.next < lines.length && car.x > lines[car.next]) car.next++;

      let brake = 0;
      const leader = active[i - 1];
      if (leader) {
        brake = Math.min(
          brake,
          interaction(car.v, leader.x - VEHICLE_LENGTH - car.x, car.v - leader.v),
        );
      }
      if (car.next < lines.length) {
        if (greenAt(signals[car.next], t, cycleS)) {
          car.ruledLine = -1;
        } else {
          const gap = lines[car.next] - car.x;
          // Decide once per red. Re-deciding every step would let a vehicle that is
          // braking for a line change its mind mid-stop and run it.
          if (car.ruledLine !== car.next) {
            car.ruledLine = car.next;
            car.obey = (car.v * car.v) / (2 * Math.max(gap, 0.01)) <= COMFORT_STOP_DECEL;
          }
          if (car.obey) brake = Math.min(brake, interaction(car.v, gap, car.v));
        }
      }
      const free = ACCEL * (1 - Math.pow(car.v / speedMps, DELTA));
      accel[i] = Math.max(-9, Math.min(ACCEL, free + brake));
    }

    // Advance.
    for (let i = 0; i < active.length; i++) {
      const car = active[i];
      const a = accel[i];
      const vNew = car.v + a * STEP;
      if (vNew < 0) {
        car.x += (car.v * car.v) / (2 * -a);
        car.v = 0;
      } else {
        car.x += car.v * STEP + 0.5 * a * STEP * STEP;
        car.v = vNew;
      }
      if (car.v < STOPPED_BELOW) car.stopped = true;
    }

    // Record once a second, inside the window only.
    if (step % RECORD_EVERY === 0 && t >= fromS) {
      for (const car of active) car.points.push([t, car.x]);
    }

    // Retire whoever has left the corridor.
    while (active.length > 0 && active[0].x > exitX) {
      finished.push(active.shift() as Vehicle);
    }
  }

  return [...finished, ...active]
    .filter((car) => car.points.length >= 2)
    .map((car) => ({ points: car.points, stopped: car.stopped }));
}

function simulateGreenWave(stops: readonly TrajectoryStop[], o: TrajectoryOptions): Trajectory[] {
  const { cycleS, speedMps, fromS, toS } = o;
  const ordered = [...stops].sort((a, b) => a.distanceM - b.distanceM);
  const origin = ordered[0].distanceM;
  const travel = (ordered[ordered.length - 1].distanceM - origin) / speedMps;

  const out: Trajectory[] = [];
  for (let depart = fromS - travel; depart <= toS; depart += WAVE_SPACING_S) {
    let chain: [number, number][] = [];
    const flush = () => {
      const inWindow = chain.some(([t]) => t >= fromS && t <= toS);
      if (chain.length >= 2 && inWindow) out.push({ points: chain, stopped: false });
      chain = [];
    };
    for (const stop of ordered) {
      const arrives = depart + (stop.distanceM - origin) / speedMps;
      // A signal with no cycle to obey doesn't stop the line either.
      const passes = stop.free || stop.greenS <= 0 || greenAt(stop, arrives, cycleS);
      if (passes) chain.push([arrives, stop.distanceM]);
      else flush();
    }
    flush();
  }
  return out;
}

/**
 * Vehicle paths for the corridor, as seconds and metres.
 *
 * Signals that run free, or have no coordinated green, are treated as not there:
 * the files carry no timing for them, so there is nothing to obey.
 */
export function simulateTrajectories(
  stops: readonly TrajectoryStop[],
  options: TrajectoryOptions,
): Trajectory[] {
  const { cycleS, speedMps, fromS, toS } = options;
  if (!(cycleS > 0) || !(speedMps > 0) || !(toS > fromS) || stops.length === 0) return [];

  const signals = stops
    .filter((s) => !s.free && s.greenS > 0)
    .sort((a, b) => a.distanceM - b.distanceM);
  if (signals.length === 0) return [];

  const lengthM = Math.max(...stops.map((s) => s.distanceM));
  return options.mode === "green-wave"
    ? simulateGreenWave(stops, options)
    : simulateStopAtRed(signals, lengthM, options);
}

/**
 * Ramer–Douglas–Peucker: drop points that sit within `tolerance` of the line
 * between their neighbours. A vehicle cruising for two minutes is hundreds of
 * collinear samples, and drawing every one is wasted work.
 *
 * Run it in the units you draw in (pixels), so the tolerance means what it says.
 */
export function simplifyPolyline(
  points: readonly [number, number][],
  tolerance: number,
): [number, number][] {
  if (points.length <= 2) return points.map((p) => [p[0], p[1]]);

  const last = points.length - 1;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[last] = 1;

  const stack: [number, number][] = [[0, last]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop() as [number, number];
    const [ax, ay] = points[lo];
    const [bx, by] = points[hi];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);

    let farthest = -1;
    let worst = 0;
    for (let i = lo + 1; i < hi; i++) {
      const [px, py] = points[i];
      const d =
        length === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * (px - ax) - dx * (py - ay)) / length;
      if (d > worst) {
        worst = d;
        farthest = i;
      }
    }
    if (farthest >= 0 && worst > tolerance) {
      keep[farthest] = 1;
      stack.push([lo, farthest], [farthest, hi]);
    }
  }
  return points.filter((_, i) => keep[i] === 1).map((p) => [p[0], p[1]]);
}
