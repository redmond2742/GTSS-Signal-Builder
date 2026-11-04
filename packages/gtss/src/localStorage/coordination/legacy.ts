import { getFromStorage, removeFromStorage, saveToStorage } from "../storage-utils";
import { parseCSVLine } from "../csv-utils";
import { fieldReader, headerPositions, int, text } from "./columns";
import { COORDINATION_STORAGE_KEYS, LEGACY_COORDINATION_STORAGE_KEY } from "./entities";
import type {
  Corridor,
  ParsedCoordination,
  Pattern,
  PatternSignal,
  ScheduleEntry,
  Split,
} from "./rows";
import { carryCoordinatedPhases, type GivenCoordinatedPhase } from "./splitCoordination";

/**
 * Data from before Coordination.txt was folded into corridors.txt.
 *
 * The old file held a plan's reference clock and timezone, and Schedule.txt
 * pointed at the plan rather than at a corridor. Both now live on the corridor.
 * Older exports can still be imported, and data saved in the browser before the
 * change is upgraded once, so neither loses its timezone or its schedule.
 *
 * Likewise PatternSignals.txt's coordinated_phase, which now lives only in
 * Splits.txt: an older file's is carried into the split tables.
 */

/** One row of the old Coordination.txt. */
export interface LegacyCoordinationPlan {
  coordinationId: string;
  referenceClock: string | null;
  timezone: string | null;
}

const LEGACY_COLUMNS = [
  "coordination_id",
  "name",
  "reference_clock",
  "timezone",
  "description",
] as const;

/** "Coordination.txt", by name: the old file, which no entity claims any more. */
export const isLegacyCoordinationFile = (filename: string): boolean =>
  /(^|\/)coordination(\.txt)?$/i.test(filename.trim());

/** The old file's rows. Rows without an id are skipped; this is salvage, not validation. */
export function parseLegacyCoordination(content: string): LegacyCoordinationPlan[] {
  return content
    .trim()
    .split("\n")
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => fieldReader(LEGACY_COLUMNS, parseCSVLine(line)))
    .map((col) => ({
      coordinationId: col("coordination_id"),
      referenceClock: text(col("reference_clock")),
      timezone: text(col("timezone")),
    }))
    .filter((p) => p.coordinationId !== "");
}

const fill = (corridor: Corridor, plan: LegacyCoordinationPlan | undefined): Corridor =>
  !plan
    ? corridor
    : {
        ...corridor,
        referenceClock: corridor.referenceClock ?? plan.referenceClock,
        timezone: corridor.timezone ?? plan.timezone,
      };

/**
 * Carry an old Coordination.txt's clock and timezone onto the corridors being
 * imported with it. Only when there is exactly one plan: with several, nothing
 * in the new layout says which corridor ran which, so it says so instead.
 * Returns what it did, in words, for the import screen.
 */
export function foldLegacyCoordination(
  parsed: ParsedCoordination,
  plans: readonly LegacyCoordinationPlan[],
): string {
  const corridors = parsed.corridors ?? [];
  if (plans.length === 0)
    return "Coordination.txt is no longer used and was empty, so it was skipped.";
  if (plans.length > 1) {
    return `Coordination.txt is no longer used. It has ${plans.length} plans and nothing says which corridor each belongs to, so their clocks and timezones weren't carried over: set them on each corridor.`;
  }
  const missing = corridors.filter((c) => c.referenceClock == null || c.timezone == null);
  parsed.corridors = corridors.map((c) => fill(c, plans[0]));
  return missing.length === 0
    ? "Coordination.txt is no longer used, and the corridors already have a clock and timezone, so it was skipped."
    : `Coordination.txt is no longer used: its reference clock and timezone were copied to ${missing.map((c) => c.corridorId).join(", ")}.`;
}

type StoredSchedule = ScheduleEntry & { coordinationId?: string | null };

/**
 * Upgrade coordination data saved before the change: give each schedule row its
 * corridor (through its pattern), copy each plan's clock and timezone to the
 * corridors it scheduled, and drop the old key. A no-op once done, and while
 * storage is read-only (the writes are refused, so it tries again next time).
 */
