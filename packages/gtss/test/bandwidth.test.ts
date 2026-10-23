import { describe, expect, it } from "vitest";
import { progressionBand, resolveCorridorSpeeds } from "../src/localStorage/coordination/bandwidth";
import {
  simulateTrajectories,
  type Trajectory,
  type TrajectoryStop,
} from "../src/localStorage/coordination/trajectories";

const stop = (
  distanceM: number,
  offsetS: number,
  greenS: number,
  extra: Partial<TrajectoryStop> = {},
): TrajectoryStop => ({ distanceM, offsetS, greenS, free: false, ...extra });

const band = (stops: TrajectoryStop[], over: Partial<Parameters<typeof progressionBand>[1]> = {}) =>
  progressionBand(stops, {
    cycleS: 100,
    speedMps: 15,
    fromIndex: 0,
    toIndex: stops.length - 1,
    ...over,
  });

describe("speeds for each stretch", () => {
  const raw = [
    { forward: 10, opposite: 12 },
    { forward: null, opposite: 14 },
    { forward: 16, opposite: null },
    { forward: null, opposite: null },
  ];
  const { forward, opposite } = resolveCorridorSpeeds(raw, 13.4);

  it("uses the posted speed where there is one", () => {
    expect(forward[0]).toEqual({ mps: 10, source: "posted" });
    expect(opposite[1]).toEqual({ mps: 14, source: "posted" });
  });

  it("borrows the other direction's speed on the same stretch of road", () => {
    // Forward into stop 1 runs the stretch 0-1; the return into stop 0 runs it too.
    expect(forward[1]).toEqual({ mps: 12, source: "other direction" });
    // The return into stop 2 runs stretch 2-3; forward into stop 3 also has none,
    // so this one falls through to the default.
    expect(opposite[2]).toEqual({ mps: 13.4, source: "default" });
  });

  it("falls back to the default only when neither direction has a speed", () => {
    expect(forward[3]).toEqual({ mps: 13.4, source: "default" });
    expect(opposite[3]).toEqual({ mps: 13.4, source: "default" });
  });

  it("treats zero and negative speeds as missing", () => {
    const r = resolveCorridorSpeeds([{ forward: 0, opposite: -5 }], 9);
    expect(r.forward[0].source).toBe("default");
    expect(r.opposite[0].source).toBe("default");
  });
});

describe("progression bandwidth", () => {
  // 600 m at 15 m/s is 40 s.
  it("is the whole green when the offsets match the travel time", () => {
    expect(band([stop(0, 0, 50), stop(600, 40, 50)])).toMatchObject({ widthS: 50, departS: 0 });
  });

  it("shrinks by however far a downstream green is out of step", () => {
    expect(band([stop(0, 0, 50), stop(600, 50, 50)])?.widthS).toBeCloseTo(40);
    expect(band([stop(0, 0, 50), stop(600, 30, 50)])?.widthS).toBeCloseTo(40);
  });

  it("is zero when no departure passes both on green", () => {
    expect(band([stop(0, 0, 50), stop(600, 90, 30)])?.widthS).toBe(0);
  });

  it("is limited by the shortest green", () => {
    expect(band([stop(0, 0, 50), stop(600, 40, 20)])?.widthS).toBeCloseTo(20);
  });

  it("joins a band that runs across the end of the cycle", () => {
    const b = band([stop(0, 90, 30)]);
    expect(b?.widthS).toBeCloseTo(30);
    expect(b?.departS).toBeCloseTo(90);
  });

  it("finds the widest of several separate windows", () => {
    // Two short greens 50 s apart at the first signal, and one long green downstream.
    const b = band([stop(0, 0, 100), stop(300, 20, 10), stop(600, 40, 100)], { speedMps: 15 });
    expect(b?.widthS).toBeCloseTo(10);
  });

  it("ignores signals that run free", () => {
    const b = band([stop(0, 0, 50), stop(300, 77, 5, { free: true }), stop(600, 40, 50)]);
    expect(b?.widthS).toBeCloseTo(50);
    expect(band([stop(0, 0, 50, { free: true })])).toBeNull();
  });

  it("can be asked for any range of signals, either way round", () => {
    const stops = [stop(0, 0, 50), stop(600, 40, 50), stop(1200, 0, 50)];
    expect(band(stops, { fromIndex: 0, toIndex: 1 })?.widthS).toBeCloseTo(50);
    expect(band(stops, { fromIndex: 1, toIndex: 0 })?.widthS).toBeCloseTo(50);
    // From the second signal (green 40-90), the third is 40 s on with green 0-50,
    // which seen from the second is 60-110: they overlap from 60 to 90.
    expect(band(stops, { fromIndex: 1, toIndex: 2 })?.widthS).toBeCloseTo(30);
  });

  it("uses each stretch's own speed", () => {
    // At 10 m/s the 600 m takes 60 s, so an offset of 60 lines up instead of 40.
    const slow = [stop(0, 0, 50), stop(600, 60, 50, { approachSpeedMps: 10 })];
    expect(band(slow)?.widthS).toBeCloseTo(50);
    expect(band([stop(0, 0, 50), stop(600, 60, 50)])?.widthS).toBeCloseTo(30);
  });

  it("measures the return direction against the opposing greens, travelling the other way", () => {
    // Coming back, the 600 m stop is reached first; its opposing green is 0-50
    // and the first stop's opposing green is 40-90, 40 s later.
    const stops = [
      stop(0, 0, 50, { opposing: { offsetS: 40, greenS: 50 } }),
      stop(600, 40, 50, { opposing: { offsetS: 0, greenS: 50 } }),
    ];
    expect(band(stops, { direction: "opposite" })?.widthS).toBeCloseTo(50);
    // Forward, with the same offsets, still lines up too: 0 then 40.
    expect(band(stops)?.widthS).toBeCloseTo(50);
  });

  it("takes a partial range from the right end when travelling back", () => {
    // Coming back from 1200 m: the pair 1-2 (600 and 1200 m) is reached first.
    const stops = [
      stop(0, 0, 50, { opposing: { offsetS: 0, greenS: 10 } }),
      stop(600, 0, 50, { opposing: { offsetS: 40, greenS: 50 } }),
      stop(1200, 0, 50, { opposing: { offsetS: 0, greenS: 50 } }),
    ];
    const b = band(stops, { direction: "opposite", fromIndex: 1, toIndex: 2 });
    expect(b?.widthS).toBeCloseTo(50);
    expect(b?.path.map((p) => p.distanceM)).toEqual([1200, 600]);
  });

  it("gives the band's path in the corridor's own distances, in travel order", () => {
    const stops = [stop(0, 0, 50), stop(600, 40, 50)];
    expect(band(stops)?.path).toEqual([
      { distanceM: 0, afterS: 0 },
      { distanceM: 600, afterS: 40 },
    ]);
    expect(band(stops, { direction: "opposite" })?.path).toEqual([
      { distanceM: 600, afterS: 0 },
      { distanceM: 0, afterS: 40 },
    ]);
  });

  it("returns nothing without a cycle or stops", () => {
    expect(band([stop(0, 0, 50)], { cycleS: 0 })).toBeNull();
    expect(band([])).toBeNull();
  });
});

