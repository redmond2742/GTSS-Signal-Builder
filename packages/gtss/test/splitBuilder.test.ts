import { beforeEach, describe, expect, it } from "vitest";
import { standardPhaseSequence } from "../src/localStorage/coordination/corridorBuilder";
import {
  COORDINATION_ENTITIES,
  readAllCoordination,
} from "../src/localStorage/coordination/entities";
import type { ParsedCoordination, Split } from "../src/localStorage/coordination/rows";
import {
  balanceBarriers,
  buildUpToCycle,
  checkSplits,
  minimumSplit,
  savedSplitValues,
  scaleToCycle,
  splitPlanFor,
  startingSplits,
  undoSplitsChange,
  writeSplits,
} from "../src/localStorage/coordination/splitBuilder";
import { validateCoordination } from "../src/localStorage/coordination/validate";
import { setStorageReadOnly } from "../src/localStorage/write-guard";
import * as sample from "./fixtures/coordination-sample";
import { fourLeg, timing } from "./fixtures/gtss-intersections";

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

/** Signal A: standard dual ring, 1 2 | 3 4 over 5 6 | 7 8, min green 5, Y 4, AR 1. */
const leg = fourLeg("A");
const plan = splitPlanFor("A", standardPhaseSequence("A", [1, 2, 3, 4, 5, 6, 7, 8]), leg);
const ring = (values: Record<number, number>, phases: number[]) =>
  phases.reduce((n, p) => n + (values[p] ?? 0), 0);

describe("what a split needs", () => {
  it("is min green plus yellow and all-red", () => {
    expect(minimumSplit(timing("A", 2, 40))).toEqual({ seconds: 10, basis: "min green" });
  });

  it("is the pedestrian walk and clearance instead, when that is longer", () => {
    const t = { ...timing("A", 2, 40), pedWalk: 7, pedClearance: 15 };
    expect(minimumSplit(t)).toEqual({ seconds: 27, basis: "walk + ped clearance" });
  });

  it("is unknown without timings", () => {
    expect(minimumSplit(undefined)).toEqual({ seconds: null, basis: null });
  });
});

describe("a signal's split plan", () => {
  it("groups the phases by barrier, in the order the rings reach them", () => {
    expect(
      plan.groups.map((g) => ({
        barrierId: g.barrierId,
        rings: g.rings.map((r) => r.phases.map((p) => p.phaseId)),
      })),
    ).toEqual([
      {
        barrierId: "A",
        rings: [
          [1, 2],
          [5, 6],
        ],
      },
      {
        barrierId: "B",
        rings: [
          [3, 4],
          [7, 8],
        ],
      },
    ]);
  });

  it("knows each phase's minimum and its max-green split", () => {
    const p2 = plan.phases.find((p) => p.phaseId === 2);
    expect(p2).toMatchObject({ active: true, minimumS: 10, maxGreenSplitS: 45, clearanceS: 5 });
  });

  it("gives no time to spare phases the sequence lists but the signal doesn't run", () => {
    // SIG-022's sequence has 9, 11, 13 and 15 besides its real phases, and no
    // splits or GTSS phases for 1 and 5 either.
    const rows: ParsedCoordination = {};
    COORDINATION_ENTITIES.find((e) => e.key === "phaseSequence")!.parseInto(
      sample.phaseSequenceTxt,
      rows,
    );
    COORDINATION_ENTITIES.find((e) => e.key === "splits")!.parseInto(sample.splitsTxt, rows);
    const seq = (rows.phaseSequence ?? []).filter(
      (r) => r.signalId === "SIG-022" && r.sequenceId === "SEQ-01",
    );
    const real = splitPlanFor("SIG-022", seq, { phases: [], basicTimings: [] }, rows.splits);
    expect(real.phases.filter((p) => p.active).map((p) => p.phaseId)).toEqual([2, 3, 4, 6, 7, 8]);
    const even = startingSplits(real, "even", 114).values;
    expect([1, 5, 9, 11, 13, 15].every((p) => even[p] === 0)).toBe(true);
    // The saved splits already work: 49 + 30 + 35 and 49 + 15 + 50.
    expect(
      checkSplits(real, savedSplitValues(rows.splits ?? [], "CAL-SB-P01", "SIG-022"), 114).ok,
    ).toBe(true);
  });
});

describe("where building starts", () => {
  it("can start every phase at its minimum", () => {
    const { values } = startingSplits(plan, "minimum", 100);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((p) => values[p])).toEqual(Array(8).fill(10));
  });

  it("can start from max green plus clearance", () => {
    const { values } = startingSplits(plan, "maxGreen", 100);
    expect([1, 2, 3, 4].map((p) => values[p])).toEqual([15, 45, 15, 30]);
  });

  it("can share the cycle evenly: each barrier group, then each ring's phases", () => {
    const { values } = startingSplits(plan, "even", 100);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((p) => values[p])).toEqual(Array(8).fill(25));
  });

  it("starts a phase with no timings at an even share, and says so", () => {
    const noTiming = splitPlanFor("A", standardPhaseSequence("A", [1, 2, 3, 4, 5, 6, 7, 8]), {
      phases: leg.phases,
      basicTimings: leg.basicTimings.filter((t) => t.phase !== 3),
    });
    const { values, notes } = startingSplits(noTiming, "minimum", 100);
    expect(values[3]).toBe(25);
    expect(notes).toEqual([
      "No min green in Basic Timings for φ3, so it starts at an even share of the cycle.",
    ]);
  });
});

