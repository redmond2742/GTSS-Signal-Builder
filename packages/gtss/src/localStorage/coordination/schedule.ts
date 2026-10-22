import { sortBySequence } from "./corridor-order";
import type { CoordinationRows, Pattern, ScheduleEntry } from "./rows";
import { ringSplitTotals } from "./splitTotals";

/**
 * Schedule.txt, read as a calendar.
 *
 * The file says "on this day type, between these times, run this pattern".
 * There is no signal_id in it: one schedule covers the whole corridor, and
 * signals differ only in how each pattern treats them (coordinated, free inside
 * a coordinated pattern, or missing a row). So "do the signals line up" is
 * answered per time block, by looking at every signal's state in the pattern
 * that block selects — see `alignDaySchedule`.
 */

export const DAY_MINUTES = 24 * 60;

// --- Clock times -----------------------------------------------------------

/**
 * "HH:MM" or "HH:MM:SS" as minutes since midnight, or null if it isn't one.
 * "24:00:00" is valid — it is how the files say "end of day".
 */
export function parseClock(text: string | null | undefined): number | null {
  if (text == null) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!match) return null;
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (minutes > 59 || seconds > 59) return null;
  const total = Number(match[1]) * 60 + minutes + seconds / 60;
  return total > DAY_MINUTES ? null : total;
}