export function upgradeStoredCoordination(): boolean {
  const plans = getFromStorage<
    | {
        coordinationId: string;
        referenceClock: string | null;
        timezone: string | null;
      }[]
    | null
  >(LEGACY_COORDINATION_STORAGE_KEY, null);
  if (plans === null) return false;

  const keys = COORDINATION_STORAGE_KEYS;
  const patterns = getFromStorage<Pattern[]>(keys.patterns, []);
  const schedule = getFromStorage<StoredSchedule[]>(keys.schedule, []);
  const corridors = getFromStorage<Corridor[]>(keys.corridors, []);
  const corridorOfPattern = new Map(patterns.map((p) => [p.patternId, p.corridorId]));

  // Which plan scheduled which corridor, from the rows that joined them.
  const planOfCorridor = new Map<string, string | null>();
  const upgraded = schedule.map(({ coordinationId, ...row }) => {
    const corridorId =
      row.corridorId ?? (row.patternId ? (corridorOfPattern.get(row.patternId) ?? null) : null);
    if (corridorId && coordinationId) {
      const seen = planOfCorridor.get(corridorId);
      // A corridor scheduled by two plans has no single answer.
      planOfCorridor.set(
        corridorId,
        seen === undefined || seen === coordinationId ? coordinationId : null,
      );
    }
    return { ...row, corridorId };
  });
  const planById = new Map(plans.map((p) => [p.coordinationId, p]));
  const sole = plans.length === 1 ? plans[0] : undefined;

  saveToStorage(keys.schedule, upgraded);
  saveToStorage(
    keys.corridors,
    corridors.map((c) => {
      const planId = planOfCorridor.get(c.corridorId);
      return fill(c, planId ? planById.get(planId) : planId === undefined ? sole : undefined);
    }),
  );
  removeFromStorage(LEGACY_COORDINATION_STORAGE_KEY);
  return true;
}

// --- PatternSignals.txt's coordinated_phase ---------------------------------

const LEGACY_PATTERN_SIGNAL_COLUMNS = ["pattern_id", "signal_id", "coordinated_phase"] as const;

/**
 * The coordinated phase an older PatternSignals.txt gives each signal, or null
 * if the file has no coordinated_phase column (a current one).
 */
export function parseLegacyCoordinatedPhases(content: string): GivenCoordinatedPhase[] | null {
  const lines = content
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length === 0) return null;
  const positions = headerPositions(LEGACY_PATTERN_SIGNAL_COLUMNS, parseCSVLine(lines[0]));
  if (!positions?.has("coordinated_phase")) return null;
  return lines
    .slice(1)
    .map((line) => fieldReader(LEGACY_PATTERN_SIGNAL_COLUMNS, parseCSVLine(line), positions))
    .map((col) => ({
      patternId: col("pattern_id"),
      signalId: col("signal_id"),
      phase: int(col("coordinated_phase")),
    }))
    .filter((g) => g.patternId !== "" && g.signalId !== "");
}

const tables = (n: number) => `${n} split table${n === 1 ? "" : "s"}`;

/**
 * Carry an older PatternSignals.txt's coordinated phases into the Splits.txt
 * imported with it. Returns what it did, in words, for the import screen.
 */
export function foldLegacyCoordinatedPhases(
  parsed: ParsedCoordination,
  given: readonly GivenCoordinatedPhase[],
): string {
  if (!parsed.splits || parsed.splits.length === 0) {
    return "PatternSignals.txt has a coordinated_phase column, which now goes in Splits.txt. No splits came with it, so it was skipped: mark each signal's coordinated phase on the Splits page.";
  }
  const carried = carryCoordinatedPhases(parsed.splits, given);
  parsed.splits = carried.splits;
  const parts = [
    carried.marked > 0
      ? `PatternSignals.txt's coordinated_phase now goes in Splits.txt, so it was copied there for ${tables(carried.marked)}.`
      : "PatternSignals.txt's coordinated_phase now goes in Splits.txt, and there was nothing to copy.",
  ];
  if (carried.kept > 0) {
    parts.push(`${tables(carried.kept)} already marked one in Splits.txt and kept it.`);
  }
  if (carried.unplaced.length > 0) {
    const list = carried.unplaced
      .map((g) => `${g.signalId} (phase ${g.phase} in ${g.patternId})`)
      .join(", ");
    parts.push(
      `No split row to mark for ${list}, so ${carried.unplaced.length === 1 ? "it runs" : "they run"} free until one is ticked on the Splits page.`,
    );
  }
  return parts.join(" ");
}

type StoredPatternSignal = PatternSignal & { coordinatedPhase?: number | null };

/**
 * Upgrade PatternSignals saved with a coordinated phase: carry it into the
 * split tables and drop it from the rows. A no-op once done, and while storage
 * is read-only (the writes are refused, so it tries again next time).
 */
export function upgradeStoredCoordinatedPhases(): boolean {
  const keys = COORDINATION_STORAGE_KEYS;
  const stored = getFromStorage<StoredPatternSignal[]>(keys.patternSignals, []);
  const given = stored
    .filter((ps) => "coordinatedPhase" in ps)
    .map((ps) => ({
      patternId: ps.patternId,
      signalId: ps.signalId,
      phase: ps.coordinatedPhase ?? null,
    }));
  if (given.length === 0) return false;

  // Splits first: should the second write fail, the first is harmless to repeat.
  const splits = getFromStorage<Split[]>(keys.splits, []);
  saveToStorage(keys.splits, carryCoordinatedPhases(splits, given).splits);
  saveToStorage(
    keys.patternSignals,
    stored.map((ps) => {
      const { coordinatedPhase: _phase, ...row } = ps;
      void _phase;
      return row;
    }),
  );
  return true;
}
