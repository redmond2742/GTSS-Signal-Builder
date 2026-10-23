import { describe, expect, it } from "vitest";
import { COORDINATION_ENTITIES } from "../src/localStorage/coordination/entities";
import {
  opposingPhaseNumber,
  opposingWindow,
} from "../src/localStorage/coordination/opposingPhase";
import { sequenceForPattern } from "../src/localStorage/coordination/phaseSequenceLayout";
import type {
  ParsedCoordination,
  PatternSignal,
  PhaseSequenceEntry,
  Split,
} from "../src/localStorage/coordination/rows";
import * as sample from "./fixtures/coordination-sample";

const sampleBag = () => {
  const bag: ParsedCoordination = {};
  for (const [key, text] of [
    ["patternSignals", sample.patternSignalsTxt],
    ["phaseSequence", sample.phaseSequenceTxt],
    ["splits", sample.splitsTxt],
  ] as const) {
    COORDINATION_ENTITIES.find((e) => e.key === key)!.parseInto(text, bag);
  }
  return {
    patternSignals: bag.patternSignals ?? [],
    phaseSequence: bag.phaseSequence ?? [],
    splits: bag.splits ?? [],
  };
};

// --- Hand-built signals ---------------------------------------------------

const seqRow = (
  ring: number,
  position: number,
  phaseId: number,
  barrierId: string | null,
  sequenceId = "SEQ-01",
): PhaseSequenceEntry => ({ signalId: "S", sequenceId, ring, position, phaseId, barrierId });
const split = (phaseId: number, splitS: number, patternId = "P"): Split => ({
  patternId,
  signalId: "S",
  phaseId,
  splitS,
});
const ps = (notes: string | null = null): PatternSignal => ({
  patternId: "P",
  signalId: "S",
  offsetS: 100,
  coordinatedPhase: 4,
  referencePoint: null,
  notes,
});

const run = (
  rows: PhaseSequenceEntry[],
  splits: Split[],
  over: Partial<Parameters<typeof opposingWindow>[0]> = {},
) =>
  opposingWindow({
    patternId: "P",
    signalId: "S",
    coordinatedPhase: 4,
    offsetS: 100,
    greenS: 35,
    patternSignals: [ps()],
    phaseSequence: rows,
    splits,
    ...over,
  });

describe("opposingPhaseNumber", () => {
  it("pairs the dual-ring phases", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(opposingPhaseNumber)).toEqual([5, 6, 7, 8, 1, 2, 3, 4]);
  });
  it("has no partner outside 1-8", () => {
    for (const bad of [0, 9, 11, -1, 2.5]) expect(opposingPhaseNumber(bad), String(bad)).toBeNull();
  });
});

