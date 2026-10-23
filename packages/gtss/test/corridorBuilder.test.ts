import { beforeEach, describe, expect, it } from "vitest";
import {
  applyBuild,
  orderAlongBearing,
  planAddSignal,
  planCorridor,
  splitFromTimings,
  standardPhaseSequence,
} from "../src/localStorage/coordination/corridorBuilder";
import {
  applyCorridorRemoval,
  removeCorridorSignal,
  sortBySequence,
} from "../src/localStorage/coordination/corridor-order";
import { readAllCoordination } from "../src/localStorage/coordination/entities";
import { alignDaySchedule } from "../src/localStorage/coordination/schedule";
import {
  approachSpeedFor,
  baseStreetName,
  directionBearing,
  intersectionStreetNames,
  leftPhaseFor,
  nemaSameDirectionLeft,
  reverseDirection,
  throughPhaseFor,
} from "../src/localStorage/coordination/gtssLink";
import { opposingWindow, phaseWindow } from "../src/localStorage/coordination/opposingPhase";
import { emptyCoordinationRows, type CorridorSignal } from "../src/localStorage/coordination/rows";
import { validateCoordination } from "../src/localStorage/coordination/validate";
import { setStorageReadOnly } from "../src/localStorage/write-guard";
import {
  approach,
  fourLeg,
  mainStreet,
  phase,
  signal,
  timing,
} from "./fixtures/gtss-intersections";

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } satisfies Storage,
  });
});

describe("directions", () => {
  it("reads the usual ways of writing a direction as the bearing traffic travels", () => {
    expect(["NB", "n", "North", "northbound"].map(directionBearing)).toEqual([0, 0, 0, 0]);
    expect(["SB", "EB", "WB", "NEB", "south-bound"].map(directionBearing)).toEqual([
      180, 90, 270, 45, 180,
    ]);
    expect(directionBearing("sideways")).toBeNull();
    expect(directionBearing(null)).toBeNull();
  });
  it("names the return direction", () => {
    expect(reverseDirection("SB")).toBe("NB");
    expect(reverseDirection("EB")).toBe("WB");
    expect(reverseDirection("??")).toBeNull();
  });
});

describe("finding phases in GTSS", () => {
  const gtss = fourLeg("A");

  it("picks the through phase on the approach heading the travel direction", () => {
    expect(throughPhaseFor("A", 180, gtss)).toBe(6);
    expect(throughPhaseFor("A", 0, gtss)).toBe(2);
    expect(throughPhaseFor("A", 90, gtss)).toBe(4);
    expect(throughPhaseFor("A", 200, gtss)).toBe(6); // a bend in the road is still southbound
  });

  it("says nothing rather than guess when no approach heads that way", () => {
    const noBearings = {
      ...gtss,
      approaches: gtss.approaches.map((a) => ({ ...a, compassBearing: null })),
    };
    expect(throughPhaseFor("A", 180, noBearings)).toBeNull();
    expect(throughPhaseFor("NOPE", 180, gtss)).toBeNull();
  });

  it("prefers a plain through over a shared through-right on the same approach", () => {
    const shared = {
      approaches: [approach("X", 1, "Main St SB", 180, 35)],
      phases: [phase("X", 6, "Through-Right", "X-1"), phase("X", 2, "Through", "X-1")],
    };
    expect(throughPhaseFor("X", 180, shared)).toBe(2);
  });

  it("finds the left turn from the same approach as a through phase", () => {
    expect(leftPhaseFor("A", 6, gtss)).toBe(1);
    expect(leftPhaseFor("A", 2, gtss)).toBe(5);
    expect(leftPhaseFor("A", 4, gtss)).toBe(7);
  });

  it("has no left turn when the approach has none, or phases aren't linked to approaches", () => {
    const noLefts = { ...gtss, phases: gtss.phases.filter((p) => p.movementType !== "Left Turn") };
    expect(leftPhaseFor("A", 6, noLefts)).toBeNull();
    const unlinked = { ...gtss, phases: gtss.phases.map((p) => ({ ...p, approachId: null })) };
    expect(leftPhaseFor("A", 6, unlinked)).toBeNull();
  });

  it("falls back on standard numbering for the left that runs with a through", () => {
    expect([2, 4, 6, 8].map(nemaSameDirectionLeft)).toEqual([5, 7, 1, 3]);
    expect([1, 3, 9].map(nemaSameDirectionLeft)).toEqual([null, null, null]);
  });

  it("reads the posted speed of the approach a phase serves", () => {
    expect(approachSpeedFor("A", 2, gtss)).toBe(40);
    expect(approachSpeedFor("A", 6, gtss)).toBe(35);
    expect(approachSpeedFor("A", 99, gtss)).toBeNull();
    const noSpeed = {
      ...gtss,
      approaches: gtss.approaches.map((a) => ({ ...a, postedSpeed: null })),
    };
    expect(approachSpeedFor("A", 2, noSpeed)).toBeNull();
  });
});

