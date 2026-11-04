import { bearingToCardinal } from "../agencyDefaults";
import { parseCSVLine, sanitizeCSVField } from "./csv-utils";
import { getFromStorage, removeFromStorage, saveToStorage } from "./storage-utils";

/**
 * Preemption (beta): which phases each preempt channel brings up at a signal.
 *
 * preempt.txt has one row per phase of a channel, so a channel serving phases 1
 * and 6 at signal 1 is two rows:
 *
 *   preempt_channel,signalID,type,phase,maxTime
 *   3,1,EMERGENCY,1,120
 *   3,1,EMERGENCY,6,120
 *
 * The file says nothing about direction. That comes from GTSS: phases.txt says
 * which approach and movement a phase runs on, approaches.txt which way that
 * approach heads. There's no published spec for this file, so the column names
 * above, taken from a real export, are the format; it is written back with them.
 */

export interface PreemptRow {
  channel: number;
  signalId: string;
  /** EMERGENCY in the data seen so far; kept as written. */
  type: string | null;
  phase: number;
  /** Seconds, as written. Blank is null; 0 stays 0, not "unknown". */
  maxTimeS: number | null;
}

export const PREEMPT_FILENAME = "preempt.txt";
export const PREEMPT_STORAGE_KEY = "gtss_preempts";

const HEADER = ["preempt_channel", "signalID", "type", "phase", "maxTime"];

/** "GTSS-preempt.txt", "preempt.txt", "Preemption.txt": any file named for preemption. */
export const isPreemptFile = (filename: string): boolean =>
  /preempt/i.test(filename.split("/").pop() ?? "");

// --- Reading and writing the file ------------------------------------------

/** Header names ignoring case and underscores, so signalID and signal_id both read. */
const normalize = (name: string) => name.trim().toLowerCase().replace(/[\s_]/g, "");

const COLUMN_NAMES = {
  channel: ["preemptchannel", "channel", "preempt"],
  signal: ["signalid", "signal"],
  type: ["type", "preempttype"],
  phase: ["phase", "phaseid"],
  maxTime: ["maxtime", "maxtimes", "maxtimesec"],
} as const;

const wholeNumber = (value: string): number | null => {
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
};

/**
 * Parse preempt.txt. Fields are read by header name, so reordered columns are
 * fine. Every bad row is reported together, as the other parsers do.
 */
export function parsePreemptTXT(content: string): PreemptRow[] {
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length === 0) return [];

  const header = parseCSVLine(lines[0]).map(normalize);
  const at = (names: readonly string[]) => header.findIndex((h) => names.includes(h));
  const positions = {
    channel: at(COLUMN_NAMES.channel),
    signal: at(COLUMN_NAMES.signal),
    type: at(COLUMN_NAMES.type),
    phase: at(COLUMN_NAMES.phase),
    maxTime: at(COLUMN_NAMES.maxTime),
  };
  if (positions.channel < 0 || positions.signal < 0 || positions.phase < 0) {
    throw new Error(
      "A preempt file needs preempt_channel, signalID and phase columns in its header.",
    );
  }

  const rows: PreemptRow[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const field = (index: number) => (index < 0 ? "" : (values[index] ?? "").trim());
    const channel = wholeNumber(field(positions.channel));
    const signalId = field(positions.signal);
    const phase = wholeNumber(field(positions.phase));
    const maxText = field(positions.maxTime);
    const maxTimeS = maxText === "" ? null : wholeNumber(maxText);

    const problems = [
      channel === null || channel < 1 ? "preempt_channel must be a whole number from 1 up" : null,
      signalId === "" ? "signalID is required" : null,
      phase === null || phase < 1 ? "phase must be a whole number from 1 up" : null,
      maxText !== "" && maxTimeS === null ? "maxTime must be a whole number of seconds" : null,
    ].filter(Boolean);
    if (problems.length > 0) {
      errors.push(`Row ${i + 1}: ${problems.join("; ")}`);
      continue;
    }
    rows.push({
      channel: channel as number,
      signalId,
      type: field(positions.type) || null,
      phase: phase as number,
      maxTimeS,
    });
  }
  if (errors.length > 0) throw new Error(`Preempt validation errors:\n${errors.join("\n")}`);
  return rows;
}

