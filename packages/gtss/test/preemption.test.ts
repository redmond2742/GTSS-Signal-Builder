import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_AGENCY_DEFAULTS, isPreemptionEnabled } from "../src/agencyDefaults";
import { clearAllData } from "../src/localStorage/clearAll";
import { importData } from "../src/localStorage/imports";
import {
  deletePreemptChannel,
  generatePreemptCSV,
  isPreemptFile,
  parsePreemptTXT,
  preemptChannelsFor,
  preemptRowsFor,
  preemptRowsForExport,
  preemptStorage,
  undoPreemptChange,
  writePreemptChannel,
  type PreemptGtssData,
  type PreemptRow,
} from "../src/localStorage/preemption";
import { signalStorage } from "../src/localStorage/storage/signals";
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

// Rows from a real export.
const SAMPLE = `preempt_channel,signalID,type,phase,maxTime
3,1,EMERGENCY,1,120
3,1,EMERGENCY,6,120
4,1,EMERGENCY,2,120
4,1,EMERGENCY,5,120
5,1,EMERGENCY,3,120
6,1,EMERGENCY,4,120
4,16,EMERGENCY,1,120
4,16,EMERGENCY,6,120
4,16,EMERGENCY,9,120
3,17,EMERGENCY,2,0
3,22,EMERGENCY,2,90`;

// The same signals' approaches and phases, from the export they go with.
const GTSS: PreemptGtssData = {
  approaches: [
    { signalId: "1", approachId: "1-1", streetName: "Oakland Blvd", compassBearing: 23 },
    { signalId: "1", approachId: "1-2", streetName: "Ygnacio Valley Road", compassBearing: 120 },
    { signalId: "1", approachId: "1-3", streetName: "Bart Station", compassBearing: 203 },
    { signalId: "1", approachId: "1-4", streetName: "Ygnacio Valley Road", compassBearing: 272 },
    { signalId: "22", approachId: "22-2", streetName: "Pringle Ave", compassBearing: 90 },
    { signalId: "22", approachId: "22-4", streetName: "Pringle Ave", compassBearing: 281 },
  ],
  phases: [
    { signalId: "1", phase: 1, movementType: "Left Turn", approachId: "1-2" },
    { signalId: "1", phase: 2, movementType: "Through", approachId: "1-4" },
    { signalId: "1", phase: 3, movementType: "Left Turn", approachId: "1-1" },
    { signalId: "1", phase: 4, movementType: "Through", approachId: "1-3" },
    { signalId: "1", phase: 5, movementType: "Left Turn", approachId: "1-4" },
    { signalId: "1", phase: 6, movementType: "Through", approachId: "1-2" },
    { signalId: "16", phase: 1, movementType: "Left Turn", approachId: null },
    { signalId: "16", phase: 6, movementType: "Pedestrian", approachId: null },
    // One phase on two approaches, as phases.txt really has at signal 22.
    { signalId: "22", phase: 2, movementType: "Permissive Phase", approachId: "22-4" },
    { signalId: "22", phase: 2, movementType: "Permissive Phase", approachId: "22-2" },
  ],
};

const rows = () => parsePreemptTXT(SAMPLE);
const stored = () => preemptStorage.getAll();

describe("the beta flag", () => {
  it("is off by default, and for defaults saved before it existed", () => {
    expect(isPreemptionEnabled(DEFAULT_AGENCY_DEFAULTS)).toBe(false);
    expect(isPreemptionEnabled(null)).toBe(false);
    expect(isPreemptionEnabled({ ...DEFAULT_AGENCY_DEFAULTS, showPreemption: undefined })).toBe(
      false,
    );
    expect(isPreemptionEnabled({ ...DEFAULT_AGENCY_DEFAULTS, showPreemption: true })).toBe(true);
  });
});

