import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllCoordination,
  COORDINATION_ENTITIES,
  deleteCoordinationBySignal,
  detectCoordinationFile,
  readAllCoordination,
  updateCoordinationSignalId,
} from "../src/localStorage/coordination/entities";
import { identityOf, type ParsedCoordination } from "../src/localStorage/coordination/rows";
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