describe("standard ring-barrier and splits", () => {
  it("lays out all eight phases in two rings either side of the barrier", () => {
    const rows = standardPhaseSequence("A", [1, 2, 3, 4, 5, 6, 7, 8]);
    const ring = (r: number) =>
      rows.filter((x) => x.ring === r).map((x) => `${x.phaseId}${x.barrierId}${x.position}`);
    expect(ring(1)).toEqual(["1A1", "2A2", "3B3", "4B4"]);
    expect(ring(2)).toEqual(["5A1", "6A2", "7B3", "8B4"]);
    expect(rows.every((r) => r.sequenceId === "SEQ-01" && r.signalId === "A")).toBe(true);
  });

  it("leaves out phases the signal doesn't have, and anything outside 1-8", () => {
    const rows = standardPhaseSequence("A", [2, 4, 6, 8, 12]);
    expect(rows.map((r) => `${r.ring}:${r.phaseId}${r.barrierId}${r.position}`)).toEqual([
      "1:2A1",
      "1:4B2",
      "2:6A1",
      "2:8B2",
    ]);
  });

  it("starts a split at max green plus clearance", () => {
    expect(splitFromTimings(timing("A", 2, 40, 4, 1.5))).toBe(46); // 45.5 rounds up
    expect(splitFromTimings(timing("A", 2, null))).toBeNull();
    expect(splitFromTimings(undefined)).toBeNull();
  });
});

describe("ordering signals along a direction", () => {
  const sigs = [signal("MID", 34.1464), signal("NORTH", 34.15), signal("SOUTH", 34.1428)];
  const ids = (b: number) => orderAlongBearing(sigs, b).map((s) => s.signalId);

  it("puts them in the order traffic reaches them", () => {
    expect(ids(180)).toEqual(["NORTH", "MID", "SOUTH"]);
    expect(ids(0)).toEqual(["SOUTH", "MID", "NORTH"]);
  });

  it("orders east-west by longitude", () => {
    const row = [signal("E", 34.1, -118.1), signal("W", 34.1, -118.2)];
    expect(orderAlongBearing(row, 90).map((s) => s.signalId)).toEqual(["W", "E"]);
  });

  it("puts signals with no coordinates last, in the order given", () => {
    const withMissing = [{ signalId: "X", latitude: null, longitude: null }, ...sigs];
    expect(orderAlongBearing(withMissing, 180).map((s) => s.signalId)).toEqual([
      "NORTH",
      "MID",
      "SOUTH",
      "X",
    ]);
  });
});