describe("reading and writing preempt.txt", () => {
  it("reads a row per phase", () => {
    expect(rows()).toHaveLength(11);
    expect(rows()[0]).toEqual({
      channel: 3,
      signalId: "1",
      type: "EMERGENCY",
      phase: 1,
      maxTimeS: 120,
    });
  });

  it("keeps a max time of 0 as 0, and a blank one as blank", () => {
    expect(rows().find((r) => r.signalId === "17")?.maxTimeS).toBe(0);
    const blank = parsePreemptTXT("preempt_channel,signalID,type,phase,maxTime\n3,1,,2,");
    expect(blank[0]).toMatchObject({ type: null, maxTimeS: null });
  });

  it("writes the file back byte for byte", () => {
    expect(generatePreemptCSV(rows())).toBe(SAMPLE);
  });

  it("writes a header for no rows, so the file is still valid", () => {
    expect(generatePreemptCSV([])).toBe("preempt_channel,signalID,type,phase,maxTime\n");
  });

  it("reads columns by name, in any order and either spelling", () => {
    const shuffled = "max_time,phase,signal_id,type,preempt_channel\n120,6,1,EMERGENCY,3";
    expect(parsePreemptTXT(shuffled)).toEqual([
      { channel: 3, signalId: "1", type: "EMERGENCY", phase: 6, maxTimeS: 120 },
    ]);
  });

  it("copes with Windows line endings and a byte-order mark", () => {
    const windows = `\uFEFF${SAMPLE.split("\n").slice(0, 2).join("\r\n")}\r\n`;
    expect(parsePreemptTXT(windows)).toEqual([rows()[0]]);
  });

  it("reports every bad row together", () => {
    const bad = [
      "preempt_channel,signalID,type,phase,maxTime",
      "x,1,EMERGENCY,2,120",
      "3,,EMERGENCY,2,120",
      "3,1,EMERGENCY,0,120",
      "3,1,EMERGENCY,2,soon",
    ].join("\n");
    expect(() => parsePreemptTXT(bad)).toThrow(
      /Row 2: preempt_channel[\s\S]*Row 3: signalID[\s\S]*Row 4: phase[\s\S]*Row 5: maxTime/,
    );
  });

  it("says so when the file isn't a preempt file", () => {
    expect(() => parsePreemptTXT("signal_id,agency_id\n1,WC-CA")).toThrow(/preempt_channel/);
  });

  it("knows the file by name, wherever it sits", () => {
    expect(isPreemptFile("preempt.txt")).toBe(true);
    expect(isPreemptFile("GTSS-preempt.txt")).toBe(true);
    expect(isPreemptFile("export/Preemption.txt")).toBe(true);
    expect(isPreemptFile("phases.txt")).toBe(false);
    expect(isPreemptFile("preempt/phases.txt")).toBe(false);
  });
});

describe("what a channel does", () => {
  it("lists a signal's channels in order, with type and max time", () => {
    const channels = preemptChannelsFor(rows(), "1", GTSS);
    expect(channels.map((c) => c.channel)).toEqual([3, 4, 5, 6]);
    expect(channels[0]).toMatchObject({ types: ["EMERGENCY"], maxTimes: [120] });
  });

  it("takes each phase's direction from its approach's heading", () => {
    const [three, four, five, six] = preemptChannelsFor(rows(), "1", GTSS);
    const read = (c: typeof three) =>
      c.movements.map((m) => `φ${m.phase} ${m.direction} ${m.label}`);
    // φ1 and φ6 both run on 1-2, bearing 120.
    expect(read(three)).toEqual(["φ1 EB left", "φ6 EB through"]);
    // φ2 and φ5 both run on 1-4, bearing 272.
    expect(read(four)).toEqual(["φ2 WB through", "φ5 WB left"]);
    expect(read(five)).toEqual(["φ3 NB left"]);
    expect(read(six)).toEqual(["φ4 SB through"]);
    expect(three.movements[0].street).toBe("Ygnacio Valley Road");
  });

  it("gives a phase on two approaches both its movements", () => {
    const [channel] = preemptChannelsFor(rows(), "22", GTSS);
    expect(channel.movements.map((m) => `${m.direction} ${m.label}`)).toEqual([
      "WB through + permissive left",
      "EB through + permissive left",
    ]);
  });

  it("says why a phase can't be drawn, rather than dropping it", () => {
    const [channel] = preemptChannelsFor(rows(), "16", GTSS);
    expect(channel.movements.map((m) => [m.phase, m.problem])).toEqual([
      [1, "its approach has no bearing"],
      [6, "pedestrian only, so no arrow"],
      [9, "not in phases.txt"],
    ]);
  });

  it("still lists channels at a signal GTSS knows nothing about", () => {
    const [channel] = preemptChannelsFor(rows(), "17", { phases: [], approaches: [] });
    expect(channel.maxTimes).toEqual([0]);
    expect(channel.movements[0]).toMatchObject({ phase: 2, problem: "not in phases.txt" });
  });

  it("shows every value when a channel's rows disagree", () => {
    const mixed = [
      ...preemptRowsFor("1", 3, [1], "EMERGENCY", 120),
      ...preemptRowsFor("1", 3, [6], "RAILROAD", 90),
    ];
    const [channel] = preemptChannelsFor(mixed, "1", GTSS);
    expect(channel.types).toEqual(["EMERGENCY", "RAILROAD"]);
    expect(channel.maxTimes).toEqual([120, 90]);
  });

  it("lists a phase once however many rows repeat it", () => {
    const twice = [...rows().slice(0, 1), ...rows().slice(0, 1)];
    expect(preemptChannelsFor(twice, "1", GTSS)[0].movements).toHaveLength(1);
  });
});

