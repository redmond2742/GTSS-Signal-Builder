import { getFromStorage, saveToStorage } from "../storage-utils";
import { COORDINATION_STORAGE_KEYS } from "./entities";
import type { CorridorSignal } from "./rows";

/**
 * Reordering a corridor.
 *
 * `sequence` is half of corridorSignals' identity (corridor_id + sequence), so
 * the generic cell editor locks it: patching it in place would collide with a
 * neighbour. Reordering is a different operation — one stop moves and the whole
 * corridor is renumbered 1..N — so it gets its own entry point instead of
 * unlocking the key column.
 */

/** Corridor members in travel order. Ties keep file order: Array#sort is stable. */
export function sortBySequence<T extends { sequence: number | null }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

/** A copy of `list` with the item at `from` moved to index `to`. */
export function moveInList<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Move one stop of a corridor and renumber that corridor 1..N.
 *
 * `from` and `to` are positions in `sortBySequence` order, not sequence values.
 * Addressing by position rather than by identity is what lets this repair a
 * corridor whose sequence numbers collide or skip: identities in such a corridor
 * are ambiguous, positions never are. Moving an item onto itself therefore
 * doubles as "renumber".
 *
 * The corridor's rows are written back in their new order at the place its first
 * row held, so the exported file reads in travel order and other corridors keep
 * their position. Returns null for an out-of-range index.
 */
export function applyCorridorMove(
  rows: readonly CorridorSignal[],
  corridorId: string,
  from: number,
  to: number,
): CorridorSignal[] | null {
  const members = sortBySequence(rows.filter((r) => r.corridorId === corridorId));
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < members.length;
  if (!inRange(from) || !inRange(to)) return null;

  const renumbered = moveInList(members, from, to).map((row, i) => ({ ...row, sequence: i + 1 }));

  const out: CorridorSignal[] = [];
  let placed = false;
  for (const row of rows) {
    if (row.corridorId !== corridorId) {
      out.push(row);
    } else if (!placed) {
      out.push(...renumbered);
      placed = true;
    }
  }
  return out;
}

/**
 * Persist `applyCorridorMove`. Returns false if the indices were out of range
 * and nothing was written; true otherwise, including when the order was already
 * what was asked for.
 */
export function moveCorridorSignal(corridorId: string, from: number, to: number): boolean {
  const key = COORDINATION_STORAGE_KEYS.corridorSignals;
  const rows = getFromStorage<CorridorSignal[]>(key, []);
  const next = applyCorridorMove(rows, corridorId, from, to);
  if (!next) return false;
  if (JSON.stringify(next) !== JSON.stringify(rows)) saveToStorage(key, next);
  return true;
}
