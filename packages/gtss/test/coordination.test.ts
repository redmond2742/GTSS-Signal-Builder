import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllCoordination,
  COORDINATION_ENTITIES,
  deleteCoordinationBySignal,
  detectCoordinationFile,
  readAllCoordination,
  renameSignalInCoordination,
  updateCoordinationSignalId,
} from "../src/localStorage/coordination/entities";
import {
  applyCorridorMove,
  moveCorridorSignal,
  sortBySequence,
} from "../src/localStorage/coordination/corridor-order";
import {
  identityOf,
  type CorridorSignal,
  type ParsedCoordination,
} from "../src/localStorage/coordination/rows";
import { resolveCoordinationScope, UNSCOPED } from "../src/localStorage/coordination/scope";
import { validateCoordination } from "../src/localStorage/coordination/validate";
import { clearAllData } from "../src/localStorage/clearAll";
import { importData } from "../src/localStorage/imports";
import { signalStorage } from "../src/localStorage/storage/signals";
import { setStorageReadOnly } from "../src/localStorage/write-guard";
import * as sample from "./fixtures/coordination-sample";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const entity = (key: string) => {
  const found = COORDINATION_ENTITIES.find((e) => e.key === key);
  if (!found) throw new Error(`no entity ${key}`);
  return found;
};

/** The whole sample export, parsed. */
const parseSample = (): ParsedCoordination => {
  const bag: ParsedCoordination = {};
  entity("corridors").parseInto(sample.corridorsTxt, bag);
  entity("corridorSignals").parseInto(sample.corridorSignalsTxt, bag);
  entity("coordination").parseInto(sample.coordinationTxt, bag);
  entity("patterns").parseInto(sample.patternsTxt, bag);
  entity("patternSignals").parseInto(sample.patternSignalsTxt, bag);
  entity("splits").parseInto(sample.splitsTxt, bag);
  entity("schedule").parseInto(sample.scheduleTxt, bag);
  entity("phaseSequence").parseInto(sample.phaseSequenceTxt, bag);
  return bag;
};

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
});

describe("coordination parsers", () => {
  it("parses the real export to the expected row counts", () => {
    const bag = parseSample();
    expect(bag.corridors).toHaveLength(1);
    expect(bag.corridorSignals).toHaveLength(8);
    expect(bag.coordination).toHaveLength(1);
    expect(bag.patterns).toHaveLength(4);
    // 3 coordinated patterns x 8 signals. The fourth pattern (CAL-SB-FREE) has
    // no per-signal rows at all — free operation is expressed by the pattern's
    // cycle length of 0, not by 8 rows of zeroes.
    expect(bag.patternSignals).toHaveLength(24);
    expect(bag.splits).toHaveLength(100);
    expect(bag.schedule).toHaveLength(11);
    expect(bag.phaseSequence).toHaveLength(104);
  });

  it("keeps a blank coordinated_phase as null rather than 0", () => {
    const bag = parseSample();
    // SIG-028 runs free in pattern 1: the converter leaves the column empty,
    // which must not become phase 0.
    const free = bag.patternSignals?.find(
      (p) => p.patternId === "CAL-SB-P01" && p.signalId === "SIG-028",
    );
    expect(free?.coordinatedPhase).toBeNull();
    expect(free?.offsetS).toBe(0);
  });

  it("reads the free pattern's cycle length as 0, not null", () => {
    const bag = parseSample();
    const free = bag.patterns?.find((p) => p.patternId === "CAL-SB-FREE");
    expect(free?.cycleLengthS).toBe(0);
    expect(free?.patternNumber).toBe(254);
  });

  it("reports every bad row in one error rather than the first", () => {
    const bad = ["corridor_id,sequence,signal_id,direction", ",1,SIG-1,SB", "C-1,2,,SB"].join("\n");
    expect(() => entity("corridorSignals").parseInto(bad, {})).toThrow(
      /corridor_id is required[\s\S]*signal_id is required/,
    );
  });
});

