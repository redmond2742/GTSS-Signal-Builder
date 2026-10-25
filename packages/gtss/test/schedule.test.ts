import { beforeEach, describe, expect, it } from "vitest";
import { moveCorridorSignal } from "../src/localStorage/coordination/corridor-order";
import {
  COORDINATION_ENTITIES,
  readAllCoordination,
} from "../src/localStorage/coordination/entities";
import {
  emptyCoordinationRows,
  type CoordinationRows,
  type ParsedCoordination,
  type ScheduleEntry,
} from "../src/localStorage/coordination/rows";
import {
  alignDaySchedule,
  dayTypesFor,
  describeDayType,
  effectiveSegments,
  expandEntry,
  formatClock,
  parseClock,
  scheduleEntriesForCorridor,
} from "../src/localStorage/coordination/schedule";
import { validateCoordination } from "../src/localStorage/coordination/validate";
import * as sample from "./fixtures/coordination-sample";

const files: Record<string, string> = {
  corridors: sample.corridorsTxt,
  corridorSignals: sample.corridorSignalsTxt,
  patterns: sample.patternsTxt,
  patternSignals: sample.patternSignalsTxt,
  splits: sample.splitsTxt,
  schedule: sample.scheduleTxt,
  phaseSequence: sample.phaseSequenceTxt,
};

const parseSampleBag = (): ParsedCoordination => {
  const bag: ParsedCoordination = {};
  for (const e of COORDINATION_ENTITIES) e.parseInto(files[e.key], bag);
  return bag;
};

/** The real sample export, parsed through the real parsers. */
const sampleRows = (): CoordinationRows => ({ ...emptyCoordinationRows(), ...parseSampleBag() });

const entry = (
  scheduleId: string,
  dayType: string,
  start: string,
  end: string,
  patternId: string,
  priority = 10,
): ScheduleEntry => ({
  scheduleId,
  // Blank: the corridor is its pattern's, so hand-built corridors work too.
  corridorId: null,
  dayType,
  startTime: start,
  endTime: end,
  patternId,
  priority,
});

const blocksOf = (entries: ScheduleEntry[]) => entries.flatMap((e) => expandEntry(e).blocks);
const span = (s: { startMin: number; endMin: number }) =>
  `${formatClock(s.startMin)}-${formatClock(s.endMin)}`;

