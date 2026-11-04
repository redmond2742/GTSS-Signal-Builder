import type { Split } from "./rows";

/**
 * Splits.txt's coordinated_phase is the one place the files say which phase a
 * signal is coordinated on: each split row says whether its phase is, as a
 * controller's split table does. 1 means coordinated; 0 or blank means not, so a
 * signal whose split rows mark none runs free in that pattern.
 *
 * Most tables mark one phase. One can mark more (both mainline throughs); then
 * the diagrams follow the one heading the corridor's way.
 */

const pairKey = (patternId: string, signalId: string) => `${patternId}\u001f${signalId}`;

/** The phases a signal's split rows mark coordinated in a pattern, in phase order. */
export function coordinatedSplitPhases(
  splits: readonly Split[],
  patternId: string,
  signalId: string,
): number[] {
  return splits
    .filter(
      (s) =>
        s.patternId === patternId &&
        s.signalId === signalId &&
        s.coordinatedPhase === true &&
        s.phaseId != null,
    )
    .map((s) => s.phaseId as number)
    .sort((a, b) => a - b);
}

/**
 * The phase a signal is coordinated on in a pattern: the one its split rows
 * mark, or where they mark several, `prefer` if it is one of them and else the
 * lowest. Null when they mark none: the signal runs free.
 */
export function coordinatedPhaseOf(
  splits: readonly Split[],
  patternId: string,
  signalId: string,
  prefer: number | null = null,
): number | null {
  const marked = coordinatedSplitPhases(splits, patternId, signalId);
  if (prefer !== null && marked.includes(prefer)) return prefer;
  return marked[0] ?? null;
}

/** A signal's coordinated phase in a pattern, given outside Splits.txt. */
export interface GivenCoordinatedPhase {
  patternId: string;
  signalId: string;
  /** Null: the signal runs free in this pattern. */
  phase: number | null;
}

export interface CarriedCoordinatedPhases {
  splits: Split[];
  /** How many split tables (a signal in a pattern) were marked. */
  marked: number;
  /** How many already said, and kept what they said. */
  kept: number;
  /** Phases with no split row to mark, so the signal runs free until one is. */
  unplaced: GivenCoordinatedPhase[];
}

/**
 * Mark split tables from coordinated phases given elsewhere, as an older
 * PatternSignals.txt gave them. Only a table whose rows are all blank takes one,
 * so a table that already says keeps what it says. The phase given is marked 1
 * and the rest 0; a signal running free gets 0 throughout.
 */
export function carryCoordinatedPhases(
  splits: readonly Split[],
  given: readonly GivenCoordinatedPhase[],
): CarriedCoordinatedPhases {
  const stated = new Set<string>();
  const present = new Set<string>();
  for (const s of splits) {
    present.add(pairKey(s.patternId, s.signalId));
    if (s.coordinatedPhase != null) stated.add(pairKey(s.patternId, s.signalId));
  }

  const phaseOf = new Map<string, number | null>();
  const unplaced: GivenCoordinatedPhase[] = [];
  let kept = 0;
  for (const g of given) {
    const k = pairKey(g.patternId, g.signalId);
    if (phaseOf.has(k)) continue;
    if (stated.has(k)) {
      kept++;
      continue;
    }
    const hasRow =
      g.phase === null
        ? present.has(k)
        : splits.some(
            (s) =>
              s.patternId === g.patternId && s.signalId === g.signalId && s.phaseId === g.phase,
          );
    if (!hasRow) {
      // A free signal with no split table has nothing to say it on, and needs nothing.
      if (g.phase !== null) unplaced.push(g);
      continue;
    }
    phaseOf.set(k, g.phase);
  }

  return {
    splits: splits.map((s) => {
      const k = pairKey(s.patternId, s.signalId);
      if (!phaseOf.has(k)) return s;
      const phase = phaseOf.get(k);
      return { ...s, coordinatedPhase: s.phaseId != null && s.phaseId === phase };
    }),
    marked: phaseOf.size,
    kept,
    unplaced,
  };
}
