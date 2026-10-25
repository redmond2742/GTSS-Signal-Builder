import { getFromStorage, removeFromStorage, saveToStorage } from "../storage-utils";
import { parseCSVLine } from "../csv-utils";
import { fieldReader, text } from "./columns";
import { COORDINATION_STORAGE_KEYS, LEGACY_COORDINATION_STORAGE_KEY } from "./entities";
import type { Corridor, ParsedCoordination, Pattern, ScheduleEntry } from "./rows";

/**
 * Data from before Coordination.txt was folded into corridors.txt.
 *
 * The old file held a plan's reference clock and timezone, and Schedule.txt
 * pointed at the plan rather than at a corridor. Both now live on the corridor.
 * Older exports can still be imported, and data saved in the browser before the
 * change is upgraded once, so neither loses its timezone or its schedule.
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
