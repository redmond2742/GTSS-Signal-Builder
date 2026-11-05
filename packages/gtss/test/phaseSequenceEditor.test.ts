import { beforeEach, describe, expect, it } from "vitest";
import { standardPhaseSequence } from "../src/localStorage/coordination/corridorBuilder";
import {
  COORDINATION_ENTITIES,
  readAllCoordination,
} from "../src/localStorage/coordination/entities";
import {
  parsePatternSignalsTXT,
  parsePhaseSequenceTXT,
} from "../src/localStorage/coordination/parsers";
import {
  addBarrierGroup,
  addPhase,
  addRing,
  deletePhaseSequence,
  layoutFromRows,
  movePhase,
  patternSequences,
  placedPhases,
  removeBarrierGroup,
  removePhase,
  removeRing,
  rowsFromLayout,
  sameLayout,
  sequenceNumberFor,
  setPatternSequences,
  standardLayout,
  suggestSequenceId,
  undoPatternSequenceChange,
  undoSequenceChange,
  withSequenceInNotes,
  writePhaseSequence,
  type SequenceLayout,
} from "../src/localStorage/coordination/phaseSequenceEditor";
import type { PhaseSequenceEntry } from "../src/localStorage/coordination/rows";
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

const sampleRows = parsePhaseSequenceTXT(sample.phaseSequenceTxt);
const rowsOf = (rows: readonly PhaseSequenceEntry[], signalId: string, sequenceId: string) =>
  rows.filter((r) => r.signalId === signalId && r.sequenceId === sequenceId);
const seed = () =>
  COORDINATION_ENTITIES.find((e) => e.key === "phaseSequence")!.replaceFrom({
    phaseSequence: sampleRows,
  });
const stored = () => readAllCoordination().phaseSequence;