describe("storing rows", () => {
  it("replaces, and an empty file clears", () => {
    preemptStorage.replace(rows());
    expect(stored()).toHaveLength(11);
    preemptStorage.replace([]);
    expect(stored()).toEqual([]);
  });

  it("merges without duplicating, within the file or against what is there", () => {
    preemptStorage.replace(rows().slice(0, 2));
    const changed = { ...rows()[0], maxTimeS: 999 };
    preemptStorage.merge([changed, rows()[2], rows()[2]]);
    expect(stored()).toHaveLength(3);
    // A row already there keeps what it says.
    expect(stored()[0].maxTimeS).toBe(120);
  });

  it("imports through importData, replacing or merging, and leaves it alone if absent", () => {
    importData({ preempts: rows() }, "replace");
    expect(stored()).toHaveLength(11);
    importData({ signals: [] }, "replace");
    expect(stored()).toHaveLength(11);
    importData({ preempts: preemptRowsFor("2", 3, [2], "EMERGENCY", 120) }, "merge");
    expect(stored()).toHaveLength(12);
    importData({ preempts: [] }, "replace");
    expect(stored()).toEqual([]);
  });

  it("is cleared with everything else", () => {
    preemptStorage.replace(rows());
    clearAllData();
    expect(stored()).toEqual([]);
  });

  it("is blocked by the storage read-only guard", () => {
    preemptStorage.replace(rows());
    const before = JSON.stringify(stored());
    setStorageReadOnly(true);
    try {
      preemptStorage.replace([]);
      preemptStorage.deleteBySignal("1");
      deletePreemptChannel("1", 3);
    } finally {
      setStorageReadOnly(false);
    }
    expect(JSON.stringify(stored())).toBe(before);
  });
});

describe("exporting", () => {
  const signals = (r: readonly PreemptRow[]) => Array.from(new Set(r.map((x) => x.signalId)));

  it("keeps every row with all agencies chosen", () => {
    const all = ["1", "16", "17", "22"];
    expect(preemptRowsForExport(rows(), all, all)).toEqual(rows());
  });

  it("leaves out the signals of agencies not chosen", () => {
    const kept = preemptRowsForExport(rows(), ["1", "16", "17", "22"], ["22"]);
    expect(signals(kept)).toEqual(["22"]);
  });

  it("keeps a row for a signal not in signals.txt, which has no agency to leave out", () => {
    // Signal 16 and 17 aren't known; signal 1's agency isn't chosen.
    const kept = preemptRowsForExport(rows(), ["1", "22"], ["22"]);
    expect(signals(kept)).toEqual(["16", "17", "22"]);
  });

  it("keeps everything when a preempt file was imported on its own", () => {
    expect(generatePreemptCSV(preemptRowsForExport(rows(), [], []))).toBe(SAMPLE);
  });
});