describe("coordination round-trip", () => {
  it("regenerates byte-identical CSV for every file", () => {
    const bag = parseSample();
    const sources: Record<string, string> = {
      corridors: sample.corridorsTxt,
      corridorSignals: sample.corridorSignalsTxt,
      coordination: sample.coordinationTxt,
      patterns: sample.patternsTxt,
      patternSignals: sample.patternSignalsTxt,
      splits: sample.splitsTxt,
      schedule: sample.scheduleTxt,
      phaseSequence: sample.phaseSequenceTxt,
    };
    for (const e of COORDINATION_ENTITIES) {
      expect(e.renderFrom(bag, UNSCOPED), `${e.filename} round-trip`).toBe(sources[e.key]);
    }
  });

  it("emits a header for an empty collection so the file is still valid", () => {
    expect(entity("splits").renderFrom({ splits: [] }, UNSCOPED)).toBe(
      "pattern_id,signal_id,phase_id,split_s\n",
    );
  });
});

describe("coordination storage", () => {
  it("replaces, reloads and clears", () => {
    const bag = parseSample();
    COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(bag));

    expect(readAllCoordination().splits).toHaveLength(100);
    clearAllCoordination();
    expect(readAllCoordination().splits).toHaveLength(0);
  });

  it("merges without duplicating, even re-importing the same file twice", () => {
    const bag = parseSample();
    COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(bag));
    COORDINATION_ENTITIES.forEach((e) => e.mergeFrom(parseSample()));

    const after = readAllCoordination();
    expect(after.splits).toHaveLength(100);
    expect(after.corridorSignals).toHaveLength(8);
    expect(after.phaseSequence).toHaveLength(104);
  });

  it("collapses duplicates inside a single incoming file", () => {
    // The six original entities build their dedupe set from existing rows only,
    // so an intra-file duplicate slips through. This one must not.
    const doubled = [
      "corridor_id,sequence,signal_id,direction",
      "C-1,1,SIG-1,SB",
      "C-1,1,SIG-1,SB",
    ].join("\n");
    const bag: ParsedCoordination = {};
    entity("corridorSignals").parseInto(doubled, bag);
    entity("corridorSignals").mergeFrom(bag);
    expect(readAllCoordination().corridorSignals).toHaveLength(1);
  });

  it("treats a present-but-empty file as a deliberate clear", () => {
    entity("splits").replaceFrom(parseSample());
    expect(readAllCoordination().splits).toHaveLength(100);
    entity("splits").replaceFrom({ splits: [] });
    expect(readAllCoordination().splits).toHaveLength(0);
  });
});

describe("signal fan-out", () => {
  beforeEach(() => {
    const bag = parseSample();
    COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(bag));
  });

  it("follows a signal rename across all four signal-scoped files", () => {
    updateCoordinationSignalId("SIG-022", "SIG-999");
    const after = readAllCoordination();
    expect(after.corridorSignals.some((r) => r.signalId === "SIG-022")).toBe(false);
    expect(after.corridorSignals.some((r) => r.signalId === "SIG-999")).toBe(true);
    expect(after.patternSignals.some((r) => r.signalId === "SIG-999")).toBe(true);
    expect(after.splits.some((r) => r.signalId === "SIG-999")).toBe(true);
    expect(after.phaseSequence.some((r) => r.signalId === "SIG-999")).toBe(true);
  });

  it("removes a deleted signal's rows rather than orphaning them", () => {
    deleteCoordinationBySignal("SIG-022");
    const after = readAllCoordination();
    expect(after.corridorSignals.some((r) => r.signalId === "SIG-022")).toBe(false);
    expect(after.splits.some((r) => r.signalId === "SIG-022")).toBe(false);
    // Files with no signal_id are untouched.
    expect(after.patterns).toHaveLength(4);
  });
});

describe("filename detection", () => {
  // The three names that the legacy ordered `includes` chain would misroute:
  // "signal" claims the first two, "phase" claims the third.
  it.each([
    ["corridorSignals.txt", "corridorSignals"],
    ["PatternSignals.txt", "patternSignals"],
    ["PhaseSequence.txt", "phaseSequence"],
    ["corridors.txt", "corridors"],
    ["Patterns.txt", "patterns"],
    ["Splits.txt", "splits"],
    ["Schedule.txt", "schedule"],
    ["Coordination.txt", "coordination"],
  ])("routes %s to %s", (filename, expected) => {
    expect(detectCoordinationFile(filename)?.key).toBe(expected);
  });

  it("ignores files that belong to the original GTSS export", () => {
    for (const name of ["signals.txt", "phases.txt", "approaches.txt", "detectors.txt"]) {
      expect(detectCoordinationFile(name), name).toBeNull();
    }
  });
});

