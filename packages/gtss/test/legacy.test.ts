import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllCoordination,
  COORDINATION_ENTITIES,
  COORDINATION_STORAGE_KEYS,
  LEGACY_COORDINATION_STORAGE_KEY,
  readAllCoordination,
} from "../src/localStorage/coordination/entities";
import {
  foldLegacyCoordination,
  isLegacyCoordinationFile,
  parseLegacyCoordination,
  upgradeStoredCoordination,
} from "../src/localStorage/coordination/legacy";
import type { ParsedCoordination } from "../src/localStorage/coordination/rows";
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

const parse = (key: string, text: string, bag: ParsedCoordination) =>
  COORDINATION_ENTITIES.find((e) => e.key === key)!.parseInto(text, bag);

/** The corridors as an older export wrote them: no clock or timezone. */
const oldCorridorsTxt = `corridor_id,name,description,primary_direction
CAL-SB,California Blvd Southbound,California Blvd coordinated arterial (verify order/direction),SB`;

describe("importing an older export", () => {
  it("knows the old Coordination.txt by name", () => {
    expect(isLegacyCoordinationFile("Coordination.txt")).toBe(true);
    expect(isLegacyCoordinationFile("coordination")).toBe(true);
    expect(isLegacyCoordinationFile("GTSS/Coordination.txt")).toBe(true);
    expect(isLegacyCoordinationFile("corridors.txt")).toBe(false);
    expect(isLegacyCoordinationFile("CoordinationNotes.txt")).toBe(false);
  });

  it("reads its plans", () => {
    expect(parseLegacyCoordination(sample.legacyCoordinationTxt)).toEqual([
      { coordinationId: "COORD-CAL", referenceClock: "LOCAL", timezone: "America/Los_Angeles" },
    ]);
  });

  it("carries a single plan's clock and timezone onto the corridors", () => {
    const bag: ParsedCoordination = {};
    parse("corridors", oldCorridorsTxt, bag);
    const note = foldLegacyCoordination(bag, parseLegacyCoordination(sample.legacyCoordinationTxt));
    expect(bag.corridors?.[0]).toMatchObject({
      referenceClock: "LOCAL",
      timezone: "America/Los_Angeles",
    });
    expect(note).toBe(
      "Coordination.txt is no longer used: its reference clock and timezone were copied to CAL-SB.",
    );
  });

  it("imports an old export as cleanly as a new one", () => {
    const old: ParsedCoordination = {};
    parse("corridors", oldCorridorsTxt, old);
    parse("corridorSignals", sample.corridorSignalsTxt, old);
    parse("patterns", sample.patternsTxt, old);
    parse("patternSignals", sample.patternSignalsTxt, old);
    parse("splits", sample.splitsTxt, old);
    parse("schedule", sample.legacyScheduleTxt, old);
    parse("phaseSequence", sample.phaseSequenceTxt, old);
    foldLegacyCoordination(old, parseLegacyCoordination(sample.legacyCoordinationTxt));

    const now: ParsedCoordination = {};
    parse("corridors", sample.corridorsTxt, now);
    parse("corridorSignals", sample.corridorSignalsTxt, now);
    parse("patterns", sample.patternsTxt, now);
    parse("patternSignals", sample.patternSignalsTxt, now);
    parse("splits", sample.splitsTxt, now);
    parse("schedule", sample.scheduleTxt, now);
    parse("phaseSequence", sample.phaseSequenceTxt, now);

    const issues = (bag: ParsedCoordination) =>
      validateCoordination({ ...readAllCoordination(), ...bag }).map((i) => i.id);
    expect(old.corridors).toEqual(now.corridors);
    expect(issues(old)).toEqual(issues(now));
  });

  it("doesn't overwrite a clock or timezone the corridor already has", () => {
    const bag: ParsedCoordination = {};
    parse("corridors", sample.corridorsTxt.replace("LOCAL,America/Los_Angeles", "GPS,UTC"), bag);
    const note = foldLegacyCoordination(bag, parseLegacyCoordination(sample.legacyCoordinationTxt));
    expect(bag.corridors?.[0]).toMatchObject({ referenceClock: "GPS", timezone: "UTC" });
    expect(note).toMatch(/already have a clock and timezone/);
  });

  it("won't guess which corridor each of several plans was for", () => {
    const bag: ParsedCoordination = {};
    parse("corridors", oldCorridorsTxt, bag);
    const two = parseLegacyCoordination(
      `${sample.legacyCoordinationTxt}\nCOORD-2,Other,LOCAL,America/New_York,`,
    );
    expect(two).toHaveLength(2);
    expect(foldLegacyCoordination(bag, two)).toMatch(/2 plans and nothing says which corridor/);
    expect(bag.corridors?.[0].timezone).toBeNull();
  });
});

