import { beforeEach, describe, expect, it } from "vitest";
import {
  COORDINATION_ENTITIES,
  readAllCoordination,
} from "../src/localStorage/coordination/entities";
import {
  apportion,
  fitSplitsToCycle,
  setSignalsCycle,
  undoCycleChange,
} from "../src/localStorage/coordination/fitSplits";
import type {
  ParsedCoordination,
  PhaseSequenceEntry,
  Split,
} from "../src/localStorage/coordination/rows";
import { validateCoordination } from "../src/localStorage/coordination/validate";
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

const seq = (
  ring: number,
  position: number,
  phaseId: number,
  barrierId: string,
): PhaseSequenceEntry => ({
  signalId: "S",
  sequenceId: "SEQ-01",
  ring,
  position,
  phaseId,
  barrierId,
});
const split = (phaseId: number, splitS: number): Split => ({
  patternId: "P",
  signalId: "S",
  phaseId,
  splitS,
});
const dualRing = [
  seq(1, 1, 1, "A"),
  seq(1, 2, 2, "A"),
  seq(1, 3, 3, "B"),
  seq(1, 4, 4, "B"),
  seq(2, 1, 5, "A"),
  seq(2, 2, 6, "A"),
  seq(2, 3, 7, "B"),
  seq(2, 4, 8, "B"),
];
const ringTotal = (splits: Split[], ring: number) =>
  splits
    .filter((s) => dualRing.find((r) => r.phaseId === s.phaseId)?.ring === ring)
    .reduce((n, s) => n + (s.splitS ?? 0), 0);
const groupTotal = (splits: Split[], ring: number, barrier: string) =>
  splits
    .filter((s) => {
      const r = dualRing.find((x) => x.phaseId === s.phaseId);
      return r?.ring === ring && r.barrierId === barrier;
    })
    .reduce((n, s) => n + (s.splitS ?? 0), 0);

describe("apportioning whole seconds", () => {
  it("keeps proportions and hits the total exactly", () => {
    expect(apportion([1, 1, 1], 10)).toEqual([4, 3, 3]);
    expect(apportion([30, 35], 65)).toEqual([30, 35]);
    expect(apportion([2, 1], 100).reduce((a, b) => a + b)).toBe(100);
  });
  it("gives nothing when there is nothing to share", () => {
    expect(apportion([0, 0], 10)).toEqual([0, 0]);
    expect(apportion([3, 4], 0)).toEqual([0, 0]);
  });
});

describe("fitting splits to a cycle", () => {
  // The real case: every ring sums to 120 but the pattern runs 114.
  const at120 = [
    split(1, 15),
    split(2, 45),
    split(3, 20),
    split(4, 40),
    split(5, 20),
    split(6, 40),
    split(7, 15),
    split(8, 45),
  ];

  it("makes every ring sum to the new cycle exactly", () => {
    const fit = fitSplitsToCycle(at120, dualRing, 114)!;
    expect(ringTotal(fit.splits, 1)).toBe(114);
    expect(ringTotal(fit.splits, 2)).toBe(114);
  });

  it("keeps the rings crossing each barrier together", () => {
    const fit = fitSplitsToCycle(at120, dualRing, 114)!;
    expect(groupTotal(fit.splits, 1, "A")).toBe(groupTotal(fit.splits, 2, "A"));
    expect(groupTotal(fit.splits, 1, "B")).toBe(groupTotal(fit.splits, 2, "B"));
  });

  it("repairs rings that didn't line up at a barrier to begin with", () => {
    // Ring 2 is 10 s short in barrier A; it is stretched to match ring 1.
    const uneven = [
      split(1, 15),
      split(2, 45),
      split(3, 20),
      split(4, 40),
      split(5, 10),
      split(6, 40),
      split(7, 15),
      split(8, 45),
    ];
    const fit = fitSplitsToCycle(uneven, dualRing, 120)!;
    expect(groupTotal(fit.splits, 1, "A")).toBe(groupTotal(fit.splits, 2, "A"));
    expect(ringTotal(fit.splits, 2)).toBe(120);
  });

  it("keeps each phase's share of its ring", () => {
    const fit = fitSplitsToCycle(at120, dualRing, 60)!;
    const of = (p: number) => fit.splits.find((s) => s.phaseId === p)!.splitS!;
    expect(of(2)).toBeGreaterThan(of(1));
    expect(Math.abs(of(2) - 45 / 2)).toBeLessThanOrEqual(1);
  });

  it("leaves a phase it can't place untouched, and says so", () => {
    const fit = fitSplitsToCycle([...at120, split(9, 7)], dualRing, 114)!;
    expect(fit.unplaced).toEqual([9]);
    expect(fit.splits.find((s) => s.phaseId === 9)?.splitS).toBe(7);
  });

  it("returns nothing it can't do", () => {
    expect(fitSplitsToCycle(at120, [], 114)).toBeNull();
    expect(fitSplitsToCycle(at120, dualRing, 0)).toBeNull();
    expect(fitSplitsToCycle([split(1, 0), split(2, 0)], dualRing, 100)).toBeNull();
  });

  it("does not change its input", () => {
    const before = JSON.stringify(at120);
    fitSplitsToCycle(at120, dualRing, 90);
    expect(JSON.stringify(at120)).toBe(before);
  });
});