describe("opposing window, hand-built", () => {
  // Barrier B: ring 1 runs 3 then 4; ring 2 runs 7 then 8.
  const leadLead = [
    seqRow(1, 1, 3, "B"),
    seqRow(1, 2, 4, "B"),
    seqRow(2, 1, 7, "B"),
    seqRow(2, 2, 8, "B"),
  ];

  it("starts the opposing phase earlier when less runs before it in its ring", () => {
    // 4 follows 30s of phase 3; 8 follows 15s of phase 7. So 8 starts 15s sooner.
    const w = run(leadLead, [split(3, 30), split(4, 35), split(7, 15), split(8, 50)]);
    expect(w).toEqual({ offsetS: 85, greenS: 50, basis: "ring-barrier", partnerPhase: 8 });
  });

  it("makes the two through phases end together in a lead-lead sequence", () => {
    // Rings of equal length (65s each): the greens must finish at the barrier together.
    const w = run(leadLead, [split(3, 30), split(4, 35), split(7, 15), split(8, 50)]);
    expect(w.offsetS + w.greenS).toBe(100 + 35);
  });

  it("starts them together in a lag-lag sequence", () => {
    const lagLag = [
      seqRow(1, 1, 4, "B"),
      seqRow(1, 2, 3, "B"),
      seqRow(2, 1, 8, "B"),
      seqRow(2, 2, 7, "B"),
    ];
    const w = run(lagLag, [split(3, 10), split(4, 35), split(7, 15), split(8, 20)]);
    expect(w).toMatchObject({ offsetS: 100, greenS: 20, basis: "ring-barrier" });
  });

  it("handles a mixed sequence, where one ring leads and the other lags", () => {
    const mixed = [
      seqRow(1, 1, 3, "B"),
      seqRow(1, 2, 4, "B"), // 4 starts after 30s
      seqRow(2, 1, 8, "B"),
      seqRow(2, 2, 7, "B"), // 8 starts at the barrier
    ];
    const w = run(mixed, [split(3, 30), split(4, 35), split(7, 15), split(8, 50)]);
    expect(w).toMatchObject({ offsetS: 100 - 30, greenS: 50 });
  });

  it("works the other way round, from the 8 side", () => {
    const w = run(leadLead, [split(3, 30), split(4, 35), split(7, 15), split(8, 50)], {
      coordinatedPhase: 8,
      greenS: 50,
    });
    expect(w).toMatchObject({ offsetS: 115, greenS: 35, partnerPhase: 4 });
  });

  it("counts only phases before it in its own barrier group", () => {
    // Phase 1 is in barrier A, before the barrier, so it takes no part in B's timing.
    const rows = [
      seqRow(1, 1, 1, "A"),
      seqRow(1, 2, 3, "B"),
      seqRow(1, 3, 4, "B"),
      seqRow(2, 1, 5, "A"),
      seqRow(2, 2, 7, "B"),
      seqRow(2, 3, 8, "B"),
    ];
    const w = run(rows, [
      split(1, 99),
      split(5, 77),
      split(3, 30),
      split(4, 35),
      split(7, 15),
      split(8, 50),
    ]);
    expect(w.offsetS).toBe(85);
  });

  it("gives a phase with no split no time", () => {
    // Phase 11 (no split) sits between 3 and 4 in ring 1: it adds nothing.
    const rows = [
      seqRow(1, 1, 3, "B"),
      seqRow(1, 2, 11, "B"),
      seqRow(1, 3, 4, "B"),
      seqRow(2, 1, 7, "B"),
      seqRow(2, 2, 8, "B"),
    ];
    const w = run(rows, [split(3, 30), split(4, 35), split(7, 15), split(8, 50)]);
    expect(w.offsetS).toBe(85);
  });

  it("ignores splits that belong to another pattern", () => {
    const w = run(leadLead, [
      split(3, 30),
      split(4, 35),
      split(7, 15),
      split(8, 50),
      split(3, 1, "OTHER"),
      split(7, 1, "OTHER"),
      split(8, 1, "OTHER"),
    ]);
    expect(w).toMatchObject({ offsetS: 85, greenS: 50 });
  });

  it("uses the sequence the pattern's notes name, not just the first listed", () => {
    // SEQ-01 runs 3 then 4 (4 starts late); SEQ-02 runs 4 then 3 (4 starts first).
    const rows = [
      seqRow(1, 1, 3, "B", "SEQ-01"),
      seqRow(1, 2, 4, "B", "SEQ-01"),
      seqRow(2, 1, 7, "B", "SEQ-01"),
      seqRow(2, 2, 8, "B", "SEQ-01"),
      seqRow(1, 1, 4, "B", "SEQ-02"),
      seqRow(1, 2, 3, "B", "SEQ-02"),
      seqRow(2, 1, 8, "B", "SEQ-02"),
      seqRow(2, 2, 7, "B", "SEQ-02"),
    ];
    const splits = [split(3, 30), split(4, 35), split(7, 15), split(8, 50)];
    const first = run(rows, splits); // no note: the first listed, SEQ-01
    const named = run(rows, splits, {
      patternSignals: [ps("split table 1; seq 2; offset ref BegGRN")],
    });
    expect(first.offsetS).toBe(85);
    expect(named.offsetS).toBe(100);
  });
});

describe("opposing window falls back to the coordinated window", () => {
  const rows = [
    seqRow(1, 1, 3, "B"),
    seqRow(1, 2, 4, "B"),
    seqRow(2, 1, 7, "B"),
    seqRow(2, 2, 8, "B"),
  ];
  const splits = [split(3, 30), split(4, 35), split(7, 15), split(8, 50)];
  const same = { offsetS: 100, greenS: 35, basis: "assumed", partnerPhase: null };

  it("when the signal has no PhaseSequence rows", () => {
    expect(run([], splits)).toEqual(same);
  });
  it("when the coordinated phase is blank, or has no partner", () => {
    expect(run(rows, splits, { coordinatedPhase: null })).toEqual(same);
    expect(run(rows, splits, { coordinatedPhase: 9 })).toEqual(same);
  });
  it("when the partner isn't in the sequence", () => {
    expect(
      run(
        rows.filter((r) => r.phaseId !== 8),
        splits,
      ),
    ).toEqual(same);
  });
  it("when the partner has no split to take a duration from", () => {
    expect(
      run(
        rows,
        splits.filter((s) => s.phaseId !== 8),
      ),
    ).toEqual(same);
    expect(run(rows, [...splits.filter((s) => s.phaseId !== 8), split(8, 0)])).toEqual(same);
  });
  it("when both phases are in one ring, so they can't oppose", () => {
    const oneRing = rows.map((r) => (r.phaseId === 8 ? { ...r, ring: 1, position: 3 } : r));
    expect(run(oneRing, splits)).toEqual(same);
  });
  it("when the two sit in different barrier groups", () => {
    const apart = rows.map((r) => (r.phaseId === 8 ? { ...r, barrierId: "A" } : r));
    expect(run(apart, splits)).toEqual(same);
  });
  it("when a barrier id is missing", () => {
    const blank = rows.map((r) => (r.phaseId === 4 ? { ...r, barrierId: null } : r));
    expect(run(blank, splits)).toEqual(same);
  });
});

