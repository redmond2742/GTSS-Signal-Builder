import { getFromStorage, saveToStorage } from "../storage-utils";
import { COORDINATION_STORAGE_KEYS } from "./entities";
import { sequenceForPattern } from "./phaseSequenceLayout";
import type { Pattern, PatternSignal, PhaseSequenceEntry, Split } from "./rows";

/**
 * Fitting a signal's splits to a cycle length.
 *
 * Scaling every split by the same factor is not enough: the two rings have to
 * reach each barrier together, and a converted timing sheet often has one ring
 * longer than the other within a barrier group. So each barrier group is sized
 * from its busier ring, the groups are scaled to fill the cycle, and then each
 * ring's phases in a group are scaled to fill that group's time.
 *
 * Whole seconds throughout, with largest-remainder rounding, so every ring sums
 * to the cycle exactly — which is the check validation makes.
 */

/** Integers in proportion to `weights`, summing to `total` exactly. */
export function apportion(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (Math.max(0, w) * total) / sum);
  const floors = exact.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  // Hand the remaining seconds to the largest remainders; ties go to the earlier.
  const order = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

export interface FitResult {
  splits: Split[];
  /** Phases with no PhaseSequence row: their ring is unknown, so they are left as they were. */
  unplaced: number[];
}

/**
 * One signal's splits in one pattern, refitted to `cycleS`. `sequence` is that
 * signal's ring-barrier rows for one sequence. Null if nothing can be placed.
 */
export function fitSplitsToCycle(
  splits: readonly Split[],
  sequence: readonly PhaseSequenceEntry[],
  cycleS: number,
): FitResult | null {
  const cycle = Math.round(cycleS);
  if (!(cycle > 0)) return null;

  const placeOf = new Map(
    sequence
      .filter((r) => r.phaseId != null && r.ring != null && r.barrierId != null)
      .map((r) => [r.phaseId as number, r]),
  );
  const placed = splits.filter((s) => s.phaseId != null && placeOf.has(s.phaseId));
  const unplaced = splits
    .filter((s) => s.phaseId == null || !placeOf.has(s.phaseId))
    .map((s) => s.phaseId as number);
  if (placed.length === 0) return null;

  // Barrier groups in running order.
  const firstPosition = new Map<string, number>();
  for (const r of Array.from(placeOf.values())) {
    const b = r.barrierId as string;
    const at = firstPosition.get(b);
    if (at === undefined || (r.position ?? 0) < at) firstPosition.set(b, r.position ?? 0);
  }
  const groups = Array.from(firstPosition.keys()).sort(
    (a, b) => (firstPosition.get(a) ?? 0) - (firstPosition.get(b) ?? 0),
  );

  const inGroup = (g: string, ring: number) =>
    placed
      .filter((s) => {
        const p = placeOf.get(s.phaseId as number)!;
        return p.barrierId === g && p.ring === ring;
      })
      .sort(
        (a, b) =>
          (placeOf.get(a.phaseId as number)!.position ?? 0) -
          (placeOf.get(b.phaseId as number)!.position ?? 0),
      );
  const rings = Array.from(new Set(Array.from(placeOf.values()).map((r) => r.ring as number)));

  // Each group lasts as long as its busiest ring.
  const groupLength = groups.map((g) =>
    Math.max(0, ...rings.map((r) => inGroup(g, r).reduce((n, s) => n + (s.splitS ?? 0), 0))),
  );
  if (groupLength.every((d) => d === 0)) return null;
  const groupTarget = apportion(groupLength, cycle);

  const next = new Map<number, number>();
  groups.forEach((g, gi) => {
    for (const ring of rings) {
      const phases = inGroup(g, ring);
      const weights = phases.map((s) => s.splitS ?? 0);
      // A ring with no time here just waits at the barrier.
      if (weights.reduce((a, b) => a + b, 0) <= 0) continue;
      apportion(weights, groupTarget[gi]).forEach((v, i) =>
        next.set(phases[i].phaseId as number, v),
      );
    }
  });

  return {
    splits: splits.map((s) =>
      s.phaseId != null && next.has(s.phaseId) ? { ...s, splitS: next.get(s.phaseId)! } : { ...s },
    ),
    unplaced,
  };
}