describe("following a signal", () => {
  const signal = (signalId: string) => ({
    id: `id-${signalId}`,
    signalId,
    agencyId: "A",
    streetName1: "Main",
    streetName2: "First",
    latitude: 37,
    longitude: -122,
  });

  it("deletes a signal's rows with the signal", () => {
    localStorage.setItem("gtss_signals", JSON.stringify([signal("1")]));
    preemptStorage.replace(rows());
    signalStorage.delete("1");
    expect(stored().some((r) => r.signalId === "1")).toBe(false);
    expect(stored().some((r) => r.signalId === "22")).toBe(true);
  });

  it("follows a renamed signal", () => {
    localStorage.setItem("gtss_signals", JSON.stringify([signal("1")]));
    preemptStorage.replace(rows());
    signalStorage.update("1", { signalId: "101" });
    expect(stored().filter((r) => r.signalId === "101")).toHaveLength(6);
    expect(stored().some((r) => r.signalId === "1")).toBe(false);
  });

  it("leaves a row that would duplicate one already at the new ID", () => {
    const both: PreemptRow[] = [
      ...preemptRowsFor("1", 3, [2, 5], "EMERGENCY", 120),
      ...preemptRowsFor("2", 3, [2], "EMERGENCY", 90),
    ];
    preemptStorage.replace(both);
    preemptStorage.updateSignalId("1", "2");
    expect(stored().map((r) => `${r.signalId}:${r.phase}:${r.maxTimeS}`)).toEqual([
      "1:2:120",
      "2:5:120",
      "2:2:90",
    ]);
  });
});

describe("saving a channel", () => {
  const channelsOf = (signalId: string) =>
    stored()
      .filter((r) => r.signalId === signalId)
      .map((r) => r.channel);

  it("builds a channel's rows in phase order, once each", () => {
    expect(preemptRowsFor("1", 3, [6, 1, 6], "EMERGENCY", 120).map((r) => r.phase)).toEqual([1, 6]);
  });

  it("replaces a channel's rows where they were, and undoes exactly", () => {
    preemptStorage.replace(rows());
    const before = JSON.stringify(stored());
    const next = preemptRowsFor("1", 4, [2], "EMERGENCY", 90);
    const change = writePreemptChannel("1", 4, next);
    expect(stored()).toHaveLength(10);
    expect(stored()[2]).toEqual(next[0]);
    expect(channelsOf("1")).toEqual([3, 3, 4, 5, 6]);
    expect(change.previous).toEqual(rows().slice(2, 4));
    undoPreemptChange(change);
    expect(JSON.stringify(stored())).toBe(before);
  });

  it("puts a new channel in order among the signal's others", () => {
    preemptStorage.replace(rows());
    const before = JSON.stringify(stored());
    // Below all of signal 1's: before its first row.
    const low = writePreemptChannel("1", 1, preemptRowsFor("1", 1, [2], "EMERGENCY", 120));
    expect(channelsOf("1")).toEqual([1, 3, 3, 4, 4, 5, 6]);
    undoPreemptChange(low);
    expect(JSON.stringify(stored())).toBe(before);
    // Above all of them: after its last, before the next signal's.
    writePreemptChannel("1", 7, preemptRowsFor("1", 7, [2], "EMERGENCY", 120));
    expect(channelsOf("1")).toEqual([3, 3, 4, 4, 5, 6, 7]);
    expect(stored()[6].signalId).toBe("1");
    expect(stored()[7].signalId).toBe("16");
  });

  it("starts a signal's first channel at the end of the file", () => {
    preemptStorage.replace(rows());
    writePreemptChannel("99", 3, preemptRowsFor("99", 3, [2], "EMERGENCY", 120));
    expect(stored()[stored().length - 1].signalId).toBe("99");
  });

  it("deletes a channel, and undoes that too", () => {
    preemptStorage.replace(rows());
    const before = JSON.stringify(stored());
    const change = deletePreemptChannel("1", 4);
    expect(channelsOf("1")).toEqual([3, 3, 5, 6]);
    undoPreemptChange(change);
    expect(JSON.stringify(stored())).toBe(before);
  });
});