describe("vehicles at each stretch's speed", () => {
  const crossing = (tr: Trajectory, x: number) => {
    const p = tr.points;
    for (let i = 1; i < p.length; i++) {
      if (p[i - 1][1] < x && p[i][1] >= x) {
        return (
          p[i - 1][0] + ((x - p[i - 1][1]) * (p[i][0] - p[i - 1][0])) / (p[i][1] - p[i - 1][1])
        );
      }
    }
    return null;
  };

  it("cruise each stretch at its own speed", () => {
    // Always green. 500 m at 10 m/s then 500 m at 20 m/s.
    const stops = [
      stop(0, 0, 100, { approachSpeedMps: 10 }),
      stop(500, 0, 100, { approachSpeedMps: 10 }),
      stop(1000, 0, 100, { approachSpeedMps: 20 }),
    ];
    const lines = simulateTrajectories(stops, {
      cycleS: 100,
      speedMps: 15,
      fromS: 0,
      toS: 600,
      mode: "stop-at-red",
    });
    const tr = lines.find((l) => crossing(l, 0) !== null && crossing(l, 1000) !== null)!;
    const first = (crossing(tr, 500) as number) - (crossing(tr, 0) as number);
    const second = (crossing(tr, 1000) as number) - (crossing(tr, 500) as number);
    expect(first).toBeCloseTo(50, 0);
    // Accelerating from 10 to 20 m/s takes a few seconds, so a little over 25.
    expect(second).toBeGreaterThan(25);
    expect(second).toBeLessThan(29);
  });

  it("draw green-wave lines at each stretch's speed", () => {
    const stops = [stop(0, 0, 100), stop(600, 0, 100, { approachSpeedMps: 10 })];
    const lines = simulateTrajectories(stops, {
      cycleS: 100,
      speedMps: 15,
      fromS: 0,
      toS: 300,
      mode: "green-wave",
    });
    for (const l of lines) expect(l.points[1][0] - l.points[0][0]).toBeCloseTo(60);
  });

  it("use the opposing approach's speed coming back", () => {
    const stops = [
      stop(0, 0, 100, { opposing: { offsetS: 0, greenS: 100, approachSpeedMps: 10 } }),
      stop(600, 0, 100, { opposing: { offsetS: 0, greenS: 100 } }),
    ];
    const lines = simulateTrajectories(stops, {
      cycleS: 100,
      speedMps: 15,
      fromS: 0,
      toS: 300,
      mode: "green-wave",
      direction: "opposite",
    });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.points[1][0] - l.points[0][0]).toBeCloseTo(60);
  });
});
