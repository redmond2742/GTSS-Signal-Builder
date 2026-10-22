import { describe, expect, it } from "vitest";
import {
  approachMetres,
  greenAt,
  simplifyPolyline,
  simulateTrajectories,
  type Trajectory,
  type TrajectoryOptions,
  type TrajectoryStop,
} from "../src/localStorage/coordination/trajectories";

const stop = (
  distanceM: number,
  offsetS: number,
  greenS: number,
  free = false,
): TrajectoryStop => ({ distanceM, offsetS, greenS, free });

const base = (over: Partial<TrajectoryOptions> = {}): TrajectoryOptions => ({
  cycleS: 100,
  speedMps: 15,
  fromS: 0,
  toS: 600,
  mode: "stop-at-red",
  ...over,
});

/** Position at time `t`, by linear interpolation; null outside the recorded span. */
const positionAt = (tr: Trajectory, t: number): number | null => {
  const pts = tr.points;
  if (t < pts[0][0] || t > pts[pts.length - 1][0]) return null;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= t) {
      const [t0, x0] = pts[i - 1];
      const [t1, x1] = pts[i];
      return t1 === t0 ? x1 : x0 + ((x1 - x0) * (t - t0)) / (t1 - t0);
    }
  }
  return null;
};

/** When a trajectory first reaches `x`, by interpolation; null if it never does. */
const crossing = (tr: Trajectory, x: number): number | null => {
  const pts = tr.points;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i - 1][1] < x && pts[i][1] >= x) {
      const [t0, x0] = pts[i - 1];
      const [t1, x1] = pts[i];
      return t0 + ((x - x0) * (t1 - t0)) / (x1 - x0);
    }
  }
  return null;
};

describe("greenAt", () => {
  const s = stop(0, 76, 49); // green 76s..125s, which wraps a 114s cycle to 11s
  it("is green inside the window and red outside", () => {
    expect(greenAt(s, 80, 114)).toBe(true);
    expect(greenAt(s, 60, 114)).toBe(false);
  });
  it("wraps across the cycle boundary", () => {
    expect(greenAt(s, 120, 114)).toBe(true); // 6s into the next cycle
    expect(greenAt(s, 12, 114)).toBe(false);
  });
  it("copes with negative times and offsets", () => {
    expect(greenAt(s, -34, 114)).toBe(true); // -34 ≡ 80
    expect(greenAt(stop(0, -10, 20), 5, 100)).toBe(true); // green from 90 to 110
  });
  it("treats a green as long as the cycle as always green", () => {
    expect(greenAt(stop(0, 0, 500), 37, 100)).toBe(true);
  });
});