describe("building up to the cycle", () => {
  it("pads a ring that is short at a barrier, on the coordinated phase's partner", () => {
    // The left (5) is the longer of ring 2's phases here, so this only passes
    // if the partner is chosen for being the partner.
    const values = { 1: 10, 2: 40, 3: 10, 4: 20, 5: 25, 6: 15, 7: 10, 8: 20 };
    const next = balanceBarriers(plan, values, 2);
    expect(next[6]).toBe(25);
    expect(next[5]).toBe(25);
    expect(ring(next, [1, 2])).toBe(ring(next, [5, 6]));
  });

  it("pads the longest phase when no coordinated phase is in the group", () => {
    const values = { 1: 10, 2: 40, 3: 10, 4: 20, 5: 10, 6: 30, 7: 15, 8: 30 };
    const next = balanceBarriers(plan, values, null);
    expect(next[6]).toBe(40);
    expect(next[4]).toBe(35);
  });

  it("gives the time left in the cycle to the coordinated phase and its partner", () => {
    const start = startingSplits(plan, "minimum", 100).values;
    const { values, addedS, overS } = buildUpToCycle(plan, start, 100, 2);
    expect(addedS).toBe(60);
    expect(overS).toBe(0);
    expect(values[2]).toBe(70);
    expect(values[6]).toBe(70);
    expect([1, 3, 4, 5, 7, 8].every((p) => values[p] === 10)).toBe(true);
    expect(checkSplits(plan, values, 100).ok).toBe(true);
  });

  it("shares it across the barrier groups when nothing is coordinated", () => {
    const start = startingSplits(plan, "minimum", 100).values;
    const { values } = buildUpToCycle(plan, start, 100, null);
    expect(ring(values, [1, 2])).toBe(50);
    expect(ring(values, [3, 4])).toBe(50);
    expect(checkSplits(plan, values, 100).ok).toBe(true);
  });

  it("takes time back off the coordinated phase and its partner when the splits run long", () => {
    const start = startingSplits(plan, "maxGreen", 100).values; // 105 in each ring
    const { values, addedS, overS } = buildUpToCycle(plan, start, 100, 2);
    expect(addedS).toBe(-5);
    expect(overS).toBe(0);
    expect(values[2]).toBe(40);
    expect(values[6]).toBe(40);
    expect([1, 3, 4, 5, 7, 8].every((p) => values[p] === start[p])).toBe(true);
    expect(checkSplits(plan, values, 100).ok).toBe(true);
  });

  it("trims the coordinated group first even when another group is longer", () => {
    // Coordinated on φ4: group B (45s) gives up the 5s, not the longer group A (60s).
    const start = startingSplits(plan, "maxGreen", 100).values;
    const { values } = buildUpToCycle(plan, start, 100, 4);
    expect(values[4]).toBe(25);
    expect(values[8]).toBe(25);
    expect(values[2]).toBe(45);
    expect(checkSplits(plan, values, 100).ok).toBe(true);
  });

  it("moves on to the other barrier group once the coordinated phases reach their minimum", () => {
    // Group A is already at its minimums, so the 20s must come off group B.
    const start = { 1: 10, 2: 10, 3: 10, 4: 70, 5: 10, 6: 10, 7: 10, 8: 70 };
    const { values, overS } = buildUpToCycle(plan, start, 80, 2);
    expect(overS).toBe(0);
    expect(values[2]).toBe(10);
    expect(values[4]).toBe(50);
    expect(values[8]).toBe(50);
    expect(checkSplits(plan, values, 80).ok).toBe(true);
  });

  it("stops at the minimums, and says how far past the cycle that leaves it", () => {
    const start = startingSplits(plan, "minimum", 30).values; // 40 at minimums
    const { values, overS } = buildUpToCycle(plan, start, 30, 2);
    expect(overS).toBe(10);
    expect(values).toEqual(start);
  });

  it("can scale to the cycle instead, keeping proportions and barriers", () => {
    const start = startingSplits(plan, "maxGreen", 100).values;
    const values = scaleToCycle(plan, start, 100);
    expect(checkSplits(plan, values, 100).ok).toBe(true);
    expect(ring(values, [1, 2])).toBe(ring(values, [5, 6]));
  });
});

