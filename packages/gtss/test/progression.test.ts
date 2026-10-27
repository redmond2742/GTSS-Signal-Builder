import { beforeEach, describe, expect, it } from "vitest";
import { progressionBand } from "../src/localStorage/coordination/bandwidth";
import { standardPhaseSequence } from "../src/localStorage/coordination/corridorBuilder";
import { generatePhaseSequenceCSV } from "../src/localStorage/coordination/csv-export";
import {
  COORDINATION_ENTITIES,
  readAllCoordination,
} from "../src/localStorage/coordination/entities";
import { phaseWindow, type OpposingInput } from "../src/localStorage/coordination/opposingPhase";
import { parsePhaseSequenceTXT } from "../src/localStorage/coordination/parsers";
import {
  parseProgression,
  progressionPhases,
  setProgression,
} from "../src/localStorage/coordination/progression";
import type { ParsedCoordination, Split } from "../src/localStorage/coordination/rows";
import {
  greenAt,
  greenSecondsPerCycle,
  orientStops,
  simulateTrajectories,
  type TrajectoryStop,
} from "../src/localStorage/coordination/trajectories";
import { setStorageReadOnly } from "../src/localStorage/write-guard";
import * as sample from "./fixtures/coordination-sample";

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

const seedSample = () => {
  const bag: ParsedCoordination = {};
  const seq = COORDINATION_ENTITIES.find((e) => e.key === "phaseSequence")!;
  seq.parseInto(sample.phaseSequenceTxt, bag);
  seq.replaceFrom(bag);
};

describe("reading the progression column", () => {
  it("reads the directions however they're separated, and drops anything else", () => {
    expect(parseProgression("SB")).toEqual(["SB"]);
    expect(parseProgression("sb; nb")).toEqual(["SB", "NB"]);
    expect(parseProgression("SB/NB/SB")).toEqual(["SB", "NB"]);
    expect(parseProgression("SB;sideways")).toEqual(["SB"]);
    expect(parseProgression(null)).toEqual([]);
  });

  it("finds a signal's phases for a direction, from any of its sequences", () => {
    const rows = [
      ...standardPhaseSequence("A", [1, 2, 3, 4, 5, 6, 7, 8], "SEQ-01"),
      ...standardPhaseSequence("A", [1, 2, 3, 4, 5, 6, 7, 8], "SEQ-02"),
    ].map((r) =>
      r.sequenceId === "SEQ-02" && r.phaseId === 7
        ? { ...r, progression: "SB" }
        : r.phaseId === 3
          ? { ...r, progression: "NB;SB" }
          : r,
    );
    expect(progressionPhases(rows, "A", "SB")).toEqual([3, 7]);
    expect(progressionPhases(rows, "A", "NB")).toEqual([3]);
    expect(progressionPhases(rows, "A", "EB")).toEqual([]);
    expect(progressionPhases(rows, "B", "SB")).toEqual([]);
  });
});

describe("marking a phase for progression", () => {
  const rowsFor = (phaseId: number) =>
    readAllCoordination().phaseSequence.filter(
      (r) => r.signalId === "SIG-024" && r.phaseId === phaseId,
    );

  it("marks every sequence's row for the phase, and nothing else", () => {
    seedSample();
    const before = readAllCoordination().phaseSequence;
    expect(setProgression("SIG-024", 7, "sb", true)).toBe(true);
    // SIG-024 has more than one sequence; phase 7 is marked in each.
    const marked = rowsFor(7);
    expect(new Set(marked.map((r) => r.sequenceId)).size).toBeGreaterThan(1);
    expect(marked.every((r) => r.progression === "SB")).toBe(true);
    const others = (rows: typeof before) =>
      rows.filter((r) => !(r.signalId === "SIG-024" && r.phaseId === 7));
    expect(others(readAllCoordination().phaseSequence)).toEqual(others(before));
  });

  it("keeps the other direction when it adds or takes one away", () => {
    seedSample();
    setProgression("SIG-024", 3, "NB", true);
    setProgression("SIG-024", 3, "SB", true);
    expect(rowsFor(3)[0].progression).toBe("NB;SB");
    setProgression("SIG-024", 3, "NB", false);
    expect(rowsFor(3)[0].progression).toBe("SB");
    setProgression("SIG-024", 3, "SB", false);
    expect(rowsFor(3)[0].progression).toBeNull();
  });

  it("says when nothing changed", () => {
    seedSample();
    expect(setProgression("SIG-024", 7, "SB", false)).toBe(false);
    setProgression("SIG-024", 7, "SB", true);
    expect(setProgression("SIG-024", 7, "SB", true)).toBe(false);
    expect(setProgression("SIG-024", 99, "SB", true)).toBe(false);
    expect(setProgression("SIG-024", 7, "up", true)).toBe(false);
  });

  it("is blocked by the storage read-only guard", () => {
    seedSample();
    const before = JSON.stringify(readAllCoordination());
    setStorageReadOnly(true);
    try {
      setProgression("SIG-024", 7, "SB", true);
    } finally {
      setStorageReadOnly(false);
    }
    expect(JSON.stringify(readAllCoordination())).toBe(before);
  });
});