describe("upgrading data saved in the browser before the change", () => {
  const keys = COORDINATION_STORAGE_KEYS;
  const save = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
  const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? "null");

  /** What the store held: the old plan, old corridors and schedule rows naming the plan. */
  const seedOld = (
    plans = [
      {
        coordinationId: "COORD-CAL",
        name: null,
        referenceClock: "LOCAL",
        timezone: "America/Los_Angeles",
        description: null,
      },
    ],
  ) => {
    save(LEGACY_COORDINATION_STORAGE_KEY, plans);
    save(keys.corridors, [
      { corridorId: "CAL-SB", name: null, description: null, primaryDirection: "SB" },
      { corridorId: "OTHER", name: null, description: null, primaryDirection: "NB" },
    ]);
    save(keys.patterns, [
      {
        patternId: "P1",
        patternNumber: 1,
        corridorId: "CAL-SB",
        cycleLengthS: 100,
        referencePoint: "BegGreen",
        description: null,
      },
      {
        patternId: "Q1",
        patternNumber: 1,
        corridorId: "OTHER",
        cycleLengthS: 90,
        referencePoint: "BegGreen",
        description: null,
      },
    ]);
    save(keys.schedule, [
      {
        scheduleId: "S1",
        coordinationId: "COORD-CAL",
        dayType: "WEEKDAY",
        startTime: "00:00",
        endTime: "24:00",
        patternId: "P1",
        priority: 10,
      },
      {
        scheduleId: "S2",
        coordinationId: "COORD-CAL",
        dayType: "SUNDAY",
        startTime: "00:00",
        endTime: "24:00",
        patternId: "NOPE",
        priority: 10,
      },
    ]);
  };

  it("gives each schedule row its pattern's corridor and drops the plan id", () => {
    seedOld();
    expect(upgradeStoredCoordination()).toBe(true);
    expect(read(keys.schedule)).toEqual([
      {
        scheduleId: "S1",
        corridorId: "CAL-SB",
        dayType: "WEEKDAY",
        startTime: "00:00",
        endTime: "24:00",
        patternId: "P1",
        priority: 10,
      },
      {
        scheduleId: "S2",
        corridorId: null,
        dayType: "SUNDAY",
        startTime: "00:00",
        endTime: "24:00",
        patternId: "NOPE",
        priority: 10,
      },
    ]);
  });

  it("copies the plan's clock and timezone to the corridor it scheduled", () => {
    seedOld();
    upgradeStoredCoordination();
    const [cal, other] = read(keys.corridors);
    expect(cal).toMatchObject({ referenceClock: "LOCAL", timezone: "America/Los_Angeles" });
    // OTHER had no schedule rows, but with only one plan there's no doubt whose it is.
    expect(other).toMatchObject({ referenceClock: "LOCAL", timezone: "America/Los_Angeles" });
  });

  it("with several plans, only fills corridors a plan's schedule rows lead to", () => {
    seedOld([
      {
        coordinationId: "COORD-CAL",
        name: null,
        referenceClock: "LOCAL",
        timezone: "America/Los_Angeles",
        description: null,
      },
      {
        coordinationId: "COORD-2",
        name: null,
        referenceClock: "GPS",
        timezone: "UTC",
        description: null,
      },
    ]);
    upgradeStoredCoordination();
    const [cal, other] = read(keys.corridors);
    expect(cal).toMatchObject({ referenceClock: "LOCAL", timezone: "America/Los_Angeles" });
    expect(other.timezone ?? null).toBeNull();
  });

  it("removes the old key, so it runs once", () => {
    seedOld();
    upgradeStoredCoordination();
    expect(localStorage.getItem(LEGACY_COORDINATION_STORAGE_KEY)).toBeNull();
    const after = localStorage.getItem(keys.schedule);
    expect(upgradeStoredCoordination()).toBe(false);
    expect(localStorage.getItem(keys.schedule)).toBe(after);
  });

  it("leaves everything alone while storage is read-only, and tries again later", () => {
    seedOld();
    const before = JSON.stringify(readAllCoordination());
    setStorageReadOnly(true);
    try {
      upgradeStoredCoordination();
    } finally {
      setStorageReadOnly(false);
    }
    expect(JSON.stringify(readAllCoordination())).toBe(before);
    expect(localStorage.getItem(LEGACY_COORDINATION_STORAGE_KEY)).not.toBeNull();
    expect(upgradeStoredCoordination()).toBe(true);
  });

  it("is cleared along with everything else", () => {
    seedOld();
    clearAllCoordination();
    expect(localStorage.getItem(LEGACY_COORDINATION_STORAGE_KEY)).toBeNull();
  });
});
