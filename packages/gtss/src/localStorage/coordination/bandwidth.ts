import {
  cumulativeTravel,
  greenWindowsOf,
  orientStops,
  type TrajectoryDirection,
  type TrajectoryStop,
} from "./trajectories";

/**
 * Progression bandwidth: the widest window of time in which a vehicle can leave
 * one signal at free-flow speed and reach every signal in a range on green.
 *
 * Seen from the first signal, signal k's green is a window on the clock circle
 * shifted back by the travel time to k. A departure passes every signal on green
 * exactly when it lies inside all of those shifted windows, so the band is their
 * intersection and the bandwidth its widest arc.
 */

export interface ProgressionBand {
  /** Seconds of green that line up through the whole range. 0 if none do. */
  widthS: number;
  /** When, within the cycle, the band leaves the first signal of the range. */
  departS: number;
  /** For drawing: each stop in the range, in travel order, and the travel time to it. */
  path: { distanceM: number; afterS: number }[];
}

export type SpeedSource = "posted" | "other direction" | "default";
export interface ResolvedSpeed {
  mps: number;
  source: SpeedSource;
}

/**
 * Speeds for every stretch of the corridor, in both directions.
 *
 * `raw[i]` holds the posted speeds (m/s) arriving at stop i: `forward` from stop
 * i-1, `opposite` from stop i+1. Where one is missing, the other direction's speed
 * on the SAME stretch of road stands in — a better guess than a default, since it
 * is the same street. Only if both are missing is the default used. Every value
 * says where it came from, so the diagram can say which were guessed.
 */
export function resolveCorridorSpeeds(
  raw: readonly { forward: number | null; opposite: number | null }[],
  defaultMps: number,
): { forward: ResolvedSpeed[]; opposite: ResolvedSpeed[] } {
  const ok = (v: number | null | undefined): v is number => v != null && v > 0;
  const forward = raw.map((r, i): ResolvedSpeed => {
    if (ok(r.forward)) return { mps: r.forward, source: "posted" };
    const sameStretch = i >= 1 ? raw[i - 1].opposite : null;
    if (ok(sameStretch)) return { mps: sameStretch, source: "other direction" };
    return { mps: defaultMps, source: "default" };
  });
  const opposite = raw.map((r, i): ResolvedSpeed => {
    if (ok(r.opposite)) return { mps: r.opposite, source: "posted" };
    const sameStretch = i <= raw.length - 2 ? raw[i + 1].forward : null;
    if (ok(sameStretch)) return { mps: sameStretch, source: "other direction" };
    return { mps: defaultMps, source: "default" };
  });
  return { forward, opposite };
}

type Arc = [number, number];

/** A green window as arcs within [0, cycle): one, or two if it wraps. */
function arcsOf(start: number, length: number, cycle: number): Arc[] {
  if (length >= cycle) return [[0, cycle]];
  const s = ((start % cycle) + cycle) % cycle;
  const e = s + length;
  return e <= cycle
    ? [[s, e]]
    : [
        [s, cycle],
        [0, e - cycle],
      ];
}

/** Arcs merged where they overlap or touch, in order. */
function union(arcs: Arc[]): Arc[] {
  const sorted = [...arcs].sort((x, y) => x[0] - y[0]);
  const out: Arc[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

function intersect(a: Arc[], b: Arc[]): Arc[] {
  const out: Arc[] = [];
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (hi > lo) out.push([lo, hi]);
    }
  }
  return out.sort((x, y) => x[0] - y[0]);
}

/**
 * The band through stops `fromIndex`..`toIndex` (positions in distance order,
 * either way round), for traffic travelling in `direction`. Signals running free,
 * or with no green, don't constrain it. Null if nothing in the range does.
 */
export function progressionBand(
  stops: readonly TrajectoryStop[],
  options: {
    cycleS: number;
    speedMps: number;
    direction?: TrajectoryDirection;
    fromIndex: number;
    toIndex: number;
  },
): ProgressionBand | null {
  const { cycleS, speedMps } = options;
  const direction = options.direction ?? "forward";
  if (!(cycleS > 0) || stops.length === 0) return null;

  const n = stops.length;
  const lo = Math.max(0, Math.min(options.fromIndex, options.toIndex));
  const hi = Math.min(n - 1, Math.max(options.fromIndex, options.toIndex));
  if (lo > hi) return null;

  // Turned round, the range's index order reverses with it.
  const { stops: oriented, toOriginal } = orientStops(stops, direction);
  const [a, b] = direction === "forward" ? [lo, hi] : [n - 1 - hi, n - 1 - lo];
  const range = oriented.slice(a, b + 1);
  const travel = cumulativeTravel(range, speedMps);

  let band: Arc[] = [[0, cycleS]];
  let constrained = false;
  range.forEach((stop, i) => {
    const windows = greenWindowsOf(stop);
    if (stop.free || windows.length === 0) return;
    constrained = true;
    // Traffic gets through in any of the stop's windows, so the band can too.
    const open = union(windows.flatMap((w) => arcsOf(w.offsetS - travel[i], w.greenS, cycleS)));
    band = intersect(band, open);
  });
  if (!constrained) return null;

  const path = range.map((s, i) => ({ distanceM: toOriginal(s.distanceM), afterS: travel[i] }));
  if (band.length === 0) return { widthS: 0, departS: 0, path };

  // An arc ending at the cycle and one starting at 0 are the same band, wrapped.
  const first = band[0];
  const last = band[band.length - 1];
  if (band.length > 1 && first[0] === 0 && last[1] === cycleS) {
    band = [[last[0], cycleS + first[1]], ...band.slice(1, -1)];
  }
  const widest = band.reduce((best, arc) => (arc[1] - arc[0] > best[1] - best[0] ? arc : best));
  return { widthS: widest[1] - widest[0], departS: widest[0] % cycleS, path };
}