describe("export scope", () => {
  it("keeps everything when unfiltered", () => {
    const bag = parseSample();
    COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(bag));
    const scope = resolveCoordinationScope(null, readAllCoordination());
    expect(entity("corridors").render(scope)).toContain("CAL-SB");
  });

  it("drops a corridor whose signals are all filtered out", () => {
    const bag = parseSample();
    COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(bag));
    const rows = readAllCoordination();

    // No signals in scope -> nothing reachable survives.
    const empty = resolveCoordinationScope([], rows);
    expect(entity("corridors").render(empty).trim()).toBe(
      "corridor_id,name,description,primary_direction",
    );
    expect(entity("patterns").render(empty).trim()).toBe(
      "pattern_id,pattern_number,corridor_id,cycle_length_s,reference_point,description",
    );

    // One signal in scope -> its corridor, and the patterns on it, come back.
    const partial = resolveCoordinationScope(["SIG-022"], rows);
    expect(entity("corridors").render(partial)).toContain("CAL-SB");
    expect(entity("corridorSignals").render(partial).split("\n")).toHaveLength(2);
  });
});

describe("identity", () => {
  it("does not collide when a component already contains a hyphen", () => {
    // The existing approach dedupe key joins with "-", so "A-1"+"2" and
    // "A"+"1-2" produce the same string. The unit separator cannot.
    expect(identityOf("A-1", "2")).not.toBe(identityOf("A", "1-2"));
  });

  it("normalises numbers, strings, null and undefined consistently", () => {
    expect(identityOf("P", 1)).toBe(identityOf("P", "1"));
    expect(identityOf("P", null)).toBe(identityOf("P", undefined));
  });
});

describe("validation", () => {
  const validate = () => {
    const bag = parseSample();
    COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(bag));
    return validateCoordination(readAllCoordination());
  };

  it("finds no referential errors in the real export", () => {
    expect(validate().filter((i) => i.level === "error")).toEqual([]);
  });

  // The converter emits its own warnings.txt alongside the zip; these are the
  // split-sum mismatches it reports, so they are a real expected-output fixture
  // rather than a guess.
  it.each([
    ["CAL-SB-P01", "SIG-023", 120, 114],
    ["CAL-SB-P01", "SIG-024", 120, 114],
    ["CAL-SB-P01", "SIG-059", 120, 114],
    ["CAL-SB-P03", "SIG-025", 130, 110],
    ["CAL-SB-P03", "SIG-027", 130, 110],
  ])("flags %s %s splits totalling %ds against a %ds cycle", (pattern, signal, total, cycle) => {
    const messages = validate().map((i) => i.message);
    expect(
      messages.some(
        (m) =>
          m.includes(signal) &&
          m.includes(pattern) &&
          m.includes(`${total}s`) &&
          m.includes(`${cycle}s`),
      ),
      `expected a split-sum warning for ${signal} in ${pattern}`,
    ).toBe(true);
  });

  it("does not flag the reference intersection, whose splits do match", () => {
    const splitWarnings = validate().filter((i) => i.id.startsWith("split-sum-"));
    expect(splitWarnings.some((i) => i.message.includes("SIG-022"))).toBe(false);
    // Every other coordinated signal in P01 and P03 is off, two rings each.
    expect(splitWarnings.length).toBeGreaterThan(0);
  });

  it("ignores the free pattern, which has no cycle to compare against", () => {
    expect(validate().some((i) => i.message.includes("CAL-SB-FREE"))).toBe(false);
  });

  it("reports signals that coordination references but signals.txt lacks", () => {
    const bag = parseSample();
    COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(bag));
    const issues = validateCoordination(readAllCoordination(), new Set(["SIG-022"]));
    expect(issues.some((i) => i.message.includes("SIG-023") && i.message.includes("no row"))).toBe(
      true,
    );
  });

  // A mistyped id in Splits or PhaseSequence used to pass unremarked: only
  // corridorSignals and patternSignals were checked against the signal list.
  it("catches an unknown signal id that appears only in Splits or PhaseSequence", () => {
    const known = new Set([
      "SIG-022",
      "SIG-023",
      "SIG-024",
      "SIG-025",
      "SIG-026",
      "SIG-027",
      "SIG-028",
      "SIG-059",
    ]);
    const bag = parseSample();
    COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(bag));
    const rows = readAllCoordination();
    expect(validateCoordination(rows, known).some((i) => i.id.startsWith("unknown-signal"))).toBe(
      false,
    );

    const inSplits = {
      ...rows,
      splits: [{ ...rows.splits[0], signalId: "SIG-TYPO-S" }, ...rows.splits],
    };
    expect(
      validateCoordination(inSplits, known).some((i) => i.id === "unknown-signal-SIG-TYPO-S"),
    ).toBe(true);

    const inSequence = {
      ...rows,
      phaseSequence: [{ ...rows.phaseSequence[0], signalId: "SIG-TYPO-P" }, ...rows.phaseSequence],
    };
    expect(
      validateCoordination(inSequence, known).some((i) => i.id === "unknown-signal-SIG-TYPO-P"),
    ).toBe(true);
  });
});