describe("the progression column in PhaseSequence.txt", () => {
  it("is left off when no row uses it, so the converter's file comes back as it was", () => {
    const rows = parsePhaseSequenceTXT(sample.phaseSequenceTxt);
    expect(generatePhaseSequenceCSV(rows)).toBe(sample.phaseSequenceTxt);
  });

  it("is written when used, and reads back", () => {
    const rows = parsePhaseSequenceTXT(sample.phaseSequenceTxt).map((r) =>
      r.signalId === "SIG-022" && r.phaseId === 7 ? { ...r, progression: "SB;NB" } : r,
    );
    const csv = generatePhaseSequenceCSV(rows);
    expect(csv.split("\n")[0]).toBe(
      "signal_id,sequence_id,ring,position,phase_id,barrier_id,progression",
    );
    expect(csv).toContain("SIG-022,SEQ-01,2,4,7,B,SB;NB");
    expect(csv).toContain("SIG-022,SEQ-01,2,5,8,B,\n");
    expect(parsePhaseSequenceTXT(csv)).toEqual(rows);
  });
});

describe("green in more than one window", () => {
  const stop = (extra: TrajectoryStop["extraGreens"] = []): TrajectoryStop => ({
    distanceM: 0,
    offsetS: 0,
    greenS: 30,
    free: false,
    extraGreens: extra,
  });

  it("lets traffic through in any of the windows", () => {
    const s = stop([{ offsetS: 60, greenS: 15 }]);
    expect(greenAt(s, 10, 100)).toBe(true);
    expect(greenAt(s, 45, 100)).toBe(false);
    expect(greenAt(s, 65, 100)).toBe(true);
    expect(greenAt(s, 165, 100)).toBe(true);
  });

  it("counts time once where windows overlap, including across the cycle's end", () => {
    expect(greenSecondsPerCycle(stop([{ offsetS: 20, greenS: 20 }]), 100)).toBe(40);
    expect(greenSecondsPerCycle(stop([{ offsetS: 90, greenS: 20 }]), 100)).toBe(40);
    expect(greenSecondsPerCycle(stop([{ offsetS: 50, greenS: 10 }]), 100)).toBe(40);
  });

  it("keeps each direction's extra windows to itself", () => {
    const s: TrajectoryStop = {
      ...stop([{ offsetS: 60, greenS: 15 }]),
      opposing: { offsetS: 40, greenS: 30, extraGreens: [{ offsetS: 5, greenS: 5 }] },
    };
    expect(orientStops([s], "forward").stops[0].extraGreens).toEqual([{ offsetS: 60, greenS: 15 }]);
    expect(orientStops([s], "opposite").stops[0].extraGreens).toEqual([{ offsetS: 5, greenS: 5 }]);
    const noReturn = orientStops([stop([{ offsetS: 60, greenS: 15 }])], "opposite").stops[0];
    expect(noReturn.extraGreens).toEqual([]);
  });

  // Two signals 500 m apart at 10 m/s: 50 s apart. The second's coordinated
  // green doesn't line up with the first's; a left turn it also runs on does.
  const corridor = (extra: TrajectoryStop["extraGreens"]): TrajectoryStop[] => [
    { distanceM: 0, offsetS: 0, greenS: 20, free: false, approachSpeedMps: 10 },
    {
      distanceM: 500,
      offsetS: 80,
      greenS: 15,
      free: false,
      approachSpeedMps: 10,
      extraGreens: extra,
    },
  ];

  it("opens a band through a progression phase", () => {
    const options = { cycleS: 100, speedMps: 10, fromIndex: 0, toIndex: 1 };
    expect(progressionBand(corridor([]), options)?.widthS).toBe(0);
    const band = progressionBand(corridor([{ offsetS: 45, greenS: 20 }]), options);
    expect(band?.widthS).toBe(15);
    expect(band?.departS).toBe(0);
  });

  it("lets the green-wave lines through on it", () => {
    const run = (extra: TrajectoryStop["extraGreens"]) =>
      simulateTrajectories(corridor(extra), {
        cycleS: 100,
        speedMps: 10,
        fromS: 0,
        toS: 200,
        mode: "green-wave",
      }).filter((l) => l.points.length === 2).length;
    expect(run([])).toBe(0);
    expect(run([{ offsetS: 45, greenS: 20 }])).toBeGreaterThan(0);
  });
});

describe("placing a phase in another barrier group", () => {
  const splits = (values: Record<number, number>): Split[] =>
    Object.entries(values).map(([phaseId, splitS]) => ({
      patternId: "P",
      signalId: "A",
      phaseId: Number(phaseId),
      splitS,
    }));
  const input = (values: Record<number, number>): OpposingInput => ({
    patternId: "P",
    signalId: "A",
    coordinatedPhase: 2,
    offsetS: 10,
    greenS: values[2],
    patternSignals: [],
    phaseSequence: standardPhaseSequence("A", [1, 2, 3, 4, 5, 6, 7, 8]),
    splits: splits(values),
  });

  it("walks the barrier groups in order, each as long as its busiest ring", () => {
    // Group A: 15 + 45 = 60 in ring 1, 10 + 40 = 50 in ring 2, so it lasts 60s.
    const i = input({ 1: 15, 2: 45, 5: 10, 6: 40, 3: 15, 4: 30, 7: 15, 8: 30 });
    // φ2 starts 15s into the cycle; group B starts at 60.
    expect(phaseWindow(i, 4, { acrossBarriers: true })).toEqual({
      phase: 4,
      offsetS: 10 + 75 - 15,
      greenS: 30,
    });
    expect(phaseWindow(i, 7, { acrossBarriers: true })).toEqual({
      phase: 7,
      offsetS: 10 + 60 - 15,
      greenS: 15,
    });
  });

  it("still won't unless asked", () => {
    const i = input({ 1: 15, 2: 45, 5: 10, 6: 40, 3: 15, 4: 30, 7: 15, 8: 30 });
    expect(phaseWindow(i, 4)).toBeNull();
    // Same group is unchanged either way.
    expect(phaseWindow(i, 5, { acrossBarriers: true })).toEqual(phaseWindow(i, 5));
  });
});