describe("setting several signals' cycle in storage", () => {
  const files: Record<string, string> = {
    corridors: sample.corridorsTxt,
    corridorSignals: sample.corridorSignalsTxt,
    patterns: sample.patternsTxt,
    patternSignals: sample.patternSignalsTxt,
    splits: sample.splitsTxt,
    schedule: sample.scheduleTxt,
    phaseSequence: sample.phaseSequenceTxt,
  };
  const seed = () => {
    const bag: ParsedCoordination = {};
    for (const e of COORDINATION_ENTITIES) e.parseInto(files[e.key], bag);
    COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(bag));
  };
  const splitSumWarnings = () =>
    validateCoordination(readAllCoordination()).filter((i) =>
      i.id.startsWith("split-sum-CAL-SB-P01|"),
    );

  // The sample's headline problem: six signals' splits total 120 s in a 114 s pattern.
  it("clears the real 120-vs-114 split warnings in pattern 1", () => {
    seed();
    expect(splitSumWarnings().length).toBeGreaterThan(0);
    const offenders = Array.from(new Set(splitSumWarnings().map((i) => i.id.split("|")[1])));

    const change = setSignalsCycle("CAL-SB-P01", offenders, 114);

    expect(change.changed.sort()).toEqual([...offenders].sort());
    expect(splitSumWarnings()).toEqual([]);
  });

  it("leaves other signals and patterns alone", () => {
    seed();
    const before = readAllCoordination().splits;
    setSignalsCycle("CAL-SB-P01", ["SIG-023"], 114);
    const after = readAllCoordination().splits;
    const untouched = (s: Split) => !(s.patternId === "CAL-SB-P01" && s.signalId === "SIG-023");
    expect(after.filter(untouched)).toEqual(before.filter(untouched));
  });

  it("can set the pattern's cycle too, and undoes both", () => {
    seed();
    const before = JSON.stringify(readAllCoordination());
    const change = setSignalsCycle("CAL-SB-P01", ["SIG-022", "SIG-023"], 120, {
      setPatternCycle: true,
    });
    expect(
      readAllCoordination().patterns.find((p) => p.patternId === "CAL-SB-P01")?.cycleLengthS,
    ).toBe(120);
    undoCycleChange("CAL-SB-P01", change);
    expect(JSON.stringify(readAllCoordination())).toBe(before);
  });

  it("skips, and says why, a signal it can't fit", () => {
    seed();
    const change = setSignalsCycle("CAL-SB-P01", ["SIG-028", "NOPE"], 114);
    expect(change.changed).toEqual([]);
    expect(change.skipped.map((s) => s.signalId)).toEqual(["SIG-028", "NOPE"]);
  });

  it("is blocked by the storage read-only guard", () => {
    seed();
    const before = JSON.stringify(readAllCoordination());
    setStorageReadOnly(true);
    try {
      setSignalsCycle("CAL-SB-P01", ["SIG-023"], 100, { setPatternCycle: true });
    } finally {
      setStorageReadOnly(false);
    }
    expect(JSON.stringify(readAllCoordination())).toBe(before);
  });
});