describe("app wiring", () => {
  it("imports coordination rows through importData in replace mode", () => {
    importData(parseSample(), "replace");
    const after = readAllCoordination();
    expect(after.splits).toHaveLength(100);
    expect(after.corridors).toHaveLength(1);
  });

  it("imports through importData in merge mode without duplicating", () => {
    importData(parseSample(), "replace");
    importData(parseSample(), "merge");
    expect(readAllCoordination().splits).toHaveLength(100);
  });

  it("leaves the six original collections alone", () => {
    importData(parseSample(), "replace");
    expect(signalStorage.getAll()).toHaveLength(0);
  });

  it("is wiped by clearAllData", () => {
    importData(parseSample(), "replace");
    clearAllData();
    expect(readAllCoordination().splits).toHaveLength(0);
  });

  // The fan-out matters because coordination is read-only but SIGNALS are not:
  // renaming one through the normal path must carry its coordination rows.
  it("follows a signal rename made through signalStorage", () => {
    signalStorage.save({
      signalId: "SIG-022",
      agencyId: "A",
      streetName1: "a",
      streetName2: "b",
      latitude: 1,
      longitude: 2,
    });
    importData(parseSample(), "replace");

    signalStorage.update("SIG-022", { signalId: "SIG-RENAMED" });

    const after = readAllCoordination();
    expect(after.corridorSignals.some((r) => r.signalId === "SIG-022")).toBe(false);
    expect(after.corridorSignals.some((r) => r.signalId === "SIG-RENAMED")).toBe(true);
    expect(after.splits.some((r) => r.signalId === "SIG-RENAMED")).toBe(true);
  });

  it("drops coordination rows when a signal is deleted through signalStorage", () => {
    signalStorage.save({
      signalId: "SIG-022",
      agencyId: "A",
      streetName1: "a",
      streetName2: "b",
      latitude: 1,
      longitude: 2,
    });
    importData(parseSample(), "replace");

    signalStorage.delete("SIG-022");

    const after = readAllCoordination();
    expect(after.corridorSignals.some((r) => r.signalId === "SIG-022")).toBe(false);
    expect(after.phaseSequence.some((r) => r.signalId === "SIG-022")).toBe(false);
    // Other signals' rows survive.
    expect(after.corridorSignals.some((r) => r.signalId === "SIG-023")).toBe(true);
  });

  it("is blocked by the storage read-only guard like everything else", () => {
    setStorageReadOnly(true);
    try {
      importData(parseSample(), "replace");
      expect(readAllCoordination().splits).toHaveLength(0);
    } finally {
      setStorageReadOnly(false);
    }
  });
});