/** The file, with the export's own header. Empty gets a trailing newline, like the others. */
export function generatePreemptCSV(rows: readonly PreemptRow[]): string {
  const header = HEADER.join(",");
  if (rows.length === 0) return `${header}\n`;
  const body = rows.map((r) =>
    [r.channel, r.signalId, r.type, r.phase, r.maxTimeS].map(sanitizeCSVField).join(","),
  );
  return [header, ...body].join("\n");
}

/**
 * The rows to export for the agencies chosen. A row goes only if its signal
 * belongs to an agency left out. One for a signal not in signals.txt has no
 * agency to leave out, so it stays: the file can be imported on its own, and
 * filtering by known signals would then quietly export nothing.
 */
export function preemptRowsForExport(
  rows: readonly PreemptRow[],
  allSignalIds: readonly string[],
  chosenSignalIds: readonly string[],
): PreemptRow[] {
  const chosen = new Set(chosenSignalIds);
  const leftOut = new Set(allSignalIds.filter((id) => !chosen.has(id)));
  return rows.filter((r) => !leftOut.has(r.signalId));
}

// --- Storage ---------------------------------------------------------------

/** The natural key: a channel lists a phase at a signal once. */
const identity = (r: PreemptRow) => `${r.signalId}\u001f${r.channel}\u001f${r.phase}`;

const read = () => getFromStorage<PreemptRow[]>(PREEMPT_STORAGE_KEY, []);
const write = (rows: readonly PreemptRow[]) => saveToStorage(PREEMPT_STORAGE_KEY, rows);

/** Whether a row belongs to one signal's one channel. */
const isChannel = (signalId: string, channel: number) => (r: PreemptRow) =>
  r.signalId === signalId && r.channel === channel;