describe("stop-at-red", () => {
  // One signal that matters, 500 m in: green 60s..90s of each 100s cycle. The
  // first is green all cycle, so it is only where vehicles enter.
  const one = [stop(0, 0, 100), stop(500, 60, 30)];

  it("never lets a vehicle cross a stop line during red", () => {
    const lines = simulateTrajectories(one, base());
    expect(lines.length).toBeGreaterThan(30);
    for (const tr of lines) {
      for (const x of [500]) {
        const t = crossing(tr, x);
        if (t === null) continue;
        // A vehicle too close to stop comfortably may cross a moment into the red.
        const ok = greenAt(one[1], t, 100) || greenAt(one[1], t - 2.5, 100);
        expect(ok, `crossed ${x} m at ${t.toFixed(1)}s`).toBe(true);
      }
    }
  });

  it("stops the vehicles that arrive on red, and not the ones that arrive on green", () => {
    const lines = simulateTrajectories(one, base());
    expect(lines.some((l) => l.stopped)).toBe(true);
    expect(lines.some((l) => !l.stopped)).toBe(true);
  });

  it("queues vehicles at a realistic spacing behind the front one", () => {
    const lines = simulateTrajectories(one, base());
    const at = 50; // deep in the red: green is 60s..90s, red 90s..160s
    const stoppedNow = lines
      .map((l) => ({ x: positionAt(l, at), later: positionAt(l, at + 2) }))
      .filter(
        (p): p is { x: number; later: number } =>
          p.x !== null && p.later !== null && p.x > 300 && Math.abs(p.later - p.x) < 0.3,
      )
      .map((p) => p.x)
      .sort((a, b) => b - a);

    expect(stoppedNow.length).toBeGreaterThanOrEqual(4);
    // The front vehicle waits just short of the line...
    expect(stoppedNow[0]).toBeLessThan(500);
    expect(stoppedNow[0]).toBeGreaterThan(494);
    // ...and each one behind it is about a vehicle length plus a gap further back.
    for (let i = 1; i < stoppedNow.length; i++) {
      const gap = stoppedNow[i - 1] - stoppedNow[i];
      expect(gap, `gap ${i}`).toBeGreaterThan(5.5);
      expect(gap, `gap ${i}`).toBeLessThan(9);
    }
  });

  it("releases the queue when the light goes green, not before", () => {
    const lines = simulateTrajectories(one, base());
    // Vehicles that were stopped at the line and then crossed it.
    const crossings = lines
      .filter((l) => l.stopped)
      .map((l) => crossing(l, 500))
      .filter((t): t is number => t !== null)
      .map((t) => ((t % 100) + 100) % 100);
    expect(crossings.length).toBeGreaterThan(5);
    for (const t of crossings) {
      expect(t, `crossed at ${t.toFixed(1)}s into the cycle`).toBeGreaterThanOrEqual(60);
      expect(t).toBeLessThan(95); // green ends at 90s; the last few clear on amber
    }
  });

  it("builds a longer queue the longer the red", () => {
    const queueAt = (greenS: number) => {
      const stops = [stop(0, 0, 100), stop(500, 0, greenS)];
      const lines = simulateTrajectories(stops, base());
      // Just before green, when the queue is at its longest.
      const t = 395;
      return lines
        .map((l) => ({ x: positionAt(l, t), later: positionAt(l, t + 1) }))
        .filter(
          (p) =>
            p.x !== null &&
            p.later !== null &&
            p.x > 300 &&
            Math.abs((p.later as number) - (p.x as number)) < 0.3,
        ).length;
    };
    expect(queueAt(30)).toBeGreaterThan(queueAt(80));
  });

  // The point of the whole diagram: offsets that follow the travel time let a
  // platoon through, and offsets that don't stop it.
  it("lets far more vehicles through a progressed corridor than a mistimed one", () => {
    const speed = 14;
    const gap = 400;
    const travel = gap / speed;
    const corridor = (offsetFor: (i: number) => number) =>
      Array.from({ length: 4 }, (_, i) => stop(i * gap, offsetFor(i), 60));
    const throughShare = (stops: TrajectoryStop[]) => {
      const lines = simulateTrajectories(stops, base({ speedMps: speed, toS: 800 }));
      return lines.filter((l) => !l.stopped).length / lines.length;
    };

    const progressed = throughShare(corridor((i) => i * travel));
    // Each green opens 50s later than the platoon needs, hop after hop. (A constant
    // shift on every signal would just move the whole progression, not break it.)
    const mistimed = throughShare(corridor((i) => i * (travel + 50)));

    expect(progressed).toBeGreaterThan(0.4);
    expect(mistimed).toBeLessThan(progressed / 2);
  });

  it("does not stop anyone when the signals are green for the whole cycle", () => {
    const lines = simulateTrajectories(
      [stop(0, 0, 100), stop(500, 0, 100), stop(1000, 0, 100)],
      base(),
    );
    expect(lines.length).toBeGreaterThan(30);
    expect(lines.every((l) => !l.stopped)).toBe(true);
    // And they hold free-flow speed: 1000 m at 15 m/s.
    const tr = lines.find((l) => crossing(l, 0) !== null && crossing(l, 1000) !== null)!;
    expect((crossing(tr, 1000) as number) - (crossing(tr, 0) as number)).toBeCloseTo(1000 / 15, 0);
  });

  it("ignores a signal that runs free", () => {
    const stops = [stop(0, 0, 100), stop(500, 0, 0, true), stop(1000, 0, 100)];
    const lines = simulateTrajectories(stops, base());
    expect(lines.every((l) => !l.stopped)).toBe(true);
  });

  it("only returns points inside the window", () => {
    const lines = simulateTrajectories(one, base({ fromS: 100, toS: 300 }));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      for (const [t] of l.points) {
        expect(t).toBeGreaterThanOrEqual(100);
        expect(t).toBeLessThanOrEqual(300);
      }
    }
  });

  it("is deterministic", () => {
    expect(simulateTrajectories(one, base())).toEqual(simulateTrajectories(one, base()));
  });

  // Compared at identical sample times, so there is no interpolation to blame.
  const closest = (lines: Trajectory[]) => {
    const byTime = new Map<number, number[]>();
    for (const l of lines) {
      for (const [t, x] of l.points) {
        const key = Math.round(t * 100);
        byTime.set(key, [...(byTime.get(key) ?? []), x]);
      }
    }
    let worst = Infinity;
    for (const xs of Array.from(byTime.values())) {
      xs.sort((a, b) => b - a);
      for (let i = 1; i < xs.length; i++) worst = Math.min(worst, xs[i - 1] - xs[i]);
    }
    return worst; // front bumper to front bumper; a vehicle is 5 m long
  };

  it("does not run vehicles through each other", () => {
    expect(closest(simulateTrajectories(one, base()))).toBeGreaterThan(4.8);
  });

  // The default arrival rate would exceed what 20s of green discharges, and the
  // queue would grow without limit until vehicles entered on top of it. The rate
  // is held under capacity, and whatever enters does so at a speed that can stop.
  it("stays collision-free and clears its queue when the green is short", () => {
    const stops = [stop(0, 0, 100), stop(500, 60, 20)];
    const lines = simulateTrajectories(stops, base({ toS: 900 }));
    expect(closest(lines)).toBeGreaterThan(4.8);
    const stuck = lines.filter((l) => {
      const last = l.points[l.points.length - 1];
      return last[0] > 890 && last[1] > 300 && last[1] < 500;
    });
    // Only whoever is waiting out the current red, never a growing backlog.
    expect(stuck.length).toBeLessThan(10);
  });

  // Demand forced well past capacity so the queue backs up to where vehicles
  // enter. They must come in at a speed that can stop, not at full speed.
  it("stays collision-free even when demand is forced past capacity", () => {
    const lines = simulateTrajectories(
      [stop(0, 0, 100), stop(500, 0, 20)],
      base({ headwayS: 2.5, toS: 900 }),
    );
    expect(closest(lines)).toBeGreaterThan(4.8);
  });

  it("offers less traffic to a tighter green", () => {
    const tight = simulateTrajectories([stop(0, 0, 100), stop(500, 0, 10)], base());
    const loose = simulateTrajectories([stop(0, 0, 100), stop(500, 0, 60)], base());
    expect(tight.length).toBeLessThan(loose.length);
  });

  it("discharges a queue at a realistic headway", () => {
    const lines = simulateTrajectories(one, base({ toS: 800 }));
    // Vehicles that stopped, crossing the line in the cycle whose green starts at 460s.
    const times = lines
      .filter((l) => l.stopped)
      .map((l) => crossing(l, 500))
      .filter((t): t is number => t !== null && t >= 460 && t < 560)
      .sort((a, b) => a - b);
    expect(times.length).toBeGreaterThanOrEqual(5);
    const headways = times.slice(1).map((t, i) => t - times[i]);
    const mean = headways.reduce((a, b) => a + b, 0) / headways.length;
    expect(mean).toBeGreaterThan(1.5);
    expect(mean).toBeLessThan(3);
  });

  it("finishes in a sensible time for a full corridor", () => {
    const stops = Array.from({ length: 8 }, (_, i) => stop(i * 250, (i * 17) % 114, 49));
    const started = Date.now();
    const lines = simulateTrajectories(stops, base({ cycleS: 114, toS: 114 * 6 }));
    expect(lines.length).toBeGreaterThan(50);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("green-wave", () => {
  const opts = (over: Partial<TrajectoryOptions> = {}) =>
    base({ mode: "green-wave", toS: 300, ...over });

  // 600 m at 15 m/s is 40 s. Offsets 0 and 40 line the second green up behind the first.
  it("draws a line the whole way when every signal is reached on green", () => {
    const lines = simulateTrajectories([stop(0, 0, 50), stop(600, 40, 50)], opts());
    expect(lines.length).toBeGreaterThan(10);
    expect(lines.every((l) => l.points.length === 2)).toBe(true);
  });

  it("draws nothing between signals a line can't reach on green", () => {
    // Offset 0 again: only departures that hit the first green AND the second green survive.
    const stops = [stop(0, 0, 50), stop(600, 0, 50)];
    const lines = simulateTrajectories(stops, opts());
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      for (const [t, x] of l.points) {
        const s = stops.find((s) => s.distanceM === x)!;
        expect(greenAt(s, t, 100), `point at ${x} m, ${t.toFixed(1)}s`).toBe(true);
      }
    }
    // Far fewer than when the greens line up: most departures hit a red.
    const aligned = simulateTrajectories([stop(0, 0, 50), stop(600, 40, 50)], opts());
    expect(lines.length).toBeLessThan(aligned.length / 2);
  });

  it("breaks a line at a red rather than drawing across it", () => {
    // Middle signal is green only 0s..10s of the cycle; the outer two are always green.
    const stops = [stop(0, 0, 100), stop(300, 0, 10), stop(600, 0, 100)];
    const lines = simulateTrajectories(stops, opts());
    // No line spans from the first signal to the last: the middle one always interrupts.
    const spans = lines.filter(
      (l) => l.points[0][1] === 0 && l.points[l.points.length - 1][1] === 600,
    );
    const through = spans.filter((l) => l.points.length === 3);
    for (const l of through) {
      expect(greenAt(stops[1], l.points[1][0], 100)).toBe(true);
    }
    expect(lines.every((l) => l.points.length >= 2)).toBe(true);
  });

  it("never marks a line as stopped", () => {
    const lines = simulateTrajectories([stop(0, 0, 50), stop(600, 40, 50)], opts());
    expect(lines.every((l) => !l.stopped)).toBe(true);
  });
});

describe("degenerate input", () => {
  it("returns nothing when there is nothing to draw against", () => {
    expect(simulateTrajectories([], base())).toEqual([]);
    expect(simulateTrajectories([stop(0, 0, 50, true), stop(500, 0, 50, true)], base())).toEqual(
      [],
    );
    expect(simulateTrajectories([stop(0, 0, 0), stop(500, 0, 0)], base())).toEqual([]);
  });
  it("returns nothing for options that make no sense", () => {
    const s = [stop(0, 0, 50), stop(500, 0, 50)];
    expect(simulateTrajectories(s, base({ cycleS: 0 }))).toEqual([]);
    expect(simulateTrajectories(s, base({ speedMps: 0 }))).toEqual([]);
    expect(simulateTrajectories(s, base({ fromS: 10, toS: 10 }))).toEqual([]);
  });
});

describe("simplifyPolyline", () => {
  it("collapses collinear points to the two ends", () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ];
    expect(simplifyPolyline(line, 0.1)).toEqual([
      [0, 0],
      [4, 4],
    ]);
  });
  it("keeps a corner", () => {
    const bent: [number, number][] = [
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
    ];
    expect(simplifyPolyline(bent, 0.1)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });
  it("drops wiggles smaller than the tolerance and keeps larger ones", () => {
    const wiggle: [number, number][] = [
      [0, 0],
      [5, 0.2],
      [10, 0],
    ];
    expect(simplifyPolyline(wiggle, 0.5)).toHaveLength(2);
    expect(simplifyPolyline(wiggle, 0.1)).toHaveLength(3);
  });
  it("always keeps both endpoints and leaves short input alone", () => {
    expect(simplifyPolyline([[0, 0]], 1)).toEqual([[0, 0]]);
    expect(
      simplifyPolyline(
        [
          [0, 0],
          [3, 4],
        ],
        1,
      ),
    ).toEqual([
      [0, 0],
      [3, 4],
    ]);
  });
  it("handles a path that returns to its start", () => {
    const loop: [number, number][] = [
      [0, 0],
      [5, 5],
      [0, 0],
    ];
    expect(simplifyPolyline(loop, 0.1)).toHaveLength(3);
  });
});

describe("approachMetres", () => {
  it("has a floor for a short corridor and scales for a long one", () => {
    expect(approachMetres(200)).toBe(90);
    expect(approachMetres(5000)).toBe(300);
  });
});