beforeEach(() => {
  // The corridor-order helper writes to storage; give it somewhere to write.
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

describe("clock times", () => {
  it("parses HH:MM and HH:MM:SS to minutes", () => {
    expect(parseClock("07:15:00")).toBe(435);
    expect(parseClock("7:15")).toBe(435);
    expect(parseClock("00:00:00")).toBe(0);
    expect(parseClock("24:00:00")).toBe(1440);
    expect(parseClock("12:00:30")).toBe(720.5);
  });

  it("rejects anything that isn't a time of day", () => {
    for (const bad of ["", "noon", "25:00", "24:01", "12:60", "12:00:60", "12", null, undefined]) {
      expect(parseClock(bad), String(bad)).toBeNull();
    }
  });

  it("formats back, keeping seconds only when present", () => {
    expect(formatClock(435)).toBe("07:15");
    expect(formatClock(1440)).toBe("24:00");
    expect(formatClock(720.5)).toBe("12:00:30");
  });
});

describe("day types", () => {
  it("names the weekly types", () => {
    expect(describeDayType("WEEKDAY")).toMatchObject({
      label: "Weekday",
      short: "Mon–Fri",
      kind: "weekday",
    });
    expect(describeDayType("saturday")).toMatchObject({ short: "Sat", kind: "saturday" });
    expect(describeDayType("SUNDAY")).toMatchObject({ short: "Sun", kind: "sunday" });
  });

  it("reads SPECIAL_<DOW>_<MON>_D<from>-<to>", () => {
    const d = describeDayType("SPECIAL_MONDAY_MAY_D25-31");
    expect(d).toMatchObject({ label: "Mon May 25–31", kind: "special" });
    expect(d.dayType).toBe("SPECIAL_MONDAY_MAY_D25-31");
  });

  it("passes unknown types through rather than guessing", () => {
    expect(describeDayType("HOLIDAY_EVE")).toMatchObject({ label: "Holiday eve", kind: "other" });
    expect(describeDayType("SPECIAL_WHATEVER").kind).toBe("special");
    expect(describeDayType(null).label).toBe("(no day type)");
  });

  it("orders weekly first, then specials, for the sample corridor", () => {
    const days = dayTypesFor(sampleRows(), "CAL-SB").map((d) => d.dayType);
    expect(days.slice(0, 3)).toEqual(["WEEKDAY", "SATURDAY", "SUNDAY"]);
    expect(days.slice(3).every((d) => d.startsWith("SPECIAL_"))).toBe(true);
    expect(days).toHaveLength(6);
  });
});

describe("expanding entries", () => {
  it("makes one block for an ordinary entry", () => {
    const { blocks, problem } = expandEntry(entry("A", "WEEKDAY", "07:15:00", "09:00:00", "P"));
    expect(problem).toBeNull();
    expect(blocks).toEqual([
      { scheduleId: "A", patternId: "P", priority: 10, startMin: 435, endMin: 540, wrap: null },
    ]);
  });

  it("cuts an entry that crosses midnight in two", () => {
    const { blocks } = expandEntry(entry("A", "WEEKDAY", "18:30:00", "07:15:00", "P"));
    expect(blocks.map((b) => [b.startMin, b.endMin, b.wrap])).toEqual([
      [1110, 1440, "head"],
      [0, 435, "tail"],
    ]);
  });

  it("gives no small-hours half to an entry ending exactly at midnight", () => {
    const { blocks } = expandEntry(entry("A", "WEEKDAY", "18:00", "00:00", "P"));
    expect(blocks.map((b) => [b.startMin, b.endMin, b.wrap])).toEqual([[1080, 1440, "head"]]);
  });

  it("reports unreadable and empty entries instead of dropping them silently", () => {
    expect(expandEntry(entry("A", "WEEKDAY", "soon", "09:00", "P"))).toEqual({
      blocks: [],
      problem: "unparseable",
    });
    expect(expandEntry(entry("A", "WEEKDAY", "09:00", "09:00", "P"))).toEqual({
      blocks: [],
      problem: "empty",
    });
  });
});

describe("effective segments", () => {
  it("covers a real weekday exactly, with the midnight wrap on both ends", () => {
    const weekday = scheduleEntriesForCorridor(sampleRows(), "CAL-SB").filter(
      (e) => e.dayType === "WEEKDAY",
    );
    const segs = effectiveSegments(blocksOf(weekday));

    expect(segs.map((s) => `${span(s)} ${s.block?.patternId}`)).toEqual([
      "00:00-07:15 CAL-SB-FREE",
      "07:15-09:00 CAL-SB-P01",
      "09:00-11:30 CAL-SB-FREE",
      "11:30-16:00 CAL-SB-P01",
      "16:00-18:30 CAL-SB-P03",
      "18:30-24:00 CAL-SB-FREE",
    ]);
    expect(segs.every((s) => s.conflicts.length === 0)).toBe(true);
  });

  it("returns uncovered time as a null-block segment", () => {
    const segs = effectiveSegments(
      blocksOf([entry("A", "D", "06:00", "10:00", "P"), entry("B", "D", "12:00", "24:00", "Q")]),
    );
    expect(segs.map((s) => `${span(s)} ${s.block?.scheduleId ?? "gap"}`)).toEqual([
      "00:00-06:00 gap",
      "06:00-10:00 A",
      "10:00-12:00 gap",
      "12:00-24:00 B",
    ]);
  });

  // Priority is how a SPECIAL day overrides the weekly schedule.
  it("lets the higher priority win an overlap, without calling it a conflict", () => {
    const segs = effectiveSegments(
      blocksOf([
        entry("LOW", "D", "00:00", "24:00", "WEEKLY", 10),
        entry("HIGH", "D", "09:00", "11:00", "SPECIAL", 20),
      ]),
    );
    expect(segs.map((s) => `${span(s)} ${s.block?.scheduleId}`)).toEqual([
      "00:00-09:00 LOW",
      "09:00-11:00 HIGH",
      "11:00-24:00 LOW",
    ]);
    expect(segs.every((s) => s.conflicts.length === 0)).toBe(true);
  });

  it("reports same-priority overlap as a conflict, keeping the first", () => {
    const segs = effectiveSegments(
      blocksOf([entry("A", "D", "00:00", "12:00", "P"), entry("B", "D", "08:00", "24:00", "Q")]),
    );
    const clash = segs.find((s) => s.conflicts.length > 0);
    expect(clash && span(clash)).toBe("08:00-12:00");
    expect(clash?.block?.scheduleId).toBe("A");
    expect(clash?.conflicts.map((c) => c.scheduleId)).toEqual(["B"]);
  });

  it("returns one empty segment for a day with no blocks", () => {
    expect(effectiveSegments([])).toEqual([
      { startMin: 0, endMin: 1440, block: null, conflicts: [] },
    ]);
  });
});

describe("signal alignment, on the real sample", () => {
  const weekday = () => alignDaySchedule(sampleRows(), "CAL-SB", "WEEKDAY");
  const segAt = (a: ReturnType<typeof weekday>, hhmm: string) => {
    const at = parseClock(hhmm)!;
    const seg = a.segments.find((s) => s.startMin <= at && at < s.endMin);
    if (!seg) throw new Error(`no segment at ${hhmm}`);
    return seg;
  };

  it("lists the corridor's signals in travel order and names the reference", () => {
    const a = weekday();
    expect(a.signalIds).toEqual([
      "SIG-022",
      "SIG-023",
      "SIG-024",
      "SIG-025",
      "SIG-026",
      "SIG-027",
      "SIG-028",
      "SIG-059",
    ]);
    expect(a.referenceSignalId).toBe("SIG-022");
  });

  it("flags the one signal that runs free while pattern 1 is coordinated", () => {
    const am = segAt(weekday(), "08:00");
    expect(am.pattern?.patternId).toBe("CAL-SB-P01");
    expect(am.states.get("SIG-028")).toEqual({ kind: "free-signal" });
    expect(am.states.get("SIG-022")).toMatchObject({ kind: "coordinated", phase: 4, offsetS: 76 });
    expect(am.states.get("SIG-027")).toMatchObject({ kind: "coordinated", phase: 8, offsetS: 110 });
    expect(am.notes).toContain("SIG-028 runs free while CAL-SB-P01 is coordinated.");
  });

  it("marks signals whose splits don't add up to the cycle, and not the reference", () => {
    const am = segAt(weekday(), "08:00");
    const off = (id: string) => {
      const st = am.states.get(id);
      return st?.kind === "coordinated" && st.cycleMismatch;
    };
    expect(off("SIG-022")).toBe(false); // 114 = 114
    expect(off("SIG-023")).toBe(true); // 120 vs 114
    expect(
      am.notes.some((n) => n.includes("ring splits don't add up to CAL-SB-P01's 114s cycle")),
    ).toBe(true);
  });

  it("treats a free pattern as consistent: everyone free, nothing to flag", () => {
    const night = segAt(weekday(), "03:00");
    expect(night.pattern?.patternId).toBe("CAL-SB-FREE");
    expect(Array.from(night.states.values()).every((s) => s.kind === "free-pattern")).toBe(true);
    expect(night.notes).toEqual([]);
  });

  it("shows Saturday's pattern 5 coordinating only the reference intersection", () => {
    const a = alignDaySchedule(sampleRows(), "CAL-SB", "SATURDAY");
    const sat = segAt(a, "13:00");
    expect(sat.pattern?.patternId).toBe("CAL-SB-P05");
    expect(sat.states.get("SIG-022")?.kind).toBe("coordinated");
    const others = a.signalIds.filter((id) => id !== "SIG-022");
    expect(others.every((id) => sat.states.get(id)?.kind === "free-signal")).toBe(true);
  });

  it("has a clean, fully covered day for every special", () => {
    for (const d of dayTypesFor(sampleRows(), "CAL-SB").filter((x) => x.kind === "special")) {
      const a = alignDaySchedule(sampleRows(), "CAL-SB", d.dayType);
      expect(a.segments, d.label).toHaveLength(1);
      expect(a.segments[0].notes).toEqual([]);
    }
  });

  it("follows a reordered corridor", () => {
    COORDINATION_ENTITIES.forEach((e) => e.replaceFrom(parseSampleBag()));
    moveCorridorSignal("CAL-SB", 0, 7);

    const a = alignDaySchedule(readAllCoordination(), "CAL-SB", "WEEKDAY");
    expect(a.signalIds[0]).toBe("SIG-023");
    expect(a.signalIds[7]).toBe("SIG-022");
  });
});

describe("signal alignment, hand-built cases", () => {
  const base = (): CoordinationRows => ({
    ...emptyCoordinationRows(),
    corridors: [{ corridorId: "C1", name: null, description: null, primaryDirection: null }],
    corridorSignals: [
      { corridorId: "C1", sequence: 1, signalId: "A", direction: null },
      { corridorId: "C1", sequence: 2, signalId: "B", direction: null },
    ],
    patterns: [
      {
        patternId: "P1",
        patternNumber: 1,
        corridorId: "C1",
        cycleLengthS: 100,
        referencePoint: "A",
        description: null,
      },
      {
        patternId: "FREE",
        patternNumber: 254,
        corridorId: "C1",
        cycleLengthS: 0,
        referencePoint: "A",
        description: null,
      },
    ],
    patternSignals: [
      {
        patternId: "P1",
        signalId: "A",
        offsetS: 0,
        coordinatedPhase: 2,
        referencePoint: "A",
        notes: null,
      },
    ],
    schedule: [entry("S1", "WEEKDAY", "00:00", "24:00", "P1")],
  });

  it("reports a signal with no PatternSignals row for a coordinated pattern", () => {
    const seg = alignDaySchedule(base(), "C1", "WEEKDAY").segments[0];
    expect(seg.states.get("B")).toEqual({ kind: "missing" });
    expect(seg.notes).toContain("B has no PatternSignals row for P1.");
  });

  it("words a note for one signal and for several", () => {
    const rows = { ...base(), patternSignals: [] };
    const seg = alignDaySchedule(rows, "C1", "WEEKDAY").segments[0];
    expect(seg.notes).toContain("A, B have no PatternSignals row for P1.");
  });

  it("reports a schedule entry pointing at a pattern that doesn't exist", () => {
    const rows = { ...base(), schedule: [entry("S1", "WEEKDAY", "00:00", "24:00", "NOPE")] };
    const seg = alignDaySchedule(rows, "C1", "WEEKDAY").segments[0];
    expect(seg.states.get("A")).toEqual({ kind: "unknown-pattern" });
    expect(seg.notes).toContain("Pattern NOPE is not in Patterns.txt.");
  });

  it("reports a gap and lists unplaceable entries", () => {
    const rows = {
      ...base(),
      schedule: [
        entry("S1", "WEEKDAY", "06:00", "10:00", "P1"),
        entry("S2", "WEEKDAY", "x", "y", "P1"),
      ],
    };
    const a = alignDaySchedule(rows, "C1", "WEEKDAY");
    expect(a.unplaceable).toEqual(["S2"]);
    expect(a.segments.filter((s) => s.block === null).map(span)).toEqual([
      "00:00-06:00",
      "10:00-24:00",
    ]);
    expect(a.segments[0].notes).toEqual(["No pattern is scheduled for this time."]);
  });

  it("only sees a corridor's own schedule", () => {
    const rows: CoordinationRows = {
      ...base(),
      patterns: [
        ...base().patterns,
        {
          patternId: "Q1",
          patternNumber: 1,
          corridorId: "C2",
          cycleLengthS: 90,
          referencePoint: null,
          description: null,
        },
      ],
      schedule: [...base().schedule, entry("S9", "SATURDAY", "00:00", "24:00", "Q1")],
    };
    expect(dayTypesFor(rows, "C1").map((d) => d.dayType)).toEqual(["WEEKDAY"]);
    expect(dayTypesFor(rows, "C2").map((d) => d.dayType)).toEqual(["SATURDAY"]);
  });
});

describe("schedule validation", () => {
  const withSchedule = (schedule: ScheduleEntry[]): CoordinationRows => ({
    ...sampleRows(),
    schedule,
  });
  const scheduleIssues = (rows: CoordinationRows) =>
    validateCoordination(rows).filter(
      (i) => i.scope === "schedule" && !i.id.startsWith("schedule-pattern-"),
    );

  it("raises nothing for the real sample", () => {
    expect(scheduleIssues(sampleRows())).toEqual([]);
  });

  it("flags time nobody has scheduled", () => {
    const rows = withSchedule(sampleRows().schedule.filter((s) => s.scheduleId !== "SCH-003"));
    const gaps = scheduleIssues(rows).filter((i) => i.id.startsWith("schedule-gap"));
    expect(gaps.map((g) => g.message)).toEqual([
      "Schedule WEEKDAY has no pattern from 09:00 to 11:30",
    ]);
  });

  it("flags same-priority overlap but not a priority override", () => {
    const rows = withSchedule([
      entry("A", "WEEKDAY", "00:00", "12:00", "CAL-SB-P01"),
      entry("B", "WEEKDAY", "08:00", "24:00", "CAL-SB-P03"),
      entry("C", "SATURDAY", "00:00", "24:00", "CAL-SB-FREE", 10),
      entry("D", "SATURDAY", "09:00", "10:00", "CAL-SB-P05", 20),
    ]);
    const overlaps = scheduleIssues(rows).filter((i) => i.id.startsWith("schedule-overlap"));
    expect(overlaps.map((o) => o.message)).toEqual([
      "Schedule WEEKDAY: A and B overlap from 08:00 to 12:00 at priority 10",
    ]);
  });

  it("flags times that aren't times, as an error", () => {
    const rows = withSchedule([entry("A", "WEEKDAY", "7am", "09:00", "CAL-SB-P01")]);
    const bad = scheduleIssues(rows).filter((i) => i.id === "schedule-time-A");
    expect(bad).toHaveLength(1);
    expect(bad[0].level).toBe("error");
  });

  it("keeps different corridors' day types apart", () => {
    const rows = withSchedule([
      { ...entry("A", "WEEKDAY", "00:00", "24:00", "CAL-SB-P01"), corridorId: "ONE" },
      { ...entry("B", "WEEKDAY", "00:00", "24:00", "CAL-SB-P03"), corridorId: "TWO" },
    ]);
    expect(scheduleIssues(rows).filter((i) => i.id.startsWith("schedule-overlap"))).toEqual([]);
  });

  it("checks each row's corridor exists and agrees with its pattern's", () => {
    const rows = withSchedule([
      entry("A", "WEEKDAY", "00:00", "24:00", "CAL-SB-P01"),
      { ...entry("B", "SATURDAY", "00:00", "24:00", "CAL-SB-P01"), corridorId: "NOPE" },
    ]);
    const issues = scheduleIssues(rows);
    expect(issues.find((i) => i.id === "schedule-corridor-B")).toMatchObject({
      level: "error",
      message: "Schedule B references corridor NOPE, which is not in corridors.txt",
    });
    expect(issues.find((i) => i.id === "schedule-corridor-mismatch-B")?.message).toBe(
      "Schedule B is for corridor NOPE but runs CAL-SB-P01, which belongs to CAL-SB",
    );
    expect(issues.some((i) => i.id.endsWith("-A") && i.level === "error")).toBe(false);
  });

  it("takes a row with no corridor of its own as its pattern's", () => {
    const rows = withSchedule([
      { ...entry("A", "WEEKDAY", "00:00", "24:00", "CAL-SB-P01"), corridorId: null },
    ]);
    expect(scheduleIssues(rows).filter((i) => i.id.includes("corridor"))).toEqual([]);
    expect(scheduleEntriesForCorridor(rows, "CAL-SB").map((e) => e.scheduleId)).toEqual(["A"]);
    expect(scheduleEntriesForCorridor(rows, "OTHER")).toEqual([]);
  });
});
