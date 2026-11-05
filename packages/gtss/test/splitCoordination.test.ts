import { beforeEach, describe, expect, it } from "vitest";
import { planCorridor } from "../src/localStorage/coordination/corridorBuilder";
import {
  COORDINATION_ENTITIES,
  readAllCoordination,
} from "../src/localStorage/coordination/entities";
import { parseSplitsTXT } from "../src/localStorage/coordination/parsers";
import {
  emptyCoordinationRows,
  type ParsedCoordination,
  type Split,
} from "../src/localStorage/coordination/rows";
import { undoSplitsChange, writeSplits } from "../src/localStorage/coordination/splitBuilder";
import {
  carryCoordinatedPhases,
  coordinatedPhaseOf,
  coordinatedSplitPhases,
} from "../src/localStorage/coordination/splitCoordination";
import * as sample from "./fixtures/coordination-sample";
import { mainStreet } from "./fixtures/gtss-intersections";

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

/** The sample export, stored. */
const seed = () => {
  const bag: ParsedCoordination = {};
  const parse = (key: string, text: string) =>
    COORDINATION_ENTITIES.find((e) => e.key === key)!.parseInto(text, bag);
  parse("patterns", sample.patternsTxt);
  parse("patternSignals", sample.patternSignalsTxt);
  parse("splits", sample.splitsTxt);
  parse("phaseSequence", sample.phaseSequenceTxt);
  COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(bag));
};
const splits = () => readAllCoordination().splits;
const setFlags = (patternId: string, signalId: string, phases: number[]) =>
  COORDINATION_ENTITIES.find((e) => e.key === "splits")!.replaceFrom({
    splits: splits().map((s) =>
      s.patternId === patternId && s.signalId === signalId
        ? { ...s, coordinatedPhase: phases.includes(s.phaseId as number) }
        : s,
    ),
  });
const row = (phaseId: number, coordinatedPhase?: boolean | null): Split => ({
  patternId: "P",
  signalId: "S",
  phaseId,
  splitS: 30,
  ...(coordinatedPhase === undefined ? {} : { coordinatedPhase }),
});

describe("reading the coordinated phase from Splits.txt", () => {
  const sampleSplits = parseSplitsTXT(sample.splitsTxt);

  it("finds each signal's, and none for a signal running free", () => {
    expect(coordinatedSplitPhases(sampleSplits, "CAL-SB-P01", "SIG-022")).toEqual([4]);
    expect(coordinatedPhaseOf(sampleSplits, "CAL-SB-P01", "SIG-022")).toBe(4);
    expect(coordinatedPhaseOf(sampleSplits, "CAL-SB-P03", "SIG-023")).toBe(8);
    expect(coordinatedPhaseOf(sampleSplits, "CAL-SB-P01", "SIG-028")).toBeNull();
    expect(coordinatedPhaseOf(sampleSplits, "CAL-SB-P05", "SIG-023")).toBeNull();
  });

  it("counts a blank as not coordinated", () => {
    expect(coordinatedPhaseOf([row(2, null), row(6)], "P", "S")).toBeNull();
    expect(coordinatedPhaseOf([row(2, null), row(6, true)], "P", "S")).toBe(6);
  });

  it("with several marked, takes the one preferred if it is marked, else the lowest", () => {
    const both = [row(2, true), row(4, false), row(6, true)];
    expect(coordinatedSplitPhases(both, "P", "S")).toEqual([2, 6]);
    expect(coordinatedPhaseOf(both, "P", "S")).toBe(2);
    expect(coordinatedPhaseOf(both, "P", "S", 6)).toBe(6);
    expect(coordinatedPhaseOf(both, "P", "S", 4)).toBe(2);
  });
});

