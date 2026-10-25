import type { CoordinationRows } from "./rows";

/**
 * Which rows survive when the user exports a subset of agencies.
 *
 * `null` on a set means "no filtering" — export everything.
 *
 * This is not as simple as testing each row for a signal_id, because only four
 * of the seven files carry one. Note in particular that `corridors.txt` has NO
 * agency_id column in the real converter output, so a corridor's agency is only
 * knowable through its signals. The reachability chain is:
 *
 *   signal ──< corridorSignals ──> corridor ──< pattern ──< patternSignals
 *                                                      ├──< splits
 *                                                      └──< schedule
 *   signal ──< phaseSequence
 *
 * Skipping this and exporting coordination unfiltered is a visible bug for any
 * multi-agency user: the agency checkbox grid defaults to all-selected, so
 * deselecting one would still ship its corridors.
 */
export interface CoordinationScope {
  signalIds: Set<string> | null;
  corridorIds: Set<string> | null;
  patternIds: Set<string> | null;
}

/** No filtering — every row is in scope. */
export const UNSCOPED: CoordinationScope = {
  signalIds: null,
  corridorIds: null,
  patternIds: null,
};

/** `null`/absent set means unfiltered, so everything passes. */
export const inScope = (set: Set<string> | null, value: string | null | undefined): boolean =>
  set === null || (value != null && set.has(value));

/**
 * Walk the chain above once, in dependency order, to decide what each file
 * keeps. `signalIds === null` short-circuits to UNSCOPED.
 */
export function resolveCoordinationScope(
  signalIds: readonly string[] | null,
  rows: CoordinationRows,
): CoordinationScope {
  if (signalIds === null) return UNSCOPED;

  const keptSignals = new Set(signalIds);

  // A corridor is in scope when at least one of its signals is.
  const corridorIds = new Set(
    rows.corridorSignals.filter((cs) => keptSignals.has(cs.signalId)).map((cs) => cs.corridorId),
  );

  // A pattern follows its corridor. A pattern with no corridor_id cannot be
  // attributed to an agency, so it is kept rather than silently dropped.
  const patternIds = new Set(
    rows.patterns
      .filter((p) => p.corridorId == null || corridorIds.has(p.corridorId))
      .map((p) => p.patternId),
  );

  return { signalIds: keptSignals, corridorIds, patternIds };
}
