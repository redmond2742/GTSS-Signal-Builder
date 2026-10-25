import { beforeEach, describe, expect, it } from "vitest";
import {
  COORDINATION_ENTITIES,
  readAllCoordination,
} from "../src/localStorage/coordination/entities";
import {
  offsetReferenceFor,
  parseOffsetReference,
  setPatternOffsetReference,
  splitStartShift,
  undoReferenceChange,
  withNotesReference,
} from "../src/localStorage/coordination/offsetReference";
import { applyBuild } from "../src/localStorage/coordination/corridorBuilder";
import { setStorageReadOnly } from "../src/localStorage/write-guard";

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

describe("reading an offset reference", () => {
  it("reads the converter's spelling and the older short one alike", () => {
    expect(parseOffsetReference("BegGreen")).toBe("BegGreen");
    expect(parseOffsetReference("BegGRN")).toBe("BegGreen");
    expect(parseOffsetReference("BegYellow")).toBe("BegYellow");
    expect(parseOffsetReference("BegYEL")).toBe("BegYellow");
  });

  it("understands the usual ways of writing each", () => {
    for (const t of [
      "BegGreen",
      "Begin of green",
      "beg grn",
      "BOG",
      "Start of green",
      "beginning_of_green",
    ]) {
      expect(parseOffsetReference(t), t).toBe("BegGreen");
    }
    for (const t of [
      "BegYellow",
      "Begin of yellow",
      "Start of Yellow",
      "EndGRN",
      "end of green",
      "EOG",
    ]) {
      expect(parseOffsetReference(t), t).toBe("BegYellow");
    }
  });

  it("does not mistake a signal id for a reference", () => {
    expect(parseOffsetReference("SIG-022")).toBeNull();
    expect(parseOffsetReference("")).toBeNull();
    expect(parseOffsetReference(null)).toBeNull();
  });
});

describe("which reference a signal uses", () => {
  it("prefers its own row, then the pattern's", () => {
    expect(
      offsetReferenceFor(
        { referencePoint: "BegYellow", notes: null },
        { referencePoint: "BegGreen" },
      ),
    ).toEqual({
      reference: "BegYellow",
      source: "pattern signal",
    });
    expect(
      offsetReferenceFor(
        { referencePoint: "SIG-022", notes: null },
        { referencePoint: "BegYellow" },
      ),
    ).toEqual({
      reference: "BegYellow",
      source: "pattern",
    });
  });

  // What the converted sample files actually contain: a signal id in the field,
  // and the real reference in the notes.
  it("reads 'offset ref' from the notes when the fields hold a signal id", () => {
    expect(
      offsetReferenceFor(
        { referencePoint: "SIG-022", notes: "split table 1; seq 1; offset ref BegGreen" },
        { referencePoint: "SIG-022" },
      ),
    ).toEqual({ reference: "BegGreen", source: "notes" });
    expect(
      offsetReferenceFor({ referencePoint: null, notes: "offset ref: Begin of yellow" }, undefined)
        .reference,
    ).toBe("BegYellow");
  });

  it("falls back to begin of green", () => {
    expect(offsetReferenceFor(undefined, undefined)).toEqual({
      reference: "BegGreen",
      source: "default",
    });
  });
});

describe("where the split starts", () => {
  it("starts at the offset when measured to begin of green", () => {
    expect(splitStartShift("BegGreen", 40, 5)).toBe(0);
  });

  it("starts green-time before the offset when measured to begin of yellow", () => {
    // 40 s split = 35 s green + 5 s clearance: the yellow starts 35 s into it.
    expect(splitStartShift("BegYellow", 40, 5)).toBe(-35);
    expect(splitStartShift("BegYellow", 40, 0)).toBe(-40);
  });

  it("never shifts forward, even with nonsense clearance", () => {
    expect(splitStartShift("BegYellow", 4, 9)).toBe(-0);
    expect(splitStartShift("BegYellow", 40, -3)).toBe(-40);
  });
});