describe("planning a new corridor", () => {
  const gtss = mainStreet();
  const plan = (over: Partial<Parameters<typeof planCorridor>[0]> = {}) =>
    planCorridor(
      {
        corridorId: "MAIN-SB",
        name: "Main St southbound",
        direction: "SB",
        signalIds: ["A", "B", "C"],
        pattern: { patternId: "MAIN-SB-P01", patternNumber: 1, cycleS: 120 },
        ...over,
      },
      gtss,
      emptyCoordinationRows(),
    );

  it("builds the corridor, its signals in order, and a starter pattern", () => {
    const { rows, error } = plan();
    expect(error).toBeNull();
    expect(rows.corridors).toEqual([
      {
        corridorId: "MAIN-SB",
        name: "Main St southbound",
        description: null,
        primaryDirection: "SB",
      },
    ]);
    expect(rows.corridorSignals?.map((c) => `${c.sequence}:${c.signalId}:${c.direction}`)).toEqual([
      "1:A:SB",
      "2:B:SB",
      "3:C:SB",
    ]);
    expect(rows.patterns).toEqual([
      expect.objectContaining({
        patternId: "MAIN-SB-P01",
        corridorId: "MAIN-SB",
        cycleLengthS: 120,
        // What offsets are measured to, not a signal.
        referencePoint: "BegGRN",
      }),
    ]);
  });

  it("coordinates each signal on its southbound through phase, at offset 0", () => {
    const { rows } = plan();
    expect(
      rows.patternSignals?.map((p) => `${p.signalId}:${p.coordinatedPhase}:${p.offsetS}`),
    ).toEqual(["A:6:0", "B:6:0", "C:6:0"]);
    // And names the sequence it builds, so the diagrams know which one to read.
    expect(rows.patternSignals?.every((p) => p.notes?.includes("seq 1"))).toBe(true);
  });

  it("builds each signal's ring-barrier sequence and splits from its GTSS timings", () => {
    const { rows } = plan();
    expect(rows.phaseSequence?.filter((r) => r.signalId === "A")).toHaveLength(8);
    const splitsA = rows.splits?.filter((s) => s.signalId === "A") ?? [];
    expect(splitsA.find((s) => s.phaseId === 6)?.splitS).toBe(45); // 40 + 4 + 1
    expect(splitsA.find((s) => s.phaseId === 4)?.splitS).toBe(30);
    expect(splitsA).toHaveLength(8); // vehicle phases only: the pedestrian phase has no split
  });

  it("produces data the time-space diagram can read end to end", () => {
    const { rows } = plan();
    const opposing = opposingWindow({
      patternId: "MAIN-SB-P01",
      signalId: "B",
      coordinatedPhase: 6,
      offsetS: 0,
      greenS: 45,
      patternSignals: rows.patternSignals ?? [],
      phaseSequence: rows.phaseSequence ?? [],
      splits: rows.splits ?? [],
    });
    // Phase 2 opposes 6; both follow a 15s left (1 and 5), so they start together.
    expect(opposing).toEqual({ offsetS: 0, greenS: 45, basis: "ring-barrier", partnerPhase: 2 });
  });

  it("says when a signal has no through phase that way, and leaves it running free", () => {
    const noSouth = {
      ...gtss,
      phases: gtss.phases.filter((p) => !(p.signalId === "B" && p.phase === 6)),
    };
    const result = planCorridor(
      {
        corridorId: "X",
        direction: "SB",
        signalIds: ["A", "B"],
        pattern: { patternId: "X-P1", patternNumber: 1, cycleS: 100 },
      },
      noSouth,
      emptyCoordinationRows(),
    );
    expect(
      result.rows.patternSignals?.find((p) => p.signalId === "B")?.coordinatedPhase,
    ).toBeNull();
    expect(result.notes.some((n) => n.startsWith("B: no through phase"))).toBe(true);
  });

  it("says which splits it couldn't fill in", () => {
    const noMax = {
      ...gtss,
      basicTimings: gtss.basicTimings.filter((t) => !(t.signalId === "C" && t.phase === 3)),
    };
    const result = planCorridor(
      {
        corridorId: "X",
        direction: "SB",
        signalIds: ["C"],
        pattern: { patternId: "X-P1", patternNumber: 1, cycleS: 100 },
      },
      noMax,
      emptyCoordinationRows(),
    );
    expect(result.notes.some((n) => n.startsWith("C: no max green for phase 3"))).toBe(true);
    expect(result.rows.splits?.some((s) => s.phaseId === 3)).toBe(false);
  });

  it("can build just the corridor, with no pattern", () => {
    const { rows } = plan({ pattern: null });
    expect(rows.patterns).toEqual([]);
    expect(rows.patternSignals).toEqual([]);
    expect(rows.splits).toEqual([]);
    expect(rows.phaseSequence?.length).toBeGreaterThan(0); // sequence is per signal, not per pattern
  });

  it("refuses what it can't build, and says why", () => {
    const existing = {
      ...emptyCoordinationRows(),
      corridors: [{ corridorId: "MAIN-SB", name: null, description: null, primaryDirection: "SB" }],
    };
    expect(
      planCorridor({ corridorId: "MAIN-SB", direction: "SB", signalIds: ["A"] }, gtss, existing)
        .error,
    ).toMatch(/already a corridor/);
    expect(plan({ corridorId: "  " }).error).toMatch(/Give the corridor an ID/);
    expect(plan({ direction: "sideways" }).error).toMatch(/isn't a direction/);
    expect(plan({ signalIds: [] }).error).toMatch(/at least one signal/);
    expect(plan({ signalIds: ["A", "ZZZ"] }).error).toMatch(/ZZZ/);
    expect(plan({ pattern: { patternId: "P", patternNumber: 1, cycleS: 0 } }).error).toMatch(
      /cycle length/,
    );
  });

  it("lists each signal once even if it was picked twice", () => {
    expect(plan({ signalIds: ["A", "B", "A"] }).rows.corridorSignals).toHaveLength(2);
  });

  it("doesn't rebuild a ring-barrier sequence a signal already has", () => {
    const existing = {
      ...emptyCoordinationRows(),
      phaseSequence: standardPhaseSequence("A", [2, 6], "SEQ-07"),
    };
    const { rows } = planCorridor(
      {
        corridorId: "X",
        direction: "SB",
        signalIds: ["A"],
        pattern: { patternId: "X-P1", patternNumber: 1, cycleS: 100 },
      },
      gtss,
      existing,
    );
    expect(rows.phaseSequence).toEqual([]);
    // It didn't build SEQ-01, so it mustn't claim "seq 1".
    expect(rows.patternSignals?.[0].notes).not.toContain("seq 1");
  });
});

describe("building a corridor by hand", () => {
  const gtss = mainStreet();
  const base = {
    corridorId: "MAIN-SB",
    name: "Main St southbound",
    direction: "SB",
    signalIds: ["A", "B", "C"],
  };
  const pattern = { patternId: "MAIN-SB-P01", patternNumber: 1, cycleS: 120 };
  const ringTotals = (
    splits: { signalId: string; phaseId: number | null; splitS: number | null }[],
    signalId: string,
  ) => {
    const own = splits.filter((s) => s.signalId === signalId);
    const sum = (ids: number[]) =>
      own.filter((s) => ids.includes(s.phaseId ?? 0)).reduce((n, s) => n + (s.splitS ?? 0), 0);
    return [sum([1, 2, 3, 4]), sum([5, 6, 7, 8])];
  };

  it("follows a bend: a signal's own direction picks its phase and is written to the corridor", () => {
    const { rows, error } = planCorridor(
      { ...base, pattern, perSignal: { C: { direction: "eb" } } },
      gtss,
      emptyCoordinationRows(),
    );
    expect(error).toBeNull();
    expect(rows.corridorSignals?.map((c) => `${c.signalId}:${c.direction}`)).toEqual([
      "A:SB",
      "B:SB",
      "C:EB",
    ]);
    expect(rows.patternSignals?.map((p) => `${p.signalId}:${p.coordinatedPhase}`)).toEqual([
      "A:6",
      "B:6",
      "C:4",
    ]);
  });

  it("uses a chosen phase over the one the direction finds, and blank when told to", () => {
    const { rows, notes } = planCorridor(
      {
        ...base,
        pattern,
        perSignal: { A: { coordinatedPhase: 2 }, B: { coordinatedPhase: null } },
      },
      gtss,
      emptyCoordinationRows(),
    );
    expect(rows.patternSignals?.map((p) => `${p.signalId}:${p.coordinatedPhase}`)).toEqual([
      "A:2",
      "B:null",
      "C:6",
    ]);
    // Blank was asked for, so it isn't reported as something that went wrong.
    expect(notes.some((n) => n.startsWith("B:"))).toBe(false);
  });

  it("refuses a signal direction it can't read, and a cycle of nothing", () => {
    const empty = emptyCoordinationRows();
    expect(
      planCorridor({ ...base, perSignal: { B: { direction: "up" } } }, gtss, empty).error,
    ).toMatch(/B: "up" isn't a direction/);
    expect(
      planCorridor({ ...base, pattern, perSignal: { B: { cycleS: 0 } } }, gtss, empty).error,
    ).toMatch(/B: a cycle/);
  });

  it("fits the splits from timings to the cycle, both rings meeting at the barrier", () => {
    const { rows } = planCorridor(
      { ...base, pattern: { ...pattern, fitSplits: true } },
      gtss,
      emptyCoordinationRows(),
    );
    for (const id of ["A", "B", "C"]) expect(ringTotals(rows.splits ?? [], id)).toEqual([120, 120]);
    // In proportion: the 45s throughs stay three times the 15s lefts.
    const a = rows.splits?.filter((s) => s.signalId === "A") ?? [];
    const of = (p: number) => a.find((s) => s.phaseId === p)?.splitS ?? 0;
    expect(of(6) + of(5)).toBe(of(2) + of(1)); // same barrier group, both rings
    expect(Math.abs(of(6) - 3 * of(1))).toBeLessThanOrEqual(1);
    const issues = validateCoordination({ ...emptyCoordinationRows(), ...rows });
    expect(issues.filter((i) => i.scope === "splits")).toEqual([]);
  });

  it("leaves the timings' splits as they are unless asked to fit them", () => {
    const { rows } = planCorridor({ ...base, pattern }, gtss, emptyCoordinationRows());
    expect(ringTotals(rows.splits ?? [], "A")).toEqual([105, 105]);
  });

  it("fits a signal to its own cycle, and says the files will show it as a mismatch", () => {
    const { rows, notes } = planCorridor(
      { ...base, pattern: { ...pattern, fitSplits: true }, perSignal: { B: { cycleS: 90 } } },
      gtss,
      emptyCoordinationRows(),
    );
    expect(ringTotals(rows.splits ?? [], "A")).toEqual([120, 120]);
    expect(ringTotals(rows.splits ?? [], "B")).toEqual([90, 90]);
    expect(notes.some((n) => n.startsWith("B runs a 90s cycle in MAIN-SB-P01"))).toBe(true);
  });

  it("measures offsets to begin of green by default, or to begin of yellow if chosen", () => {
    const green = planCorridor({ ...base, pattern }, gtss, emptyCoordinationRows()).rows;
    expect(green.patterns?.[0].referencePoint).toBe("BegGRN");
    expect(green.patternSignals?.every((p) => p.referencePoint === "BegGRN")).toBe(true);
    const yellow = planCorridor(
      { ...base, pattern: { ...pattern, offsetReference: "BegYEL" } },
      gtss,
      emptyCoordinationRows(),
    ).rows;
    expect(yellow.patterns?.[0].referencePoint).toBe("BegYEL");
    expect(yellow.patternSignals?.every((p) => p.referencePoint === "BegYEL")).toBe(true);
  });

  it("schedules the pattern in the picked times and runs free the rest of the week", () => {
    const { rows, error } = planCorridor(
      {
        ...base,
        pattern: { ...pattern, fitSplits: true },
        schedule: {
          timezone: "America/Los_Angeles",
          freeRest: true,
          blocks: [
            { dayType: "WEEKDAY", startMin: 360, endMin: 600 },
            { dayType: "WEEKDAY", startMin: 900, endMin: 1140 },
          ],
        },
      },
      gtss,
      emptyCoordinationRows(),
    );
    expect(error).toBeNull();
    expect(rows.coordination).toEqual([
      expect.objectContaining({ coordinationId: "MAIN-SB-COORD", timezone: "America/Los_Angeles" }),
    ]);
    expect(
      rows.patterns?.map((p) => `${p.patternId}:${p.patternNumber}:${p.cycleLengthS}`),
    ).toEqual(["MAIN-SB-P01:1:120", "MAIN-SB-FREE:254:0"]);
    // The free pattern has no offsets or splits to give.
    expect(rows.patternSignals?.some((p) => p.patternId === "MAIN-SB-FREE")).toBe(false);
    expect(
      rows.schedule
        ?.filter((r) => r.dayType === "WEEKDAY")
        .map((r) => `${r.startTime}-${r.endTime} ${r.patternId}`),
    ).toEqual([
      "00:00:00-06:00:00 MAIN-SB-FREE",
      "06:00:00-10:00:00 MAIN-SB-P01",
      "10:00:00-15:00:00 MAIN-SB-FREE",
      "15:00:00-19:00:00 MAIN-SB-P01",
      "19:00:00-24:00:00 MAIN-SB-FREE",
    ]);
    // Everything it built is clean: no gaps, no orphans, splits sum to the cycle.
    const issues = validateCoordination(
      { ...emptyCoordinationRows(), ...rows },
      new Set(["A", "B", "C"]),
    );
    expect(issues).toEqual([]);
  });

  it("writes the built schedule so the calendar reads it, without naming a reference signal", () => {
    const { rows } = planCorridor(
      {
        ...base,
        pattern,
        schedule: { freeRest: true, blocks: [{ dayType: "WEEKDAY", startMin: 420, endMin: 540 }] },
      },
      gtss,
      emptyCoordinationRows(),
    );
    applyBuild(rows);
    const day = alignDaySchedule(readAllCoordination(), "MAIN-SB", "WEEKDAY");
    expect(day.segments.map((s) => s.pattern?.patternId)).toEqual([
      "MAIN-SB-FREE",
      "MAIN-SB-P01",
      "MAIN-SB-FREE",
    ]);
    expect(day.segments[1].states.get("B")).toMatchObject({ kind: "coordinated", phase: 6 });
    // "BegGRN" is an offset reference, not an intersection.
    expect(day.referenceSignalId).toBeNull();
  });

  it("refuses a schedule it can't build, and says why", () => {
    const empty = emptyCoordinationRows();
    const schedule = { freeRest: true, blocks: [] };
    expect(planCorridor({ ...base, schedule }, gtss, empty).error).toMatch(
      /needs a starter pattern/,
    );
    expect(
      planCorridor({ ...base, pattern, schedule }, gtss, {
        ...empty,
        coordination: [
          {
            coordinationId: "MAIN-SB-COORD",
            name: null,
            referenceClock: null,
            timezone: null,
            description: null,
          },
        ],
      }).error,
    ).toMatch(/already a coordination plan called MAIN-SB-COORD/);
    expect(
      planCorridor(
        { ...base, pattern: { ...pattern, patternId: "MAIN-SB-FREE" }, schedule },
        gtss,
        empty,
      ).error,
    ).toMatch(/free pattern's ID/);
    expect(
      planCorridor({ ...base, pattern, schedule }, gtss, {
        ...empty,
        schedule: [
          {
            scheduleId: "MAIN-SB-S01",
            coordinationId: null,
            dayType: "WEEKDAY",
            startTime: "00:00",
            endTime: "24:00",
            patternId: null,
            priority: 1,
          },
        ],
      }).error,
    ).toMatch(/MAIN-SB-S01 already exists/);
  });

  it("says when no times were picked, so the pattern never runs", () => {
    const { notes } = planCorridor(
      { ...base, pattern, schedule: { freeRest: true, blocks: [] } },
      gtss,
      emptyCoordinationRows(),
    );
    expect(notes).toContain("No times were picked, so MAIN-SB-P01 isn't scheduled to run.");
  });
});

describe("adding and removing corridor signals", () => {
  const gtss = mainStreet();
  const build = () => {
    const { rows } = planCorridor(
      {
        corridorId: "MAIN-SB",
        direction: "SB",
        signalIds: ["A", "B"],
        pattern: { patternId: "P1", patternNumber: 1, cycleS: 100 },
      },
      gtss,
      emptyCoordinationRows(),
    );
    applyBuild(rows);
  };
  const members = () =>
    sortBySequence(
      readAllCoordination().corridorSignals.filter((c) => c.corridorId === "MAIN-SB"),
    ).map((c) => `${c.sequence}:${c.signalId}`);

  it("adds a signal to the end, with rows for every one of the corridor's patterns", () => {
    build();
    const result = planAddSignal(readAllCoordination(), "MAIN-SB", "C", gtss);
    expect(result.error).toBeNull();
    applyBuild(result.rows);
    expect(members()).toEqual(["1:A", "2:B", "3:C"]);
    const ps = readAllCoordination().patternSignals.find((p) => p.signalId === "C");
    expect(ps).toMatchObject({ patternId: "P1", coordinatedPhase: 6, offsetS: 0 });
    expect(readAllCoordination().splits.some((s) => s.signalId === "C")).toBe(true);
  });

  it("reads a new signal's offset the same way as the pattern's others say theirs is", () => {
    // Converted files name the reference intersection in reference_point and
    // the offset reference in the notes.
    applyBuild({
      corridors: [{ corridorId: "CAL", name: null, description: null, primaryDirection: "SB" }],
      corridorSignals: [{ corridorId: "CAL", sequence: 1, signalId: "A", direction: "SB" }],
      patterns: [
        {
          patternId: "CAL-P1",
          patternNumber: 1,
          corridorId: "CAL",
          cycleLengthS: 100,
          referencePoint: "A",
          description: null,
        },
      ],
      patternSignals: [
        {
          patternId: "CAL-P1",
          signalId: "A",
          offsetS: 0,
          coordinatedPhase: 6,
          referencePoint: "A",
          notes: "Reference intersection; seq 1; offset ref BegYEL",
        },
      ],
    });
    const result = planAddSignal(readAllCoordination(), "CAL", "B", gtss);
    const ps = result.rows.patternSignals?.[0];
    expect(ps?.referencePoint).toBe("A");
    expect(ps?.notes).toContain("offset ref BegYEL");
  });

  it("adds nothing for the corridor's free pattern, which has no offsets or splits", () => {
    build();
    const free = {
      patternId: "FREE",
      patternNumber: 254,
      corridorId: "MAIN-SB",
      cycleLengthS: 0,
      referencePoint: "A",
      description: null,
    };
    const rows = { ...readAllCoordination(), patterns: [...readAllCoordination().patterns, free] };
    const result = planAddSignal(rows, "MAIN-SB", "C", gtss);
    expect(result.rows.patternSignals?.map((p) => p.patternId)).toEqual(["P1"]);
    expect(result.rows.splits?.every((s) => s.patternId === "P1")).toBe(true);
  });

  it("refuses a signal that is already in it, or isn't a GTSS signal", () => {
    build();
    expect(planAddSignal(readAllCoordination(), "MAIN-SB", "A", gtss).error).toMatch(/already in/);
    expect(planAddSignal(readAllCoordination(), "MAIN-SB", "ZZZ", gtss).error).toMatch(
      /not in the GTSS/,
    );
    expect(planAddSignal(readAllCoordination(), "NOPE", "C", gtss).error).toMatch(/no corridor/);
  });

  it("removes a signal and renumbers, leaving other corridors alone", () => {
    const rows: CorridorSignal[] = [
      { corridorId: "K", sequence: 1, signalId: "k1", direction: null },
      { corridorId: "C", sequence: 1, signalId: "A", direction: null },
      { corridorId: "C", sequence: 2, signalId: "B", direction: null },
      { corridorId: "C", sequence: 3, signalId: "C", direction: null },
    ];
    const next = applyCorridorRemoval(rows, "C", 1)!;
    expect(next.map((r) => `${r.corridorId}${r.sequence}:${r.signalId}`)).toEqual([
      "K1:k1",
      "C1:A",
      "C2:C",
    ]);
    expect(applyCorridorRemoval(rows, "C", 3)).toBeNull();
    expect(applyCorridorRemoval(rows, "C", -1)).toBeNull();
  });

  // Removal is membership only, so a mis-click costs nothing: adding the signal
  // back finds its offset and splits still there.
  it("keeps a removed signal's offsets, so adding it back restores them", () => {
    build();
    const ps = readAllCoordination().patternSignals.find((p) => p.signalId === "B")!;
    // Give B a tuned offset, then remove it from the corridor.
    const all = readAllCoordination().patternSignals.map((p) =>
      p.signalId === "B" ? { ...p, offsetS: 37 } : p,
    );
    localStorage.setItem("gtss_pattern_signals", JSON.stringify(all));
    expect(removeCorridorSignal("MAIN-SB", 1)).toBe(true);
    expect(members()).toEqual(["1:A"]);
    expect(readAllCoordination().patternSignals.find((p) => p.signalId === "B")?.offsetS).toBe(37);

    // Validation points at the row left behind…
    const warn = () =>
      validateCoordination(readAllCoordination()).filter((i) =>
        i.id.startsWith("ps-outside-corridor"),
      );
    expect(warn().map((i) => i.message)).toEqual([
      "B has a PatternSignals row in P1 but is not in corridor MAIN-SB. Add it back to the corridor, or delete the row.",
    ]);

    // …and adding it back reuses it rather than starting from zero: the plan
    // offers no new pattern or split rows for B, only the corridor membership.
    const readd = planAddSignal(readAllCoordination(), "MAIN-SB", "B", gtss);
    expect(readd.rows.patternSignals).toEqual([]);
    expect(readd.rows.splits).toEqual([]);
    applyBuild(readd.rows);
    expect(members()).toEqual(["1:A", "2:B"]);
    expect(readAllCoordination().patternSignals.filter((p) => p.signalId === "B")).toEqual([
      { ...ps, offsetS: 37 },
    ]);
    expect(warn()).toEqual([]);
  });

  it("never overwrites what is already stored when it builds", () => {
    build();
    const before = readAllCoordination();
    const tuned = before.patternSignals.map((p) => ({ ...p, offsetS: 99 }));
    localStorage.setItem("gtss_pattern_signals", JSON.stringify(tuned));
    // Re-applying the same plan's rows must not reset the offsets.
    const { rows } = planCorridor(
      {
        corridorId: "OTHER",
        direction: "SB",
        signalIds: ["A", "B"],
        pattern: { patternId: "P1x", patternNumber: 2, cycleS: 100 },
      },
      gtss,
      readAllCoordination(),
    );
    applyBuild({
      ...rows,
      patternSignals: [...(rows.patternSignals ?? []), ...before.patternSignals],
    });
    expect(
      readAllCoordination()
        .patternSignals.filter((p) => p.patternId === "P1")
        .every((p) => p.offsetS === 99),
    ).toBe(true);
  });

  it("is blocked by the storage read-only guard", () => {
    build();
    const before = JSON.stringify(readAllCoordination());
    setStorageReadOnly(true);
    try {
      removeCorridorSignal("MAIN-SB", 0);
      applyBuild(planAddSignal(readAllCoordination(), "MAIN-SB", "C", gtss).rows);
    } finally {
      setStorageReadOnly(false);
    }
    expect(JSON.stringify(readAllCoordination())).toBe(before);
  });
});

describe("left-turn windows", () => {
  // Barrier B: ring 1 runs 3 (30s) then 4 (35s); ring 2 runs 7 (15s) then 8 (50s).
  const rows = standardPhaseSequence("S", [3, 4, 7, 8]);
  const splits = [
    { patternId: "P", signalId: "S", phaseId: 3, splitS: 30 },
    { patternId: "P", signalId: "S", phaseId: 4, splitS: 35 },
    { patternId: "P", signalId: "S", phaseId: 7, splitS: 15 },
    { patternId: "P", signalId: "S", phaseId: 8, splitS: 50 },
  ];
  const input = {
    patternId: "P",
    signalId: "S",
    coordinatedPhase: 4,
    offsetS: 100,
    greenS: 35,
    patternSignals: [],
    phaseSequence: rows,
    splits,
  };

  it("places the same direction's left (7) at the start of the barrier group", () => {
    // 4 starts 30s into the group; 7 starts at 0, so 30s earlier.
    expect(phaseWindow(input, 7)).toEqual({ phase: 7, offsetS: 70, greenS: 15 });
  });

  it("places the opposing left (3) in the coordinated phase's own ring", () => {
    expect(phaseWindow(input, 3)).toEqual({ phase: 3, offsetS: 70, greenS: 30 });
  });

  it("won't place a phase from the same ring when another ring is asked for", () => {
    expect(phaseWindow(input, 3, { otherRing: true })).toBeNull();
  });

  it("has nothing to say about the coordinated phase itself, or a phase it can't place", () => {
    expect(phaseWindow(input, 4)).toBeNull();
    expect(phaseWindow(input, 1)).toBeNull(); // not in the sequence
    expect(phaseWindow({ ...input, splits: splits.filter((s) => s.phaseId !== 7) }, 7)).toBeNull();
  });
});

describe("street names for a label", () => {
  it("takes the direction off an approach's street name", () => {
    expect(baseStreetName("Lake Ave SB")).toBe("Lake Ave");
    expect(baseStreetName("Grand Ave northbound")).toBe("Grand Ave");
    expect(baseStreetName("North Branch (30°)")).toBe("North Branch");
    expect(baseStreetName("Lake Ave NB (main)")).toBe("Lake Ave");
  });

  it("leaves names alone that merely contain a direction word", () => {
    expect(baseStreetName("East Blvd")).toBe("East Blvd");
    expect(baseStreetName("N")).toBe("N"); // never strips a name to nothing
    expect(baseStreetName("Westbound Way")).toBe("Westbound Way");
  });

  it("names each street once, in approach order", () => {
    const { approaches } = fourLeg("A");
    expect(intersectionStreetNames({ signalId: "A" }, approaches)).toEqual(["Main St", "A Ave"]);
  });

  it("falls back to the signal's own names when it has no approaches", () => {
    expect(
      intersectionStreetNames({ signalId: "Z", streetName1: "Oak St", streetName2: " " }, []),
    ).toEqual(["Oak St"]);
  });
});
