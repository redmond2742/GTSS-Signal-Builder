import { getFromStorage, saveToStorage } from "../storage-utils";
import { COORDINATION_STORAGE_KEYS } from "./entities";
import { directionBearing } from "./gtssLink";
import type { PhaseSequenceEntry } from "./rows";

/**
 * Phases that let a direction's traffic progress through a signal besides the
 * coordinated phase: an overlap that carries the through movement on, or a
 * left turn the route takes there.
 *
 * Kept in PhaseSequence.txt's `progression` column as the directions each phase
 * carries ("SB", or "SB;NB"). It belongs to the signal's phasing, not to a
 * pattern or a sequence, so every sequence's row for the phase says the same.
 */

/** "SB", "sb; nb", "SB/NB" → ["SB", "NB"]. Anything that isn't a direction is dropped. */
export function parseProgression(text: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (text ?? "")
        .split(/[;,/\s]+/)
        .map((t) => t.trim().toUpperCase())
        .filter((t) => t !== "" && directionBearing(t) !== null),
    ),
  );
}

/** Same way of travel, however it's written ("SB", "S", "SOUTH"…). */
export const sameDirection = (a: string, b: string): boolean => {
  const x = directionBearing(a);
  return x !== null && x === directionBearing(b);
};

/** The phases at `signalId` marked as carrying `direction` through, in phase order. */
export function progressionPhases(
  rows: readonly PhaseSequenceEntry[],
  signalId: string,
  direction: string | null | undefined,
): number[] {
  if (!direction) return [];
  return Array.from(
    new Set(
      rows
        .filter(
          (r) =>
            r.signalId === signalId &&
            r.phaseId != null &&
            parseProgression(r.progression).some((d) => sameDirection(d, direction)),
        )
        .map((r) => r.phaseId as number),
    ),
  ).sort((a, b) => a - b);
}

/**
 * Mark or unmark a phase as carrying `direction` through `signalId`, on every
 * sequence's row for it. Returns false if nothing changed (no such phase, or it
 * was already so).
 */
export function setProgression(
  signalId: string,
  phaseId: number,
  direction: string,
  enabled: boolean,
): boolean {
  const key = COORDINATION_STORAGE_KEYS.phaseSequence;
  const token = direction.trim().toUpperCase();
  if (directionBearing(token) === null) return false;
  const rows = getFromStorage<PhaseSequenceEntry[]>(key, []);
  let changed = false;
  const next = rows.map((r) => {
    if (r.signalId !== signalId || r.phaseId !== phaseId) return r;
    const current = parseProgression(r.progression);
    const has = current.some((d) => sameDirection(d, token));
    if (has === enabled) return r;
    changed = true;
    const updated = enabled ? [...current, token] : current.filter((d) => !sameDirection(d, token));
    return { ...r, progression: updated.length ? updated.join(";") : null };
  });
  if (changed) saveToStorage(key, next);
  return changed;
}