describe("changing a pattern's offset reference", () => {
  const seed = () =>
    applyBuild({
      patterns: [
        {
          patternId: "P1",
          patternNumber: 1,
          corridorId: "C",
          cycleLengthS: 100,
          referencePoint: "SIG-1",
          description: null,
        },
        {
          patternId: "P2",
          patternNumber: 2,
          corridorId: "C",
          cycleLengthS: 100,
          referencePoint: "SIG-1",
          description: null,
        },
      ],
      patternSignals: ["P1", "P2"].flatMap((patternId) =>
        ["SIG-1", "SIG-2"].map((signalId, i) => ({
          patternId,
          signalId,
          offsetS: 10 + i,
          coordinatedPhase: 2,
          referencePoint: "SIG-1",
          // As converted files write them.
          notes: `split table 1; seq 1; offset ref BegGreen`,
        })),
      ),
    });

  it("writes the reference to the pattern and its notes, keeping the reference signal", () => {
    seed();
    setPatternOffsetReference("P1", "BegYellow");
    const rows = readAllCoordination();
    expect(rows.patterns.map((p) => `${p.patternId}:${p.referencePoint}`)).toEqual([
      "P1:BegYellow",
      "P2:SIG-1",
    ]);
    // PatternSignals' reference_point names the reference intersection: kept.
    expect(
      rows.patternSignals.map((r) => `${r.patternId}:${r.referencePoint}:${r.offsetS}`),
    ).toEqual(["P1:SIG-1:10", "P1:SIG-1:11", "P2:SIG-1:10", "P2:SIG-1:11"]);
    // The notes say the same as the pattern, so the file doesn't contradict itself.
    expect(rows.patternSignals.map((r) => r.notes)).toEqual([
      "split table 1; seq 1; offset ref BegYellow",
      "split table 1; seq 1; offset ref BegYellow",
      "split table 1; seq 1; offset ref BegGreen",
      "split table 1; seq 1; offset ref BegGreen",
    ]);
    expect(offsetReferenceFor(rows.patternSignals[0], rows.patterns[0])).toEqual({
      reference: "BegYellow",
      source: "pattern",
    });
  });

  it("replaces an offset reference held in a PatternSignals row's reference_point", () => {
    seed();
    // As GTSS Builder wrote them before the converter's layout settled.
    const P1 = readAllCoordination().patternSignals.map((r) =>
      r.patternId === "P1" ? { ...r, referencePoint: "BegGRN", notes: null } : r,
    );
    COORDINATION_ENTITIES.find((e) => e.key === "patternSignals")!.replaceFrom({
      patternSignals: P1,
    });
    setPatternOffsetReference("P1", "BegYellow");
    const after = readAllCoordination().patternSignals.filter((r) => r.patternId === "P1");
    expect(after.map((r) => `${r.referencePoint}:${r.notes}`)).toEqual([
      "BegYellow:null",
      "BegYellow:null",
    ]);
  });

  it("rewrites only the reference in the notes, however it was written", () => {
    expect(withNotesReference("seq 4; offset ref BegGRN; split table 2", "BegYellow")).toBe(
      "seq 4; offset ref BegYellow; split table 2",
    );
    expect(withNotesReference("Offset Reference: begin of green", "BegYellow")).toBe(
      "Offset Reference: BegYellow",
    );
    expect(withNotesReference("no reference here", "BegYellow")).toBe("no reference here");
    expect(withNotesReference(null, "BegYellow")).toBeNull();
  });

  it("can change offsets in the same step, so greens stay where they were", () => {
    seed();
    setPatternOffsetReference("P1", "BegYellow", new Map([["SIG-2", 51]]));
    expect(readAllCoordination().patternSignals.map((r) => r.offsetS)).toEqual([10, 51, 10, 11]);
  });

  it("undoes back to exactly what was there", () => {
    seed();
    const before = JSON.stringify(readAllCoordination());
    const change = setPatternOffsetReference("P1", "BegYellow", new Map([["SIG-1", 70]]));
    expect(change).not.toBeNull();
    undoReferenceChange(change!);
    expect(JSON.stringify(readAllCoordination())).toBe(before);
  });

  it("does nothing for a pattern that isn't there, or while storage is read-only", () => {
    seed();
    expect(setPatternOffsetReference("NOPE", "BegYellow")).toBeNull();
    const before = JSON.stringify(readAllCoordination());
    setStorageReadOnly(true);
    try {
      setPatternOffsetReference("P1", "BegYellow");
    } finally {
      setStorageReadOnly(false);
    }
    expect(JSON.stringify(readAllCoordination())).toBe(before);
  });
});