/** Inverse of `parseClock`, dropping seconds when there are none. */
export function formatClock(minutesSinceMidnight: number): string {
  const totalSeconds = Math.round(minutesSinceMidnight * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return s === 0 ? `${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// --- Day types -------------------------------------------------------------

export interface DayTypeInfo {
  /** The raw value from the file; what entries are matched on. */
  dayType: string;
  /** "Weekday", "Mon May 25–31". */
  label: string;
  /** Column-header form: "Mon–Fri". */
  short: string;
  kind: "weekday" | "saturday" | "sunday" | "special" | "other";
}

const KIND_ORDER: Record<DayTypeInfo["kind"], number> = {
  weekday: 0,
  saturday: 1,
  sunday: 2,
  other: 3,
  special: 4,
};

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
const abbreviate = (word: string) => titleCase(word.slice(0, 3));

/**
 * Name a day type. WEEKDAY / SATURDAY / SUNDAY are the weekly schedule;
 * SPECIAL_<DOW>_<MON>_D<from>-<to> is "that weekday within those dates of that
 * month" (so SPECIAL_MONDAY_MAY_D25-31 is the last Monday in May). Anything
 * else is passed through as written rather than guessed at.
 */
export function describeDayType(dayType: string | null | undefined): DayTypeInfo {
  const raw = (dayType ?? "").trim();
  const upper = raw.toUpperCase();

  if (upper === "WEEKDAY")
    return { dayType: raw, label: "Weekday", short: "Mon–Fri", kind: "weekday" };
  if (upper === "SATURDAY")
    return { dayType: raw, label: "Saturday", short: "Sat", kind: "saturday" };
  if (upper === "SUNDAY") return { dayType: raw, label: "Sunday", short: "Sun", kind: "sunday" };

  const special = /^SPECIAL_([A-Z]+)_([A-Z]+)_D(\d{1,2})-(\d{1,2})$/.exec(upper);
  if (special) {
    const label = `${abbreviate(special[1])} ${abbreviate(special[2])} ${special[3]}–${special[4]}`;
    return { dayType: raw, label, short: label, kind: "special" };
  }

  const label = raw === "" ? "(no day type)" : titleCase(raw.replace(/_/g, " "));
  return {
    dayType: raw,
    label,
    short: label,
    kind: upper.startsWith("SPECIAL") ? "special" : "other",
  };
}

// --- Blocks and segments ---------------------------------------------------

/** One stretch of the day an entry puts a pattern in force. */
export interface ScheduleBlock {
  scheduleId: string;
  patternId: string | null;
  priority: number;
  startMin: number;
  endMin: number;
  /**
   * An entry whose end is before its start runs past midnight and is cut in two
   * at 24:00: "head" is the evening half, "tail" the small-hours half. Both are
   * drawn on the same day type, which is how the converter lays them out.
   */
  wrap: "head" | "tail" | null;
}

export interface ExpandedEntry {
  blocks: ScheduleBlock[];
  /** Why no blocks came out, if that's the reason. */
  problem: "unparseable" | "empty" | null;
}

/** Turn one Schedule row into one block, or two if it crosses midnight. */
export function expandEntry(entry: ScheduleEntry): ExpandedEntry {
  const start = parseClock(entry.startTime);
  const end = parseClock(entry.endTime);
  if (start === null || end === null) return { blocks: [], problem: "unparseable" };
  if (start === end) return { blocks: [], problem: "empty" };

  const base = {
    scheduleId: entry.scheduleId,
    patternId: entry.patternId,
    priority: entry.priority ?? 0,
  };
  if (start < end) {
    return { blocks: [{ ...base, startMin: start, endMin: end, wrap: null }], problem: null };
  }

  const blocks: ScheduleBlock[] = [{ ...base, startMin: start, endMin: DAY_MINUTES, wrap: "head" }];
  // "18:00 → 00:00" has no small-hours half.
  if (end > 0) blocks.push({ ...base, startMin: 0, endMin: end, wrap: "tail" });
  return { blocks, problem: null };
}

/** A stretch of the day with the block that wins it. */
export interface Segment {
  startMin: number;
  endMin: number;
  /** Null where no entry covers the time. */
  block: ScheduleBlock | null;
  /** Other blocks of the SAME priority claiming this time — a genuine conflict. */
  conflicts: ScheduleBlock[];
}

/**
 * Flatten possibly-overlapping blocks into the stretches that are actually in
 * force, in time order, covering the whole day.
 *
 * Where blocks overlap the higher priority wins; that is what priority is for,
 * and it is how a SPECIAL_* range overrides the weekly schedule. Overlap at the
 * SAME priority has no rule to resolve it, so the first block (file order) is
 * shown and the rest are reported in `conflicts`. Uncovered time comes back as
 * a segment with a null block rather than being left out, so callers can draw
 * and report the hole.
 */
export function effectiveSegments(blocks: readonly ScheduleBlock[]): Segment[] {
  const cuts = Array.from(
    new Set([0, DAY_MINUTES, ...blocks.flatMap((b) => [b.startMin, b.endMin])]),
  ).sort((a, b) => a - b);

  const raw: Segment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const startMin = cuts[i];
    const endMin = cuts[i + 1];
    const covering = blocks.filter((b) => b.startMin <= startMin && b.endMin >= endMin);
    if (covering.length === 0) {
      raw.push({ startMin, endMin, block: null, conflicts: [] });
      continue;
    }
    const top = Math.max(...covering.map((b) => b.priority));
    const winners = covering.filter((b) => b.priority === top);
    raw.push({ startMin, endMin, block: winners[0], conflicts: winners.slice(1) });
  }

  // Neighbours with the same outcome were only split by someone else's boundary.
  const merged: Segment[] = [];
  for (const seg of raw) {
    const prev = merged[merged.length - 1];
    const sameConflicts =
      prev !== undefined &&
      prev.conflicts.length === seg.conflicts.length &&
      prev.conflicts.every((c, i) => c === seg.conflicts[i]);
    if (prev && prev.block === seg.block && sameConflicts) {
      prev.endMin = seg.endMin;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

// --- Per-signal state ------------------------------------------------------

/** What one signal does while one pattern is in force. */
export type SignalPatternState =
  /** Runs the pattern's cycle, held to its coordinated phase. */
  | {
      kind: "coordinated";
      phase: number;
      offsetS: number | null;
      /** True if any ring's splits don't sum to the pattern's cycle. */
      cycleMismatch: boolean;
    }
  /** The whole pattern is free (cycle 0 / pattern 254): nobody is coordinated. */
  | { kind: "free-pattern" }
  /** The pattern is coordinated but this signal's coordinated phase is blank. */
  | { kind: "free-signal" }
  /** The pattern is coordinated and has no PatternSignals row for this signal. */
  | { kind: "missing" }
  /** The schedule names a pattern that isn't in Patterns.txt. */
  | { kind: "unknown-pattern" };

/** Cycle 0, or pattern 254, is how the files say "runs free". */
export const isFreePattern = (pattern: Pattern): boolean =>
  (pattern.cycleLengthS ?? 0) <= 0 || pattern.patternNumber === 254;

export interface AlignedSegment extends Segment {
  pattern: Pattern | undefined;
  /** Keyed by signal id, in the same order as `DayAlignment.signalIds`. */
  states: Map<string, SignalPatternState>;
  /** Things that stop this stretch of the day lining up. Empty means it does. */
  notes: string[];
}

export interface DayAlignment {
  day: DayTypeInfo;
  /** Corridor signals in travel order. */
  signalIds: string[];
  referenceSignalId: string | null;
  segments: AlignedSegment[];
  /** Entries that couldn't be placed at all (bad times). */
  unplaceable: string[];
}

/** Schedule rows that belong to a corridor, found through their pattern. */
export function scheduleEntriesForCorridor(
  rows: Pick<CoordinationRows, "schedule" | "patterns">,
  corridorId: string,
): ScheduleEntry[] {
  const corridorOf = new Map(rows.patterns.map((p) => [p.patternId, p.corridorId]));
  return rows.schedule.filter((entry) => {
    // Schedule has no corridor column; the pattern is the only link. An entry
    // whose pattern is unknown, or has no corridor, can't be attributed — so it
    // is shown rather than hidden. Validation reports it, and hiding it here
    // would hide the very problem this view exists to expose.
    const owner = entry.patternId == null ? undefined : corridorOf.get(entry.patternId);
    return owner == null || owner === corridorId;
  });
}

/** The corridor's day types, weekly first then specials. */
export function dayTypesFor(
  rows: Pick<CoordinationRows, "schedule" | "patterns">,
  corridorId: string,
): DayTypeInfo[] {
  const seen = new Map<string, DayTypeInfo>();
  for (const entry of scheduleEntriesForCorridor(rows, corridorId)) {
    const info = describeDayType(entry.dayType);
    if (!seen.has(info.dayType)) seen.set(info.dayType, info);
  }
  return Array.from(seen.values()).sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.label.localeCompare(b.label),
  );
}

/** Names for a note. Long enough to be a checklist; elided only on huge corridors. */
const listIds = (ids: readonly string[], limit = 8) =>
  ids.length <= limit
    ? ids.join(", ")
    : `${ids.slice(0, limit).join(", ")} +${ids.length - limit} more`;

const verb = (ids: readonly string[], plural: string, singular: string) =>
  ids.length === 1 ? singular : plural;

/**
 * One day type, with every corridor signal's state laid against each stretch of
 * the day. This is the data behind the "signals" calendar: because every column
 * is cut from the same segments, a horizontal line across the grid is the same
 * clock time for all of them, and a column that differs from its neighbours in
 * a band is a signal that isn't doing what the rest of the corridor does.
 */
export function alignDaySchedule(
  rows: CoordinationRows,
  corridorId: string,
  dayType: string,
): DayAlignment {
  const day = describeDayType(dayType);
  const patternById = new Map(rows.patterns.map((p) => [p.patternId, p]));
  const psByKey = new Map(rows.patternSignals.map((ps) => [`${ps.patternId}|${ps.signalId}`, ps]));

  const signalIds = Array.from(
    new Set(
      sortBySequence(rows.corridorSignals.filter((cs) => cs.corridorId === corridorId)).map(
        (cs) => cs.signalId,
      ),
    ),
  );

  // Per (pattern, signal): does any ring's total disagree with the cycle?
  const { totals } = ringSplitTotals(rows.phaseSequence, rows.splits);
  const mismatched = new Set<string>();
  for (const [key, total] of Array.from(totals)) {
    const [patternId, signalId] = key.split("|");
    const cycle = patternById.get(patternId)?.cycleLengthS ?? 0;
    if (cycle > 0 && total !== cycle) mismatched.add(`${patternId}|${signalId}`);
  }

  const blocks: ScheduleBlock[] = [];
  const unplaceable: string[] = [];
  for (const entry of scheduleEntriesForCorridor(rows, corridorId)) {
    if (describeDayType(entry.dayType).dayType !== day.dayType) continue;
    const expanded = expandEntry(entry);
    if (expanded.problem) unplaceable.push(entry.scheduleId);
    blocks.push(...expanded.blocks);
  }

  const segments: AlignedSegment[] = effectiveSegments(blocks).map((seg) => {
    const patternId = seg.block?.patternId ?? null;
    const pattern = patternId == null ? undefined : patternById.get(patternId);
    const states = new Map<string, SignalPatternState>();
    const notes: string[] = [];

    if (seg.block === null) {
      notes.push("No pattern is scheduled for this time.");
    } else if (!pattern) {
      notes.push(`Pattern ${patternId ?? "(blank)"} is not in Patterns.txt.`);
    }
    if (seg.block && seg.conflicts.length > 0) {
      const ids = [seg.block, ...seg.conflicts].map((b) => b.scheduleId);
      notes.push(`${ids.join(" and ")} both claim this time at priority ${seg.block.priority}.`);
    }

    const free: string[] = [];
    const missing: string[] = [];
    const offCycle: string[] = [];

    for (const signalId of signalIds) {
      let state: SignalPatternState;
      if (!pattern) {
        state = { kind: "unknown-pattern" };
      } else if (isFreePattern(pattern)) {
        state = { kind: "free-pattern" };
      } else {
        const ps = psByKey.get(`${pattern.patternId}|${signalId}`);
        if (!ps) {
          state = { kind: "missing" };
          missing.push(signalId);
        } else if (ps.coordinatedPhase == null) {
          state = { kind: "free-signal" };
          free.push(signalId);
        } else {
          const cycleMismatch = mismatched.has(`${pattern.patternId}|${signalId}`);
          if (cycleMismatch) offCycle.push(signalId);
          state = {
            kind: "coordinated",
            phase: ps.coordinatedPhase,
            offsetS: ps.offsetS,
            cycleMismatch,
          };
        }
      }
      states.set(signalId, state);
    }

    if (pattern && free.length > 0) {
      notes.push(
        `${listIds(free)} ${verb(free, "run", "runs")} free while ${pattern.patternId} is coordinated.`,
      );
    }
    if (pattern && missing.length > 0) {
      notes.push(
        `${listIds(missing)} ${verb(missing, "have", "has")} no PatternSignals row for ${pattern.patternId}.`,
      );
    }
    if (pattern && offCycle.length > 0) {
      notes.push(
        `${listIds(offCycle)}: ring splits don't add up to ${pattern.patternId}'s ${pattern.cycleLengthS}s cycle.`,
      );
    }

    return { ...seg, pattern, states, notes };
  });

  const reference =
    rows.patterns.find((p) => p.corridorId === corridorId && p.referencePoint)?.referencePoint ??
    null;

  return { day, signalIds, referenceSignalId: reference, segments, unplaceable };
}