describe("checking splits", () => {
  it("says which barriers the rings don't reach together", () => {
    const check = checkSplits(
      plan,
      { 1: 10, 2: 40, 3: 10, 4: 40, 5: 10, 6: 30, 7: 10, 8: 50 },
      100,
    );
    expect(check.unbalanced).toEqual([
      {
        barrierId: "A",
        totals: [
          { ring: 1, totalS: 50 },
          { ring: 2, totalS: 40 },
        ],
      },
      {
        barrierId: "B",
        totals: [
          { ring: 1, totalS: 50 },
          { ring: 2, totalS: 60 },
        ],
      },
    ]);
    expect(check.usedS).toBe(110);
    expect(check.ok).toBe(false);
  });

  it("names phases below their minimum, but not phases left out at 0", () => {
    const check = checkSplits(plan, { 1: 0, 2: 50, 3: 8, 4: 42, 5: 0, 6: 50, 7: 10, 8: 40 }, 100);
    expect(check.belowMinimum).toEqual([{ phaseId: 3, valueS: 8, minimumS: 10 }]);
  });
});

describe("saving splits", () => {
  const seed = () => {
    const bag: ParsedCoordination = {};
    COORDINATION_ENTITIES.find((e) => e.key === "splits")!.parseInto(sample.splitsTxt, bag);
    COORDINATION_ENTITIES.find((e) => e.key === "splits")!.replaceFrom(bag);
  };
  const stored = () => readAllCoordination().splits;
  const rowsOf = (signalId: string, patternId = "CAL-SB-P01") =>
    stored()
      .filter((s) => s.patternId === patternId && s.signalId === signalId)
      .map((s) => `${s.phaseId}:${s.splitS}`);

  it("updates rows in place, adds new phases beside them and drops phases set to 0", () => {
    seed();
    const before = stored();
    writeSplits("CAL-SB-P01", new Map([["SIG-022", { 1: 5, 2: 44, 3: 30, 7: 0 }]]));
    expect(rowsOf("SIG-022")).toEqual(["2:44", "3:30", "4:35", "6:49", "8:50", "1:5"]);
    // Same place in the file: SIG-022's first row is still where it was.
    expect(stored().findIndex((s) => s.signalId === "SIG-022")).toBe(
      before.findIndex((s) => s.signalId === "SIG-022"),
    );
    // Nobody else's rows moved or changed.
    const others = (rows: Split[]) =>
      rows.filter((s) => !(s.patternId === "CAL-SB-P01" && s.signalId === "SIG-022"));
    expect(others(stored())).toEqual(others(before));
  });

  it("puts a signal's first rows in a pattern after that pattern's others", () => {
    seed();
    writeSplits("CAL-SB-P01", new Map([["SIG-100", { 2: 60, 6: 60, 4: 54, 8: 54 }]]));
    const rows = stored();
    const at = rows.findIndex((s) => s.signalId === "SIG-100");
    expect(rows[at - 1].patternId).toBe("CAL-SB-P01");
    expect(rows[at + 4]?.patternId).not.toBe("CAL-SB-P01");
    expect(rowsOf("SIG-100")).toEqual(["2:60", "4:54", "6:60", "8:54"]);
  });

  it("undoes back to exactly what was there", () => {
    seed();
    const before = JSON.stringify(stored());
    const change = writeSplits(
      "CAL-SB-P01",
      new Map<string, Record<number, number>>([
        ["SIG-022", { 1: 5, 2: 44, 7: 0, 8: 0 }],
        ["SIG-100", { 2: 60, 6: 60 }],
      ]),
    );
    expect(change.created).toHaveLength(3);
    expect(change.updated).toHaveLength(1);
    expect(change.removed).toHaveLength(2);
    undoSplitsChange(change);
    expect(JSON.stringify(stored())).toBe(before);
  });

  it("builds a signal's missing splits so validation is happy", () => {
    seed();
    const start = startingSplits(plan, "minimum", 114).values;
    const { values } = buildUpToCycle(plan, start, 114, 2);
    writeSplits("CAL-SB-P01", new Map([["A", values]]));
    const rows = {
      ...readAllCoordination(),
      patterns: [
        {
          patternId: "CAL-SB-P01",
          patternNumber: 1,
          corridorId: null,
          cycleLengthS: 114,
          referencePoint: "BegGreen",
          description: null,
        },
      ],
      phaseSequence: standardPhaseSequence("A", [1, 2, 3, 4, 5, 6, 7, 8]),
    };
    expect(
      validateCoordination(rows).filter((i) => i.scope === "splits" && i.message.startsWith("A ")),
    ).toEqual([]);
  });

  it("is blocked by the storage read-only guard", () => {
    seed();
    const before = JSON.stringify(stored());
    setStorageReadOnly(true);
    try {
      writeSplits("CAL-SB-P01", new Map([["SIG-022", { 2: 1 }]]));
    } finally {
      setStorageReadOnly(false);
    }
    expect(JSON.stringify(stored())).toBe(before);
  });
});