describe("row editing", () => {
  const splits = () => entity("splits");
  const seed = () => {
    COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(parseSample()));
  };

  it("patches a non-key field in place", () => {
    seed();
    const target = readAllCoordination().splits[0];
    const id = splits().identityOf(target);

    splits().updateRow(id, { splitS: 999 });

    const after = readAllCoordination().splits;
    expect(after).toHaveLength(100);
    expect(splits().identityOf(after[0])).toBe(id);
    expect(after[0].splitS).toBe(999);
  });

  // Key fields are the row's address. A patch that changed one would move the
  // row out from under its own identity, so they are dropped rather than trusted.
  it("ignores key fields in a patch", () => {
    seed();
    const target = readAllCoordination().splits[0];
    const id = splits().identityOf(target);

    splits().updateRow(id, { phaseId: 77, splitS: 12 });

    const row = readAllCoordination().splits.find((r) => splits().identityOf(r) === id);
    expect(row?.phaseId).toBe(target.phaseId);
    expect(row?.splitS).toBe(12);
  });

  it("appends a row and refuses a duplicate key", () => {
    seed();
    const fresh = { patternId: "CAL-SB-P01", signalId: "SIG-022", phaseId: 99, splitS: 5 };

    expect(splits().addRow(fresh)).toBe(true);
    expect(readAllCoordination().splits).toHaveLength(101);

    expect(splits().addRow({ ...fresh, splitS: 7 })).toBe(false);
    expect(readAllCoordination().splits).toHaveLength(101);
  });

  it("deletes by identity without touching its neighbours", () => {
    seed();
    const target = readAllCoordination().splits[0];
    const id = splits().identityOf(target);

    splits().deleteRow(id);

    const after = readAllCoordination().splits;
    expect(after).toHaveLength(99);
    expect(after.some((r) => splits().identityOf(r) === id)).toBe(false);
  });

  it("declares keyFields that match its identity", () => {
    for (const e of COORDINATION_ENTITIES) {
      expect(e.keyFields.length, `${e.key} keyFields`).toBeGreaterThan(0);
    }
    expect(splits().keyFields).toEqual(["patternId", "signalId", "phaseId"]);
  });

  it("is blocked by the storage read-only guard", () => {
    seed();
    const id = splits().identityOf(readAllCoordination().splits[0]);
    setStorageReadOnly(true);
    try {
      splits().updateRow(id, { splitS: 1 });
      splits().deleteRow(id);
      expect(readAllCoordination().splits).toHaveLength(100);
    } finally {
      setStorageReadOnly(false);
    }
  });
});