export interface CycleChange {
  /** Signals whose splits were refitted. */
  changed: string[];
  skipped: { signalId: string; reason: string }[];
  /** What to put back to undo it. */
  previousSplits: Split[];
  previousCycle: number | null;
}

/**
 * Refit several signals' splits in a pattern to one cycle, and optionally make it
 * the pattern's cycle too. Uses each signal's sequence for the pattern (from the
 * notes), else its first.
 */
export function setSignalsCycle(
  patternId: string,
  signalIds: readonly string[],
  cycleS: number,
  options: { setPatternCycle?: boolean } = {},
): CycleChange {
  const keys = COORDINATION_STORAGE_KEYS;
  const splits = getFromStorage<Split[]>(keys.splits, []);
  const sequence = getFromStorage<PhaseSequenceEntry[]>(keys.phaseSequence, []);
  const patternSignals = getFromStorage<PatternSignal[]>(keys.patternSignals, []);
  const patterns = getFromStorage<Pattern[]>(keys.patterns, []);

  const changed: string[] = [];
  const skipped: { signalId: string; reason: string }[] = [];
  const previousSplits: Split[] = [];
  const replacement = new Map<string, number>();
  const keyOf = (s: Split) => `${s.signalId}\u001f${s.phaseId}`;

  for (const signalId of signalIds) {
    const own = splits.filter((s) => s.patternId === patternId && s.signalId === signalId);
    if (own.length === 0) {
      skipped.push({ signalId, reason: "has no splits in this pattern" });
      continue;
    }
    const signalRows = sequence.filter((r) => r.signalId === signalId);
    const seqId =
      sequenceForPattern(patternSignals, sequence, patternId, signalId) ??
      signalRows[0]?.sequenceId;
    const fit = fitSplitsToCycle(
      own,
      signalRows.filter((r) => r.sequenceId === seqId),
      cycleS,
    );
    if (!fit) {
      skipped.push({ signalId, reason: "has no ring-barrier sequence to fit against" });
      continue;
    }
    previousSplits.push(...own.map((s) => ({ ...s })));
    fit.splits.forEach((s) => replacement.set(keyOf(s), s.splitS ?? 0));
    changed.push(signalId);
  }

  if (replacement.size > 0) {
    saveToStorage(
      keys.splits,
      splits.map((s) =>
        s.patternId === patternId && replacement.has(keyOf(s))
          ? { ...s, splitS: replacement.get(keyOf(s))! }
          : s,
      ),
    );
  }

  const pattern = patterns.find((p) => p.patternId === patternId);
  const previousCycle = pattern?.cycleLengthS ?? null;
  if (options.setPatternCycle && pattern && pattern.cycleLengthS !== Math.round(cycleS)) {
    saveToStorage(
      keys.patterns,
      patterns.map((p) =>
        p.patternId === patternId ? { ...p, cycleLengthS: Math.round(cycleS) } : p,
      ),
    );
  }
  return { changed, skipped, previousSplits, previousCycle };
}

/** Put back what `setSignalsCycle` changed. */
export function undoCycleChange(patternId: string, change: CycleChange): void {
  const keys = COORDINATION_STORAGE_KEYS;
  const before = new Map(
    change.previousSplits.map((s) => [`${s.signalId}\u001f${s.phaseId}`, s.splitS]),
  );
  const splits = getFromStorage<Split[]>(keys.splits, []);
  saveToStorage(
    keys.splits,
    splits.map((s) => {
      const k = `${s.signalId}\u001f${s.phaseId}`;
      return s.patternId === patternId && before.has(k)
        ? { ...s, splitS: before.get(k) ?? null }
        : s;
    }),
  );
  const patterns = getFromStorage<Pattern[]>(keys.patterns, []);
  const pattern = patterns.find((p) => p.patternId === patternId);
  if (pattern && pattern.cycleLengthS !== change.previousCycle) {
    saveToStorage(
      keys.patterns,
      patterns.map((p) =>
        p.patternId === patternId ? { ...p, cycleLengthS: change.previousCycle } : p,
      ),
    );
  }
}