export const preemptStorage = {
  getAll: (): PreemptRow[] => read(),

  clear: (): void => removeFromStorage(PREEMPT_STORAGE_KEY),

  /** Replace what is stored. An empty list is "this file had no rows", and clears it. */
  replace: (rows: readonly PreemptRow[]): void => write(rows),

  /** Add rows that aren't stored yet; a row already there keeps what it says. */
  merge: (rows: readonly PreemptRow[]): void => {
    const existing = read();
    const seen = new Set(existing.map(identity));
    const added = rows.filter((row) => {
      const key = identity(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (added.length > 0) write([...existing, ...added]);
  },

  deleteBySignal: (signalId: string): void => {
    const rows = read();
    const kept = rows.filter((r) => r.signalId !== signalId);
    if (kept.length !== rows.length) write(kept);
  },

  /** Follow a renamed signal. A row that would duplicate one already there stays put. */
  updateSignalId: (oldId: string, newId: string): void => {
    const rows = read();
    const taken = new Set(rows.map(identity));
    let changed = false;
    const next = rows.map((row) => {
      if (row.signalId !== oldId) return row;
      const moved = { ...row, signalId: newId };
      if (taken.has(identity(moved))) return row;
      taken.add(identity(moved));
      changed = true;
      return moved;
    });
    if (changed) write(next);
  },
};

/** What a save or delete did to one channel, to undo it. */
export interface PreemptChange {
  signalId: string;
  channel: number;
  /** The channel's rows before; empty if it is new. */
  previous: PreemptRow[];
  /** Where its rows sit in the file. */
  index: number;
}

/**
 * Replace one channel's rows with `rows`, where the old ones were. A new channel
 * goes in channel order among the signal's others, else at the end, so the file
 * stays grouped as it came. Writing no rows deletes the channel.
 */
export function writePreemptChannel(
  signalId: string,
  channel: number,
  rows: readonly PreemptRow[],
): PreemptChange {
  const all = read();
  const mine = isChannel(signalId, channel);
  const previous = all.filter(mine);
  const rest = all.filter((r) => !mine(r));
  let index = all.findIndex(mine);
  if (index === -1) {
    let afterLower = -1;
    let firstOfSignal = -1;
    rest.forEach((r, i) => {
      if (r.signalId !== signalId) return;
      if (firstOfSignal === -1) firstOfSignal = i;
      if (r.channel < channel) afterLower = i;
    });
    index = afterLower !== -1 ? afterLower + 1 : firstOfSignal !== -1 ? firstOfSignal : rest.length;
  }
  rest.splice(index, 0, ...rows);
  write(rest);
  return { signalId, channel, previous, index };
}

export const deletePreemptChannel = (signalId: string, channel: number): PreemptChange =>
  writePreemptChannel(signalId, channel, []);

/** Put a channel back as it was before a save or delete. */
export function undoPreemptChange(change: PreemptChange): void {
  const rest = read().filter((r) => !isChannel(change.signalId, change.channel)(r));
  rest.splice(Math.min(change.index, rest.length), 0, ...change.previous);
  write(rest);
}

// --- What a channel does ---------------------------------------------------

/** The GTSS data a channel's directions come from. */
export interface PreemptGtssData {
  phases: readonly {
    signalId: string;
    phase: number;
    movementType: string;
    approachId?: string | null;
  }[];
  approaches: readonly {
    signalId: string;
    approachId: string;
    streetName?: string | null;
    compassBearing?: number | null;
  }[];
}

/** One arrow a channel brings up. A phase on two approaches is two of these. */
export interface PreemptMovement {
  phase: number;
  approachId: string | null;
  /** Null when phases.txt has no such phase at this signal. */
  movementType: string | null;
  /** "NB", "EB"…: the way traffic on the approach heads. Null if that isn't known. */
  direction: string | null;
  street: string | null;
  /** How the movement reads: "through", "left (FYA)". */
  label: string | null;
  /** Why it has no arrow, in words. Null when it can be drawn. */
  problem: string | null;
}

export interface PreemptChannel {
  signalId: string;
  channel: number;
  /** Distinct values in the channel's rows: normally one of each. */
  types: string[];
  maxTimes: number[];
  movements: PreemptMovement[];
}

const MOVEMENT_LABELS: Record<string, string> = {
  Through: "through",
  "Left Turn": "left",
  Left: "left",
  "Left Protected-Permissive": "left (LPP)",
  "Flashing Yellow Arrow": "left (FYA)",
  "Left Through Shared": "left + through",
  "Permissive Phase": "through + permissive left",
  "Right Turn": "right",
  Right: "right",
  "Through-Right": "through + right",
  "U-Turn": "U-turn",
  Pedestrian: "pedestrian",
};

/** A phase's movements at a signal, worked out from phases.txt and approaches.txt. */
export function movementsOfPhase(
  signalId: string,
  phase: number,
  gtss: PreemptGtssData,
): PreemptMovement[] {
  const rows = gtss.phases.filter((p) => p.signalId === signalId && p.phase === phase);
  if (rows.length === 0) {
    return [
      {
        phase,
        approachId: null,
        movementType: null,
        direction: null,
        street: null,
        label: null,
        problem: "not in phases.txt",
      },
    ];
  }
  return rows.map((row) => {
    const approach = gtss.approaches.find(
      (a) => a.signalId === signalId && a.approachId === row.approachId,
    );
    const cardinal = bearingToCardinal(approach?.compassBearing);
    const pedestrian = row.movementType === "Pedestrian";
    return {
      phase,
      approachId: row.approachId ?? null,
      movementType: row.movementType,
      direction: cardinal ? `${cardinal}B` : null,
      street: approach?.streetName?.trim() || null,
      label: MOVEMENT_LABELS[row.movementType] ?? row.movementType,
      problem: pedestrian
        ? "pedestrian only, so no arrow"
        : cardinal
          ? null
          : "its approach has no bearing",
    };
  });
}

/** A signal's channels in number order, each with its phases' movements in phase order. */
export function preemptChannelsFor(
  rows: readonly PreemptRow[],
  signalId: string,
  gtss: PreemptGtssData,
): PreemptChannel[] {
  const mine = rows.filter((r) => r.signalId === signalId);
  const channels = Array.from(new Set(mine.map((r) => r.channel))).sort((a, b) => a - b);
  return channels.map((channel) => {
    const own = mine.filter((r) => r.channel === channel);
    const phases = Array.from(new Set(own.map((r) => r.phase))).sort((a, b) => a - b);
    return {
      signalId,
      channel,
      types: Array.from(new Set(own.map((r) => r.type).filter((t): t is string => t !== null))),
      maxTimes: Array.from(
        new Set(own.map((r) => r.maxTimeS).filter((t): t is number => t !== null)),
      ),
      movements: phases.flatMap((phase) => movementsOfPhase(signalId, phase, gtss)),
    };
  });
}

/** One channel's rows, in phase order. */
export const preemptRowsFor = (
  signalId: string,
  channel: number,
  phases: readonly number[],
  type: string | null,
  maxTimeS: number | null,
): PreemptRow[] =>
  Array.from(new Set(phases))
    .sort((a, b) => a - b)
    .map((phase) => ({ channel, signalId, type, phase, maxTimeS }));