describe("opposing window, on the real sample", () => {
  const { patternSignals, phaseSequence, splits } = sampleBag();
  const windowFor = (patternId: string, signalId: string) => {
    const row = patternSignals.find((p) => p.patternId === patternId && p.signalId === signalId)!;
    return opposingWindow({
      patternId,
      signalId,
      coordinatedPhase: row.coordinatedPhase,
      offsetS: row.offsetS ?? 0,
      greenS:
        splits.find(
          (s) =>
            s.patternId === patternId &&
            s.signalId === signalId &&
            s.phaseId === row.coordinatedPhase,
        )?.splitS ?? 0,
      patternSignals,
      phaseSequence,
      splits: splits.filter((s) => s.patternId === patternId),
    });
  };

  // Phase 4 gets 35s, its opposing phase 8 gets 50s, and 8 starts 15s earlier.
  it("works SIG-022 in pattern 1 out by hand: 61s for 50s", () => {
    expect(windowFor("CAL-SB-P01", "SIG-022")).toEqual({
      offsetS: 61,
      greenS: 50,
      basis: "ring-barrier",
      partnerPhase: 8,
    });
  });

  // An independent check on the whole file. Where both through phases are last
  // in their rings' barrier group and the two rings are the same length, they
  // must finish together at the barrier, so the opposing green has to END when
  // the coordinated one does.
  it("ends the opposing green with the coordinated one wherever the structure requires it", () => {
    let checked = 0;
    for (const row of patternSignals) {
      if (row.coordinatedPhase === null) continue;
      const w = windowFor(row.patternId, row.signalId);
      if (w.basis !== "ring-barrier") continue;

      const seqId =
        sequenceForPattern(patternSignals, phaseSequence, row.patternId, row.signalId) ??
        phaseSequence.find((r) => r.signalId === row.signalId)!.sequenceId;
      const rows = phaseSequence.filter(
        (r) => r.signalId === row.signalId && r.sequenceId === seqId,
      );
      const mine = rows.find((r) => r.phaseId === row.coordinatedPhase)!;
      const theirs = rows.find((r) => r.phaseId === w.partnerPhase)!;
      const splitOf = (phase: number | null) =>
        splits.find(
          (s) =>
            s.patternId === row.patternId && s.signalId === row.signalId && s.phaseId === phase,
        )?.splitS ?? 0;
      const group = (ring: number | null) =>
        rows
          .filter(
            (r) => r.ring === ring && r.barrierId === mine.barrierId && splitOf(r.phaseId) > 0,
          )
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const mineGroup = group(mine.ring);
      const theirGroup = group(theirs.ring);
      const total = (g: PhaseSequenceEntry[]) => g.reduce((n, r) => n + splitOf(r.phaseId), 0);

      const bothLast =
        mineGroup[mineGroup.length - 1]?.phaseId === mine.phaseId &&
        theirGroup[theirGroup.length - 1]?.phaseId === theirs.phaseId;
      if (!bothLast || total(mineGroup) !== total(theirGroup)) continue;

      const coordinatedEnd = (row.offsetS ?? 0) + splitOf(row.coordinatedPhase);
      expect(w.offsetS + w.greenS, `${row.patternId} ${row.signalId}`).toBe(coordinatedEnd);
      checked++;
    }
    // The check must actually have run, or it proves nothing.
    expect(checked).toBeGreaterThanOrEqual(4);
  });

  it("uses a real opposing phase for every coordinated signal in the sample", () => {
    for (const row of patternSignals.filter((p) => p.coordinatedPhase !== null)) {
      const w = windowFor(row.patternId, row.signalId);
      expect(w.basis, `${row.patternId} ${row.signalId}`).toBe("ring-barrier");
    }
  });
});