describe("corridor reordering", () => {
  const stop = (corridorId: string, sequence: number | null, signalId: string): CorridorSignal => ({
    corridorId,
    sequence,
    signalId,
    direction: null,
  });
  const order = (rows: readonly CorridorSignal[], corridorId: string) =>
    sortBySequence(rows.filter((r) => r.corridorId === corridorId)).map((r) => r.signalId);
  const seed = () => COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(parseSample()));

  it("moves a stop and renumbers the corridor 1..N", () => {
    const rows = [stop("C", 1, "A"), stop("C", 2, "B"), stop("C", 3, "C"), stop("C", 4, "D")];

    const next = applyCorridorMove(rows, "C", 0, 2);

    expect(next?.map((r) => [r.signalId, r.sequence])).toEqual([
      ["B", 1],
      ["C", 2],
      ["A", 3],
      ["D", 4],
    ]);
  });

  it("does not mutate its input", () => {
    const rows = [stop("C", 1, "A"), stop("C", 2, "B")];
    const before = JSON.stringify(rows);
    applyCorridorMove(rows, "C", 0, 1);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("leaves other corridors, and their place in the file, alone", () => {
    const rows = [
      stop("X", 1, "x1"),
      stop("C", 1, "A"),
      stop("X", 2, "x2"),
      stop("C", 2, "B"),
      stop("Y", 1, "y1"),
    ];

    const next = applyCorridorMove(rows, "C", 1, 0);

    // C's rows land where its first row was, in their new order.
    expect(next?.map((r) => r.signalId)).toEqual(["x1", "B", "A", "x2", "y1"]);
    expect(next?.filter((r) => r.corridorId !== "C")).toEqual(
      rows.filter((r) => r.corridorId !== "C"),
    );
  });

  // Addressing by position is what lets a broken corridor be repaired through
  // the same operation: identities there are ambiguous, positions are not.
  it("repairs duplicate and skipped sequence numbers", () => {
    const dupes = [stop("C", 1, "A"), stop("C", 1, "B"), stop("C", 1, "C")];
    expect(applyCorridorMove(dupes, "C", 0, 0)?.map((r) => r.sequence)).toEqual([1, 2, 3]);

    const gaps = [stop("C", 2, "A"), stop("C", 5, "B"), stop("C", 9, "C")];
    expect(applyCorridorMove(gaps, "C", 2, 2)?.map((r) => r.sequence)).toEqual([1, 2, 3]);
  });

  it("treats a missing sequence as first", () => {
    const rows = [stop("C", 2, "A"), stop("C", null, "B")];
    expect(order(rows, "C")).toEqual(["B", "A"]);
  });

  it("rejects out-of-range and non-integer positions", () => {
    const rows = [stop("C", 1, "A"), stop("C", 2, "B")];
    expect(applyCorridorMove(rows, "C", 0, 2)).toBeNull();
    expect(applyCorridorMove(rows, "C", -1, 0)).toBeNull();
    expect(applyCorridorMove(rows, "C", 0.5, 1)).toBeNull();
    expect(applyCorridorMove(rows, "missing", 0, 0)).toBeNull();
  });

  it("persists the move and writes the file in travel order", () => {
    seed();
    const before = order(readAllCoordination().corridorSignals, "CAL-SB");
    expect(before).toHaveLength(8);

    expect(moveCorridorSignal("CAL-SB", 0, 3)).toBe(true);

    const after = readAllCoordination().corridorSignals;
    expect(order(after, "CAL-SB")).toEqual([...before.slice(1, 4), before[0], ...before.slice(4)]);
    expect(after.map((r) => r.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Stored rows are already in travel order, so the exported file is too.
    expect(after.map((r) => r.signalId)).toEqual(order(after, "CAL-SB"));
  });

  it("changes nothing else: same stops, no validation problems introduced", () => {
    seed();
    const ids = new Set(readAllCoordination().corridorSignals.map((r) => r.signalId));
    const issuesBefore = validateCoordination(readAllCoordination(), ids).length;

    moveCorridorSignal("CAL-SB", 2, 6);

    const after = readAllCoordination();
    expect(new Set(after.corridorSignals.map((r) => r.signalId))).toEqual(ids);
    expect(after.patternSignals).toHaveLength(24);
    expect(after.splits).toHaveLength(100);
    expect(validateCoordination(after, ids)).toHaveLength(issuesBefore);
  });

  it("round-trips through the exported file", () => {
    seed();
    moveCorridorSignal("CAL-SB", 7, 0);

    const csv = entity("corridorSignals").render(UNSCOPED);
    const bag: ParsedCoordination = {};
    entity("corridorSignals").parseInto(csv, bag);

    expect(bag.corridorSignals).toEqual(readAllCoordination().corridorSignals);
  });

  it("returns false and writes nothing for a bad index", () => {
    seed();
    const before = JSON.stringify(readAllCoordination().corridorSignals);
    expect(moveCorridorSignal("CAL-SB", 0, 99)).toBe(false);
    expect(JSON.stringify(readAllCoordination().corridorSignals)).toBe(before);
  });

  it("is blocked by the storage read-only guard", () => {
    seed();
    const before = JSON.stringify(readAllCoordination().corridorSignals);
    setStorageReadOnly(true);
    try {
      moveCorridorSignal("CAL-SB", 0, 4);
    } finally {
      setStorageReadOnly(false);
    }
    expect(JSON.stringify(readAllCoordination().corridorSignals)).toBe(before);
  });
});

describe("editing a signal id", () => {
  const seed = () => COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(parseSample()));
  const stored = (key: string) =>
    JSON.stringify(readAllCoordination()[key as keyof ReturnType<typeof readAllCoordination>]);
  const rowFor = (patternId: string, signalId: string) =>
    readAllCoordination().patternSignals.find(
      (r) => r.patternId === patternId && r.signalId === signalId,
    )!;

  describe("one row", () => {
    it("re-points a PatternSignals row in place, leaving every other row alone", () => {
      seed();
      const ps = entity("patternSignals");
      const before = readAllCoordination().patternSignals;
      const id = ps.identityOf(rowFor("CAL-SB-P01", "SIG-022"));
      const index = before.findIndex((r) => ps.identityOf(r) === id);

      expect(ps.changeRowSignal?.(id, "SIG-122")).toBe("ok");

      const after = readAllCoordination().patternSignals;
      expect(after).toHaveLength(before.length);
      expect(after[index].signalId).toBe("SIG-122");
      // Everything but that one row is byte-identical.
      expect(after.filter((_, i) => i !== index)).toEqual(before.filter((_, i) => i !== index));
      // The rest of the row came with it.
      expect(after[index]).toEqual({ ...before[index], signalId: "SIG-122" });
    });

    // PatternSignals is keyed (pattern, signal): this would make two rows for
    // the same signal in the same pattern.
    it("refuses a move that would duplicate a row, and writes nothing", () => {
      seed();
      const ps = entity("patternSignals");
      const before = stored("patternSignals");
      const id = ps.identityOf(rowFor("CAL-SB-P01", "SIG-022"));

      expect(ps.changeRowSignal?.(id, "SIG-023")).toBe("duplicate");
      expect(stored("patternSignals")).toBe(before);
    });

    it("uses the whole composite key for Splits and PhaseSequence", () => {
      seed();
      const splits = entity("splits");
      const first = readAllCoordination().splits[0];
      const id = splits.identityOf(first);

      // Same pattern and phase, different signal that already has that split.
      const other = readAllCoordination().splits.find(
        (r) =>
          r.patternId === first.patternId &&
          r.phaseId === first.phaseId &&
          r.signalId !== first.signalId,
      )!;
      expect(splits.changeRowSignal?.(id, other.signalId)).toBe("duplicate");
      expect(splits.changeRowSignal?.(id, "SIG-NEW")).toBe("ok");

      const seq = entity("phaseSequence");
      const row = readAllCoordination().phaseSequence[0];
      expect(seq.changeRowSignal?.(seq.identityOf(row), "SIG-NEW")).toBe("ok");
      expect(readAllCoordination().phaseSequence[0].signalId).toBe("SIG-NEW");
    });

    it("trims the new id and rejects a blank one", () => {
      seed();
      const ps = entity("patternSignals");
      const id = ps.identityOf(rowFor("CAL-SB-P01", "SIG-022"));
      expect(ps.changeRowSignal?.(id, "   ")).toBe("blank");
      expect(ps.changeRowSignal?.(id, "")).toBe("blank");
      expect(ps.changeRowSignal?.(id, "  SIG-122 ")).toBe("ok");
      expect(rowFor("CAL-SB-P01", "SIG-122")).toBeDefined();
    });

    it("reports a no-op and a missing row without writing", () => {
      seed();
      const ps = entity("patternSignals");
      const before = stored("patternSignals");
      const id = ps.identityOf(rowFor("CAL-SB-P01", "SIG-022"));
      expect(ps.changeRowSignal?.(id, "SIG-022")).toBe("unchanged");
      expect(ps.changeRowSignal?.("no|such|row", "SIG-122")).toBe("missing");
      expect(stored("patternSignals")).toBe(before);
    });

    it("is only offered by the files that have a signal id", () => {
      for (const key of ["corridors", "coordination", "patterns", "schedule"]) {
        expect(entity(key).changeRowSignal, key).toBeUndefined();
      }
      for (const key of ["corridorSignals", "patternSignals", "splits", "phaseSequence"]) {
        expect(entity(key).changeRowSignal, key).toBeTypeOf("function");
      }
    });

    it("is blocked by the storage read-only guard", () => {
      seed();
      const ps = entity("patternSignals");
      const before = stored("patternSignals");
      const id = ps.identityOf(rowFor("CAL-SB-P01", "SIG-022"));
      setStorageReadOnly(true);
      try {
        ps.changeRowSignal?.(id, "SIG-122");
      } finally {
        setStorageReadOnly(false);
      }
      expect(stored("patternSignals")).toBe(before);
    });
  });

  describe("every row of one signal in a file", () => {
    it("moves them all and reports the count", () => {
      seed();
      const ps = entity("patternSignals");
      expect(ps.changeSignalInFile?.("SIG-022", "SIG-122")).toEqual({ changed: 3, skipped: 0 });
      const after = readAllCoordination().patternSignals;
      expect(after.filter((r) => r.signalId === "SIG-122")).toHaveLength(3);
      expect(after.some((r) => r.signalId === "SIG-022")).toBe(false);
      expect(after).toHaveLength(24);
    });

    it("skips, and reports, every row that would collide", () => {
      seed();
      const ps = entity("patternSignals");
      const before = stored("patternSignals");
      // SIG-023 already has a row in P01, P03 and P05.
      expect(ps.changeSignalInFile?.("SIG-022", "SIG-023")).toEqual({ changed: 0, skipped: 3 });
      expect(stored("patternSignals")).toBe(before);
    });

    it("moves the rows that can move when only some collide", () => {
      seed();
      const ps = entity("patternSignals");
      ps.deleteRow(ps.identityOf(rowFor("CAL-SB-P03", "SIG-023")));

      expect(ps.changeSignalInFile?.("SIG-022", "SIG-023")).toEqual({ changed: 1, skipped: 2 });
      expect(rowFor("CAL-SB-P03", "SIG-023").offsetS).toBe(45); // was SIG-022's P03 row
      expect(rowFor("CAL-SB-P01", "SIG-022")).toBeDefined(); // collided, left in place
    });

    it("does nothing for a blank or unchanged target", () => {
      seed();
      const ps = entity("patternSignals");
      expect(ps.changeSignalInFile?.("SIG-022", "")).toEqual({ changed: 0, skipped: 0 });
      expect(ps.changeSignalInFile?.("SIG-022", "SIG-022")).toEqual({ changed: 0, skipped: 0 });
    });

    it("still renames corridorSignals, where the signal isn't part of the key", () => {
      seed();
      expect(entity("corridorSignals").changeSignalInFile?.("SIG-022", "SIG-122")).toEqual({
        changed: 1,
        skipped: 0,
      });
    });
  });

  describe("everywhere in the coordination files", () => {
    const mentions = (id: string) => {
      const all = readAllCoordination();
      return {
        corridorSignals: all.corridorSignals.filter((r) => r.signalId === id).length,
        patternSignals: all.patternSignals.filter((r) => r.signalId === id).length,
        splits: all.splits.filter((r) => r.signalId === id).length,
        phaseSequence: all.phaseSequence.filter((r) => r.signalId === id).length,
        patternRefs: all.patterns.filter((r) => r.referencePoint === id).length,
        patternSignalRefs: all.patternSignals.filter((r) => r.referencePoint === id).length,
      };
    };

    it("renames the signal's rows and the reference points that name it", () => {
      seed();
      const before = mentions("SIG-022");
      // The reference intersection: all 4 patterns and all 24 pattern-signal rows point at it.
      expect(before.patternRefs).toBe(4);
      expect(before.patternSignalRefs).toBe(24);

      const report = renameSignalInCoordination("SIG-022", "SIG-122");

      const rows =
        before.corridorSignals + before.patternSignals + before.splits + before.phaseSequence;
      expect(report).toEqual({ changed: rows, skipped: 0, referencePoints: 28 });
      expect(Object.values(mentions("SIG-022")).every((n) => n === 0)).toBe(true);
      expect(mentions("SIG-122")).toEqual({ ...before });
    });

    it("leaves other signals alone", () => {
      seed();
      const before = mentions("SIG-023");
      renameSignalInCoordination("SIG-022", "SIG-122");
      expect(mentions("SIG-023")).toEqual(before);
    });

    // A skipped row means the old id is still in use, so repointing the reference
    // points would strand them from rows that still carry the old id.
    it("keeps the reference points where they were if any row had to be skipped", () => {
      seed();
      const report = renameSignalInCoordination("SIG-022", "SIG-023");
      expect(report.skipped).toBeGreaterThan(0);
      expect(report.referencePoints).toBe(0);
      expect(mentions("SIG-022").patternRefs).toBe(4);
    });

    it("is what a signal rename from the Signals page now does, reference points included", () => {
      seed();
      updateCoordinationSignalId("SIG-022", "SIG-777");
      const after = readAllCoordination();
      expect(after.patterns.every((p) => p.referencePoint === "SIG-777")).toBe(true);
      expect(after.patternSignals.every((p) => p.referencePoint === "SIG-777")).toBe(true);
    });

    it("is blocked by the storage read-only guard", () => {
      seed();
      const before = JSON.stringify(readAllCoordination());
      setStorageReadOnly(true);
      try {
        renameSignalInCoordination("SIG-022", "SIG-122");
      } finally {
        setStorageReadOnly(false);
      }
      expect(JSON.stringify(readAllCoordination())).toBe(before);
    });
  });
});
