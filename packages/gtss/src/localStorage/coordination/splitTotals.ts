import type { PhaseSequenceEntry, Split } from "./rows";

/**
 * A signal's green splits, summed per ring and per pattern.
 *
 * Ring membership comes from PhaseSequence, which is per signal rather than per
 * pattern — a signal's ring structure doesn't change between patterns. A split
 * whose phase has no PhaseSequence row can't be placed in a ring; those are
 * reported separately rather than silently dropped.
 *
 * Shared by validation (which compares each total to the cycle) and the
 * schedule alignment view (which flags the signals that don't match).
 */
export function ringSplitTotals(
  phaseSequence: readonly PhaseSequenceEntry[],
  splits: readonly Split[],
): {
  /** `${patternId}|${signalId}|${ring}` → seconds. */
  totals: Map<string, number>;
  /** `${signalId}|${phaseId}` for each split with no PhaseSequence row. */
  unringed: Set<string>;
} {
  const ringOf = new Map<string, number>();
  for (const seq of phaseSequence) {
    if (seq.phaseId == null || seq.ring == null) continue;
    ringOf.set(`${seq.signalId}|${seq.phaseId}`, seq.ring);
  }

  const totals = new Map<string, number>();
  const unringed = new Set<string>();
  for (const split of splits) {
    if (split.phaseId == null || split.splitS == null) continue;
    const ring = ringOf.get(`${split.signalId}|${split.phaseId}`);
    if (ring === undefined) {
      unringed.add(`${split.signalId}|${split.phaseId}`);
      continue;
    }
    const key = `${split.patternId}|${split.signalId}|${ring}`;
    totals.set(key, (totals.get(key) ?? 0) + split.splitS);
  }
  return { totals, unringed };
}