describe("carrying coordinated phases given elsewhere", () => {
  it("marks the given phase 1 and the rest 0", () => {
    const carried = carryCoordinatedPhases(
      [row(2), row(4), row(6)],
      [{ patternId: "P", signalId: "S", phase: 6 }],
    );
    expect(carried.splits.map((s) => s.coordinatedPhase)).toEqual([false, false, true]);
    expect(carried).toMatchObject({ marked: 1, kept: 0, unplaced: [] });
  });

  it("marks every phase 0 for a signal running free", () => {
    const carried = carryCoordinatedPhases(
      [row(2), row(6)],
      [{ patternId: "P", signalId: "S", phase: null }],
    );
    expect(carried.splits.map((s) => s.coordinatedPhase)).toEqual([false, false]);
  });

  it("leaves a table that already says, even if only one row does", () => {
    const already = [row(2, null), row(6, true)];
    const carried = carryCoordinatedPhases(already, [{ patternId: "P", signalId: "S", phase: 2 }]);
    expect(carried.splits).toEqual(already);
    expect(carried).toMatchObject({ marked: 0, kept: 1 });
  });

  it("reports a phase with no row to mark, and leaves the table alone", () => {
    const carried = carryCoordinatedPhases(
      [row(2), row(6)],
      [
        { patternId: "P", signalId: "S", phase: 4 },
        // Free, with no split table at all: nothing to say, and nothing missing.
        { patternId: "P", signalId: "T", phase: null },
      ],
    );
    expect(carried.splits.map((s) => s.coordinatedPhase)).toEqual([undefined, undefined]);
    expect(carried.unplaced).toEqual([{ patternId: "P", signalId: "S", phase: 4 }]);
    expect(carried.marked).toBe(0);
  });

  it("only touches the signal and pattern named", () => {
    const other = { ...row(6), patternId: "Q" };
    const carried = carryCoordinatedPhases(
      [row(6), other],
      [{ patternId: "P", signalId: "S", phase: 6 }],
    );
    expect(carried.splits[1]).toBe(other);
  });
});

describe("writing splits with their coordinated phases", () => {
  it("marks a signal's rows, new and existing, and undoes exactly", () => {
    seed();
    const before = JSON.stringify(readAllCoordination());
    const change = writeSplits(
      "CAL-SB-P01",
      new Map([["SIG-022", { 1: 5, 2: 44, 4: 35 }]]),
      new Map([["SIG-022", new Set([8])]]),
    );
    const rows = splits().filter((s) => s.patternId === "CAL-SB-P01" && s.signalId === "SIG-022");
    expect(rows.map((s) => `${s.phaseId}:${s.splitS}:${s.coordinatedPhase}`)).toEqual([
      "2:44:false",
      "3:30:false",
      "4:35:false",
      "6:49:false",
      "7:15:false",
      "8:50:true",
      "1:5:false",
    ]);
    // φ4's and φ8's splits didn't change but their flags did, so they count as updates.
    expect(change.updated.map((u) => u.phaseId).sort()).toEqual([2, 4, 8]);
    undoSplitsChange(change);
    expect(JSON.stringify(readAllCoordination())).toBe(before);
  });

  it("puts back rows saved before the column existed without one", () => {
    const old: Split[] = [
      { patternId: "P", signalId: "S", phaseId: 2, splitS: 40 },
      { patternId: "P", signalId: "S", phaseId: 6, splitS: 40 },
    ];
    COORDINATION_ENTITIES.find((e) => e.key === "splits")!.replaceFrom({ splits: old });
    const before = JSON.stringify(splits());
    const change = writeSplits("P", new Map([["S", { 2: 45 }]]), new Map([["S", new Set([2])]]));
    undoSplitsChange(change);
    expect(JSON.stringify(splits())).toBe(before);
  });

  it("leaves flags as they were when not told", () => {
    seed();
    setFlags("CAL-SB-P01", "SIG-022", [4, 8]);
    writeSplits("CAL-SB-P01", new Map([["SIG-022", { 4: 40 }]]));
    expect(coordinatedSplitPhases(splits(), "CAL-SB-P01", "SIG-022")).toEqual([4, 8]);
  });
});

describe("building a corridor", () => {
  it("marks each signal's coordinated phase in the splits it builds", () => {
    const { rows } = planCorridor(
      {
        corridorId: "MAIN-SB",
        direction: "SB",
        signalIds: ["A", "B"],
        perSignal: { B: { coordinatedPhase: null } },
        pattern: { patternId: "P1", patternNumber: 1, cycleS: 100 },
      },
      mainStreet(),
      emptyCoordinationRows(),
    );
    expect(coordinatedSplitPhases(rows.splits ?? [], "P1", "A")).toEqual([6]);
    // B was told to run free: none of its phases is coordinated.
    expect(coordinatedSplitPhases(rows.splits ?? [], "P1", "B")).toEqual([]);
    expect(
      rows.splits?.filter((s) => s.signalId === "B").every((s) => s.coordinatedPhase === false),
    ).toBe(true);
  });
});
