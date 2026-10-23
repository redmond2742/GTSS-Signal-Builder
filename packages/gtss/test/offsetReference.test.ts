import { beforeEach, describe, expect, it } from "vitest";
import { readAllCoordination } from "../src/localStorage/coordination/entities";
import {
  offsetReferenceFor,
  parseOffsetReference,
  setPatternOffsetReference,
  splitStartShift,
  undoReferenceChange,
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
  it("understands the usual ways of writing each", () => {
    for (const t of [
      "BegGRN",
      "Begin of green",
      "beg grn",
      "BOG",
      "Start of green",
      "beginning_of_green",
    ]) {
      expect(parseOffsetReference(t), t).toBe("BegGRN");
    }
    for (const t of [
      "BegYEL",
      "Begin of yellow",
      "Start of Yellow",
      "EndGRN",
      "end of green",
      "EOG",
    ]) {
      expect(parseOffsetReference(t), t).toBe("BegYEL");
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
      offsetReferenceFor({ referencePoint: "BegYEL", notes: null }, { referencePoint: "BegGRN" }),
    ).toEqual({
      reference: "BegYEL",
      source: "pattern signal",
    });
    expect(
      offsetReferenceFor({ referencePoint: "SIG-022", notes: null }, { referencePoint: "BegYEL" }),
    ).toEqual({
      reference: "BegYEL",
      source: "pattern",
    });
  });

  // What the converted sample files actually contain: a signal id in the field,
  // and the real reference in the notes.
  it("reads 'offset ref' from the notes when the fields hold a signal id", () => {
    expect(
      offsetReferenceFor(
        { referencePoint: "SIG-022", notes: "split table 1; seq 1; offset ref BegGRN" },
        { referencePoint: "SIG-022" },
      ),
    ).toEqual({ reference: "BegGRN", source: "notes" });
    expect(
      offsetReferenceFor({ referencePoint: null, notes: "offset ref: Begin of yellow" }, undefined)
        .reference,
    ).toBe("BegYEL");
  });

  it("falls back to begin of green", () => {
    expect(offsetReferenceFor(undefined, undefined)).toEqual({
      reference: "BegGRN",
      source: "default",
    });
  });
});

describe("where the split starts", () => {
  it("starts at the offset when measured to begin of green", () => {
    expect(splitStartShift("BegGRN", 40, 5)).toBe(0);
  });

  it("starts green-time before the offset when measured to begin of yellow", () => {
    // 40 s split = 35 s green + 5 s clearance: the yellow starts 35 s into it.
    expect(splitStartShift("BegYEL", 40, 5)).toBe(-35);
    expect(splitStartShift("BegYEL", 40, 0)).toBe(-40);
  });

  it("never shifts forward, even with nonsense clearance", () => {
    expect(splitStartShift("BegYEL", 4, 9)).toBe(-0);
    expect(splitStartShift("BegYEL", 40, -3)).toBe(-40);
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
          notes: null,
        })),
      ),
    });

  it("writes the reference to the pattern and its signals, and nothing else", () => {
    seed();
    setPatternOffsetReference("P1", "BegYEL");
    const rows = readAllCoordination();
    expect(rows.patterns.map((p) => `${p.patternId}:${p.referencePoint}`)).toEqual([
      "P1:BegYEL",
      "P2:SIG-1",
    ]);
    expect(
      rows.patternSignals.map((r) => `${r.patternId}:${r.referencePoint}:${r.offsetS}`),
    ).toEqual(["P1:BegYEL:10", "P1:BegYEL:11", "P2:SIG-1:10", "P2:SIG-1:11"]);
    expect(offsetReferenceFor(rows.patternSignals[0], rows.patterns[0]).reference).toBe("BegYEL");
  });

  it("can change offsets in the same step, so greens stay where they were", () => {
    seed();
    setPatternOffsetReference("P1", "BegYEL", new Map([["SIG-2", 51]]));
    expect(readAllCoordination().patternSignals.map((r) => r.offsetS)).toEqual([10, 51, 10, 11]);
  });

  it("undoes back to exactly what was there", () => {
    seed();
    const before = JSON.stringify(readAllCoordination());
    const change = setPatternOffsetReference("P1", "BegYEL", new Map([["SIG-1", 70]]));
    expect(change).not.toBeNull();
    undoReferenceChange(change!);
    expect(JSON.stringify(readAllCoordination())).toBe(before);
  });

  it("does nothing for a pattern that isn't there, or while storage is read-only", () => {
    seed();
    expect(setPatternOffsetReference("NOPE", "BegYEL")).toBeNull();
    const before = JSON.stringify(readAllCoordination());
    setStorageReadOnly(true);
    try {
      setPatternOffsetReference("P1", "BegYEL");
    } finally {
      setStorageReadOnly(false);
    }
    expect(JSON.stringify(readAllCoordination())).toBe(before);
  });
});