describe("laying a sequence out", () => {
  it("reads every sequence in the sample and writes it back unchanged", () => {
    const sequences = Array.from(new Set(sampleRows.map((r) => `${r.signalId}|${r.sequenceId}`)));
    expect(sequences.length).toBeGreaterThan(10);
    for (const key of sequences) {
      const [signalId, sequenceId] = key.split("|");
      const original = rowsOf(sampleRows, signalId, sequenceId);
      const layout = layoutFromRows(sampleRows, signalId, sequenceId);
      expect(rowsFromLayout(signalId, sequenceId, layout, original), key).toEqual(original);
    }
  });

  it("matches the corridor builder's standard sequence", () => {
    for (const phases of [
      [1, 2, 3, 4, 5, 6, 7, 8],
      [2, 4, 6, 8],
      [2, 3, 4, 6],
    ]) {
      expect(rowsFromLayout("S", "SEQ-01", standardLayout(phases))).toEqual(
        standardPhaseSequence("S", phases),
      );
    }
  });

  it("places all eight phases when the signal has none to go on", () => {
    expect(placedPhases(standardLayout([]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("numbers positions up through each ring, across its barriers", () => {
    const layout: SequenceLayout = {
      barriers: ["A", "B"],
      rings: [{ ring: 1, groups: [[2, 1], [4]] }],
    };
    expect(
      rowsFromLayout("S", "Q", layout).map((r) => `${r.position}:${r.phaseId}:${r.barrierId}`),
    ).toEqual(["1:2:A", "2:1:A", "3:4:B"]);
  });

  it("keeps a phase's progression wherever it moves", () => {
    const previous = standardPhaseSequence("S", [1, 2, 3, 4]).map((r) =>
      r.phaseId === 2 ? { ...r, progression: "SB" } : r,
    );
    const moved = movePhase(layoutFromRows(previous, "S", "SEQ-01"), 2, -1);
    const rows = rowsFromLayout("S", "SEQ-01", moved, previous);
    expect(rows.find((r) => r.phaseId === 2)).toMatchObject({ position: 1, progression: "SB" });
    expect(rows.find((r) => r.phaseId === 1)).not.toHaveProperty("progression");
  });
});

describe("editing a layout", () => {
  const base = () => layoutFromRows(sampleRows, "SIG-022", "SEQ-01");

  it("turns SIG-022's lead sequence into its lag one by moving phases", () => {
    // SEQ-01 runs 3, 4, 11 and 7, 8, 15 after the barrier; SEQ-11 runs 11, 4, 3 and 15, 8, 7.
    let layout = base();
    layout = movePhase(movePhase(layout, 11, -1), 11, -1);
    layout = movePhase(layout, 3, 1);
    layout = movePhase(movePhase(layout, 15, -1), 15, -1);
    layout = movePhase(layout, 7, 1);
    // Built from scratch, so without the file's blank progression column.
    const lag = rowsOf(sampleRows, "SIG-022", "SEQ-11").map((r) => {
      const { progression: _p, ...rest } = r;
      void _p;
      return rest;
    });
    expect(rowsFromLayout("SIG-022", "SEQ-11", layout)).toEqual(lag);
  });

  it("crosses a barrier at the edge of a group, and stops at the ends of the ring", () => {
    const layout = standardLayout([1, 2, 3, 4]);
    expect(movePhase(layout, 2, 1).rings[0].groups).toEqual([[1], [2, 3, 4]]);
    expect(movePhase(layout, 3, -1).rings[0].groups).toEqual([[1, 2, 3], [4]]);
    expect(movePhase(layout, 1, -1)).toBe(layout);
    expect(movePhase(layout, 4, 1)).toBe(layout);
    expect(movePhase(layout, 9, 1)).toBe(layout);
  });

  it("adds a phase at the end of a group, moving it if it was elsewhere", () => {
    const layout = standardLayout([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(addPhase(layout, 2, 1, 9).rings[1].groups[1]).toEqual([7, 8, 9]);
    const moved = addPhase(layout, 2, 0, 2);
    expect(moved.rings[0].groups[0]).toEqual([1]);
    expect(moved.rings[1].groups[0]).toEqual([5, 6, 2]);
    expect(addPhase(layout, 3, 0, 9)).toBe(layout);
  });

  it("removes a phase", () => {
    expect(placedPhases(removePhase(standardLayout([]), 5))).toEqual([1, 2, 3, 4, 6, 7, 8]);
  });

  it("adds and removes barrier groups and rings, only when empty", () => {
    const layout = addBarrierGroup(standardLayout([]));
    expect(layout.barriers).toEqual(["A", "B", "C"]);
    expect(layout.rings.every((r) => r.groups.length === 3)).toBe(true);
    expect(removeBarrierGroup(layout, 2).barriers).toEqual(["A", "B"]);
    expect(removeBarrierGroup(layout, 0)).toBe(layout);

    const four = addRing(addRing(layout));
    expect(four.rings.map((r) => r.ring)).toEqual([1, 2, 3, 4]);
    expect(addRing(four)).toBe(four);
    expect(removeRing(four, 4).rings.map((r) => r.ring)).toEqual([1, 2, 3]);
    expect(removeRing(four, 1)).toBe(four);
  });

  it("leaves the layout it was given alone", () => {
    const layout = standardLayout([]);
    const before = JSON.stringify(layout);
    movePhase(layout, 2, 1);
    addPhase(layout, 1, 0, 9);
    removePhase(layout, 1);
    addBarrierGroup(layout);
    addRing(layout);
    expect(JSON.stringify(layout)).toBe(before);
  });

  it("knows when an edit came back to where it started", () => {
    const layout = standardLayout([]);
    expect(sameLayout(movePhase(movePhase(layout, 1, 1), 1, -1), layout)).toBe(true);
    expect(sameLayout(movePhase(layout, 1, 1), layout)).toBe(false);
    // An empty group writes nothing, so it makes no difference.
    expect(sameLayout(addBarrierGroup(layout), layout)).toBe(true);
  });
});

describe("naming a new sequence", () => {
  const patternSignals = parsePatternSignalsTXT(sample.patternSignalsTxt);

  it("follows on from the signal's highest number", () => {
    expect(suggestSequenceId(sampleRows, patternSignals, "SIG-022")).toBe("SEQ-12");
  });

  it("takes the one the notes name when the signal has none yet", () => {
    // SIG-024's notes say seq 4 in P01 and seq 7 in P03: a tie, so the lower.
    const without = sampleRows.filter((r) => r.signalId !== "SIG-024");
    expect(suggestSequenceId(without, patternSignals, "SIG-024")).toBe("SEQ-04");
  });

  it("starts at SEQ-01 with nothing to go on", () => {
    expect(suggestSequenceId(sampleRows, patternSignals, "SIG-NEW")).toBe("SEQ-01");
  });
});

describe("saving a sequence", () => {
  it("replaces a sequence's rows where they were, and undoes exactly", () => {
    seed();
    const before = JSON.stringify(stored());
    const at = stored().findIndex((r) => r.signalId === "SIG-027" && r.sequenceId === "SEQ-10");
    const layout = movePhase(layoutFromRows(stored(), "SIG-027", "SEQ-10"), 1, -1);
    const rows = rowsFromLayout("SIG-027", "SEQ-10", layout, stored());
    const change = writePhaseSequence("SIG-027", "SEQ-10", rows);

    expect(stored()).toHaveLength(sampleRows.length);
    expect(stored().slice(at, at + rows.length)).toEqual(rows);
    expect(change.previous).toEqual(rowsOf(sampleRows, "SIG-027", "SEQ-10"));
    undoSequenceChange(change);
    expect(JSON.stringify(stored())).toBe(before);
  });

  it("puts a new sequence after the signal's others", () => {
    seed();
    const before = JSON.stringify(stored());
    const rows = rowsFromLayout("SIG-027", "SEQ-11", standardLayout([]));
    const change = writePhaseSequence("SIG-027", "SEQ-11", rows);
    const all = stored();
    const lastOld = all
      .map((r) => r.sequenceId === "SEQ-10" && r.signalId === "SIG-027")
      .lastIndexOf(true);
    expect(all.slice(lastOld + 1, lastOld + 1 + rows.length)).toEqual(rows);
    expect(change.previous).toEqual([]);
    undoSequenceChange(change);
    expect(JSON.stringify(stored())).toBe(before);
  });

  it("starts a signal's first sequence at the end of the file", () => {
    seed();
    const rows = rowsFromLayout("SIG-NEW", "SEQ-01", standardLayout([2, 4, 6, 8]));
    writePhaseSequence("SIG-NEW", "SEQ-01", rows);
    expect(stored().slice(-rows.length)).toEqual(rows);
  });

  it("deletes a sequence, and undoes that too", () => {
    seed();
    const before = JSON.stringify(stored());
    const change = deletePhaseSequence("SIG-022", "SEQ-11");
    expect(rowsOf(stored(), "SIG-022", "SEQ-11")).toEqual([]);
    expect(rowsOf(stored(), "SIG-022", "SEQ-01")).toHaveLength(12);
    undoSequenceChange(change);
    expect(JSON.stringify(stored())).toBe(before);
  });

  it("is blocked by the storage read-only guard", () => {
    seed();
    const before = JSON.stringify(stored());
    setStorageReadOnly(true);
    try {
      deletePhaseSequence("SIG-022", "SEQ-11");
    } finally {
      setStorageReadOnly(false);
    }
    expect(JSON.stringify(stored())).toBe(before);
  });
});

describe("which patterns run which sequence", () => {
  const patternSignals = parsePatternSignalsTXT(sample.patternSignalsTxt);
  const seedPatterns = () =>
    COORDINATION_ENTITIES.find((e) => e.key === "patternSignals")!.replaceFrom({ patternSignals });
  const storedPatterns = () => readAllCoordination().patternSignals;
  const notesOf = (patternId: string, signalId: string) =>
    storedPatterns().find((p) => p.patternId === patternId && p.signalId === signalId)?.notes;

  it("reads each pattern's from its notes, else the signal's first", () => {
    expect(patternSequences(patternSignals, sampleRows, "SIG-022")).toEqual([
      { patternId: "CAL-SB-P01", sequenceId: "SEQ-01", named: true },
      { patternId: "CAL-SB-P03", sequenceId: "SEQ-01", named: true },
      { patternId: "CAL-SB-P05", sequenceId: "SEQ-11", named: true },
    ]);
    // SIG-028's notes name none; give it a sequence and every pattern runs it by default.
    const withOne = [...sampleRows, ...rowsFromLayout("SIG-028", "SEQ-01", standardLayout([]))];
    expect(patternSequences(patternSignals, withOne, "SIG-028").map((p) => p.named)).toEqual([
      false,
      false,
      false,
    ]);
    expect(patternSequences(patternSignals, sampleRows, "SIG-028")[0].sequenceId).toBeNull();
  });

  it("names a sequence by the number its id ends in, only if no other there shares it", () => {
    expect(sequenceNumberFor("SEQ-11", ["SEQ-01", "SEQ-11"])).toBe(11);
    expect(sequenceNumberFor("LEADLAG", ["SEQ-01", "LEADLAG"])).toBeNull();
    expect(sequenceNumberFor("SEQ-1", ["SEQ-1", "ALT-01"])).toBeNull();
  });

  it("changes a note's seq number and leaves the rest, or adds one", () => {
    expect(withSequenceInNotes("split table 3; seq 1; offset ref BegGreen", 11)).toBe(
      "split table 3; seq 11; offset ref BegGreen",
    );
    expect(withSequenceInNotes("Sequence #2 here", 5)).toBe("Sequence #5 here");
    expect(withSequenceInNotes("Free at this signal (pattern 1 cycle 0)", 1)).toBe(
      "Free at this signal (pattern 1 cycle 0); seq 1",
    );
    expect(withSequenceInNotes(null, 3)).toBe("seq 3");
  });

  it("points a pattern at a sequence through its notes, and undoes exactly", () => {
    seedPatterns();
    const before = JSON.stringify(storedPatterns());
    const change = setPatternSequences(
      "SIG-022",
      new Map([
        ["CAL-SB-P03", "SEQ-11"],
        // Already runs it: nothing to write.
        ["CAL-SB-P05", "SEQ-11"],
      ]),
      ["SEQ-01", "SEQ-11"],
    );
    expect(notesOf("CAL-SB-P03", "SIG-022")).toBe(
      "Reference intersection; split table 3; seq 11; offset ref BegGreen",
    );
    expect(change.previous.map((p) => p.patternId)).toEqual(["CAL-SB-P03"]);
    // Other signals in the same pattern are left alone.
    expect(notesOf("CAL-SB-P03", "SIG-023")).toBe(
      patternSignals.find((p) => p.patternId === "CAL-SB-P03" && p.signalId === "SIG-023")?.notes,
    );
    expect(
      patternSequences(storedPatterns(), sampleRows, "SIG-022").find(
        (p) => p.patternId === "CAL-SB-P03",
      ),
    ).toEqual({ patternId: "CAL-SB-P03", sequenceId: "SEQ-11", named: true });
    undoPatternSequenceChange(change);
    expect(JSON.stringify(storedPatterns())).toBe(before);
  });

  it("skips a sequence it can't name, and is blocked while read-only", () => {
    seedPatterns();
    const before = JSON.stringify(storedPatterns());
    setPatternSequences("SIG-022", new Map([["CAL-SB-P01", "LEADLAG"]]), ["SEQ-01", "LEADLAG"]);
    expect(JSON.stringify(storedPatterns())).toBe(before);
    setStorageReadOnly(true);
    try {
      setPatternSequences("SIG-022", new Map([["CAL-SB-P01", "SEQ-11"]]), ["SEQ-01", "SEQ-11"]);
    } finally {
      setStorageReadOnly(false);
    }
    expect(JSON.stringify(storedPatterns())).toBe(before);
  });
});
