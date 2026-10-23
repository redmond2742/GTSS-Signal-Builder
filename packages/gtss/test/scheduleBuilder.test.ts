import { describe, expect, it } from "vitest";
import { emptyCoordinationRows } from "../src/localStorage/coordination/rows";
import {
  blocksFromSlots,
  clockText,
  normaliseBlocks,
  scheduleRowsFor,
} from "../src/localStorage/coordination/scheduleBuilder";
import { validateCoordination } from "../src/localStorage/coordination/validate";

/** 48 half-hour slots with the given [from, to) hours painted. */
const halfHours = (...ranges: [number, number][]) =>
  Array.from({ length: 48 }, (_, i) => ranges.some(([a, b]) => i / 2 >= a && i / 2 < b));

describe("painted slots to time blocks", () => {
  it("turns each run of painted slots into one block", () => {
    expect(blocksFromSlots("WEEKDAY", halfHours([6, 9.5], [15, 19]), 30)).toEqual([
      { dayType: "WEEKDAY", startMin: 360, endMin: 570 },
      { dayType: "WEEKDAY", startMin: 900, endMin: 1140 },
    ]);
  });

  it("runs a block painted to the last slot through to midnight", () => {
    expect(blocksFromSlots("SUNDAY", halfHours([22, 24]), 30)).toEqual([
      { dayType: "SUNDAY", startMin: 1320, endMin: 1440 },
    ]);
  });

  it("has no blocks for an unpainted day", () => {
    expect(blocksFromSlots("SATURDAY", halfHours(), 30)).toEqual([]);
  });

  it("merges overlapping and touching blocks, and drops empty ones", () => {
    expect(
      normaliseBlocks([
        { dayType: "WEEKDAY", startMin: 600, endMin: 700 },
        { dayType: "WEEKDAY", startMin: 360, endMin: 600 },
        { dayType: "WEEKDAY", startMin: 650, endMin: 800 },
        { dayType: "WEEKDAY", startMin: 900, endMin: 900 },
        { dayType: "SATURDAY", startMin: 0, endMin: 2000 },
      ]),
    ).toEqual([
      { dayType: "WEEKDAY", startMin: 360, endMin: 800 },
      { dayType: "SATURDAY", startMin: 0, endMin: 1440 },
    ]);
  });

  it("writes clock times the way the files do, with midnight at the end as 24:00:00", () => {
    expect(clockText(0)).toBe("00:00:00");
    expect(clockText(570)).toBe("09:30:00");
    expect(clockText(1440)).toBe("24:00:00");
  });
});

describe("schedule rows", () => {
  const base = {
    idPrefix: "MAIN",
    coordinationId: "MAIN-COORD",
    patternId: "MAIN-P1",
  };

  it("schedules the pattern in its blocks and free around them, for every weekly day", () => {
    const rows = scheduleRowsFor({
      ...base,
      freePatternId: "MAIN-FREE",
      blocks: blocksFromSlots("WEEKDAY", halfHours([6, 9], [15, 19]), 30),
    });
    expect(rows.map((r) => `${r.dayType} ${r.startTime}-${r.endTime} ${r.patternId}`)).toEqual([
      "WEEKDAY 00:00:00-06:00:00 MAIN-FREE",
      "WEEKDAY 06:00:00-09:00:00 MAIN-P1",
      "WEEKDAY 09:00:00-15:00:00 MAIN-FREE",
      "WEEKDAY 15:00:00-19:00:00 MAIN-P1",
      "WEEKDAY 19:00:00-24:00:00 MAIN-FREE",
      "SATURDAY 00:00:00-24:00:00 MAIN-FREE",
      "SUNDAY 00:00:00-24:00:00 MAIN-FREE",
    ]);
    expect(rows.map((r) => r.scheduleId)).toEqual([
      "MAIN-S01",
      "MAIN-S02",
      "MAIN-S03",
      "MAIN-S04",
      "MAIN-S05",
      "MAIN-S06",
      "MAIN-S07",
    ]);
    expect(rows.every((r) => r.coordinationId === "MAIN-COORD" && r.priority === 10)).toBe(true);
  });

  it("leaves the rest unscheduled when there's no free pattern", () => {
    const rows = scheduleRowsFor({
      ...base,
      freePatternId: null,
      blocks: [{ dayType: "SATURDAY", startMin: 600, endMin: 1200 }],
    });
    expect(rows.map((r) => `${r.dayType} ${r.startTime}-${r.endTime}`)).toEqual([
      "SATURDAY 10:00:00-20:00:00",
    ]);
  });

  it("writes no free rows for a day painted end to end", () => {
    const rows = scheduleRowsFor({
      ...base,
      freePatternId: "MAIN-FREE",
      blocks: [{ dayType: "SUNDAY", startMin: 0, endMin: 1440 }],
    });
    expect(rows.filter((r) => r.dayType === "SUNDAY").map((r) => r.patternId)).toEqual(["MAIN-P1"]);
  });

  it("covers every hour of every day exactly once, as validation checks", () => {
    const schedule = scheduleRowsFor({
      ...base,
      freePatternId: "MAIN-FREE",
      blocks: [
        ...blocksFromSlots("WEEKDAY", halfHours([6.5, 9], [11, 13], [15, 19]), 30),
        ...blocksFromSlots("SATURDAY", halfHours([10, 18]), 30),
      ],
    });
    const rows = {
      ...emptyCoordinationRows(),
      coordination: [
        {
          coordinationId: "MAIN-COORD",
          name: null,
          referenceClock: null,
          timezone: null,
          description: null,
        },
      ],
      patterns: [
        {
          patternId: "MAIN-P1",
          patternNumber: 1,
          corridorId: null,
          cycleLengthS: 100,
          referencePoint: "BegGRN",
          description: null,
        },
        {
          patternId: "MAIN-FREE",
          patternNumber: 254,
          corridorId: null,
          cycleLengthS: 0,
          referencePoint: null,
          description: null,
        },
      ],
      schedule,
    };
    expect(validateCoordination(rows).filter((i) => i.scope === "schedule")).toEqual([]);
  });
});
