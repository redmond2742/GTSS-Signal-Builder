import type { BasicTiming, Phase } from "../../../schema/public";
import { getFromStorage, saveToStorage } from "../storage-utils";
import { splitFromTimings } from "./corridorBuilder";
import { COORDINATION_STORAGE_KEYS } from "./entities";
import { apportion } from "./fitSplits";
import type { PhaseSequenceEntry, Split } from "./rows";

/**
 * Building one signal's splits for one pattern.
 *
 * A split is the share of the cycle a phase gets: its green plus yellow and
 * all-red. Building them up follows the usual hand method: give every phase
 * the least it can run with, make both rings reach each barrier together, then
 * hand the time left in the cycle to the coordinated phase and the phase that
 * runs beside it, which is where the progression band lives.
 *
 * Values are whole seconds keyed by phase. 0 means the phase doesn't run in the
 * pattern, which is how converted files say it: no Splits row at all.
 */

/** Seconds per phase. */
export type SplitValues = Readonly<Record<number, number>>;

export interface SplitPhase {
  phaseId: number;
  ring: number;
  barrierId: string;
  position: number;
  /**
   * Whether the phase runs at this signal: GTSS has it, or it already has a
   * split. Sequences often list spare phases (9, 11…) the signal never uses.
   */
  active: boolean;
  /** Min green, or walk + ped clearance if longer, plus yellow and all-red. */
  minimumS: number | null;
  minimumBasis: "min green" | "walk + ped clearance" | null;
  /** Max green plus yellow and all-red. */
  maxGreenSplitS: number | null;
  /** Yellow plus all-red: a split minus this is the green. Null without timings. */
  clearanceS: number | null;
}

export interface BarrierGroup {
  barrierId: string;
  /** One entry per ring that has phases here, in ring order. */
  rings: { ring: number; phases: SplitPhase[] }[];
}

export interface SplitPlan {
  signalId: string;
  phases: SplitPhase[];
  /** Barrier groups in running order. */
  groups: BarrierGroup[];
}

/** The least split a phase can run with, and why. Null without timings. */
export function minimumSplit(timing: BasicTiming | undefined): {
  seconds: number | null;
  basis: SplitPhase["minimumBasis"];
} {
  if (!timing) return { seconds: null, basis: null };
  const minGreen = timing.minGreen ?? 0;
  const ped = (timing.pedWalk ?? 0) + (timing.pedClearance ?? 0);
  const green = Math.max(minGreen, ped);
  if (green <= 0) return { seconds: null, basis: null };
  return {
    seconds: Math.ceil(green + (timing.yellow ?? 0) + (timing.allRed ?? 0)),
    basis: ped > minGreen ? "walk + ped clearance" : "min green",
  };
}

/**
 * Everything the builder needs about one signal: its phases in ring-barrier
 * order from one sequence, which of them run, and their minimums from GTSS.
 */
export function splitPlanFor(
  signalId: string,
  sequence: readonly PhaseSequenceEntry[],
  gtss: { phases: readonly Phase[]; basicTimings: readonly BasicTiming[] },
  /** This signal's splits in any pattern: a phase with one is in use. */
  savedSplits: readonly Split[] = [],
): SplitPlan {
  const placed = sequence.filter(
    (r) => r.signalId === signalId && r.phaseId != null && r.ring != null,
  );
  const gtssPhases = new Set(
    gtss.phases
      .filter((p) => p.signalId === signalId && p.movementType !== "Pedestrian")
      .map((p) => p.phase),
  );
  const used = new Set(
    savedSplits.filter((s) => s.signalId === signalId && (s.splitS ?? 0) > 0).map((s) => s.phaseId),
  );
  // With nothing to go on at all, the standard vehicle phases are the guess.
  const noEvidence = gtssPhases.size === 0 && used.size === 0;

  const phases: SplitPhase[] = placed.map((r) => {
    const phaseId = r.phaseId as number;
    const timing = gtss.basicTimings.find((t) => t.signalId === signalId && t.phase === phaseId);
    const min = minimumSplit(timing);
    return {
      phaseId,
      ring: r.ring as number,
      barrierId: r.barrierId ?? "",
      position: r.position ?? 0,
      active: gtssPhases.has(phaseId) || used.has(phaseId) || (noEvidence && phaseId <= 8),
      minimumS: min.seconds,
      minimumBasis: min.basis,
      maxGreenSplitS: splitFromTimings(timing),
      clearanceS: timing ? (timing.yellow ?? 0) + (timing.allRed ?? 0) : null,
    };
  });

  // Barrier groups in the order rings reach them.
  const firstAt = new Map<string, number>();
  for (const p of phases) {
    const at = firstAt.get(p.barrierId);
    if (at === undefined || p.position < at) firstAt.set(p.barrierId, p.position);
  }
  const groups = Array.from(firstAt.keys())
    .sort((a, b) => (firstAt.get(a) ?? 0) - (firstAt.get(b) ?? 0))
    .map((barrierId) => ({
      barrierId,
      rings: Array.from(new Set(phases.map((p) => p.ring)))
        .sort((a, b) => a - b)
        .map((ring) => ({
          ring,
          phases: phases
            .filter((p) => p.barrierId === barrierId && p.ring === ring)
            .sort((a, b) => a.position - b.position),
        }))
        .filter((r) => r.phases.length > 0),
    }));
  return { signalId, phases, groups };
}

const valueOf = (values: SplitValues, phaseId: number) => Math.max(0, values[phaseId] ?? 0);
const ringGroupTotal = (values: SplitValues, phases: readonly SplitPhase[]) =>
  phases.reduce((n, p) => n + valueOf(values, p.phaseId), 0);

/** Each barrier group's length: its busiest ring. */
export const groupLength = (values: SplitValues, group: BarrierGroup) =>
  Math.max(0, ...group.rings.map((r) => ringGroupTotal(values, r.phases)));

export type SplitStart = "minimum" | "maxGreen" | "even";

/**
 * Where building starts. Phases that don't run get 0. A running phase with no
 * timings to go on gets its share of an even split, and is named in `notes`.
 */
export function startingSplits(
  plan: SplitPlan,
  from: SplitStart,
  cycleS: number,
): { values: Record<number, number>; notes: string[] } {
  const even = evenSplits(plan, cycleS);
  if (from === "even") return { values: even, notes: [] };

  const values: Record<number, number> = {};
  const guessed: number[] = [];
  for (const p of plan.phases) {
    if (!p.active) {
      values[p.phaseId] = 0;
      continue;
    }
    const v = from === "minimum" ? p.minimumS : (p.maxGreenSplitS ?? p.minimumS);
    if (v == null) guessed.push(p.phaseId);
    values[p.phaseId] = v ?? even[p.phaseId] ?? 0;
  }
  const notes = guessed.length
    ? [
        `No ${from === "minimum" ? "min green" : "max green"} in Basic Timings for φ${guessed.join(", φ")}, so ${guessed.length === 1 ? "it starts" : "they start"} at an even share of the cycle.`,
      ]
    : [];
  return { values, notes };
}

/** The cycle shared evenly: the same time per barrier group, shared evenly within each ring. */
function evenSplits(plan: SplitPlan, cycleS: number): Record<number, number> {
  const values: Record<number, number> = {};
  for (const p of plan.phases) values[p.phaseId] = 0;
  const live = plan.groups.filter((g) => g.rings.some((r) => r.phases.some((p) => p.active)));
  const shares = apportion(
    live.map(() => 1),
    Math.max(0, Math.round(cycleS)),
  );
  live.forEach((g, gi) => {
    for (const r of g.rings) {
      const active = r.phases.filter((p) => p.active);
      apportion(
        active.map(() => 1),
        shares[gi],
      ).forEach((v, i) => (values[active[i].phaseId] = v));
    }
  });
  return values;
}

/** NEMA's concurrent partner: 1↔5, 2↔6, 3↔7, 4↔8. */
const nemaPartner = (phaseId: number) =>
  phaseId >= 1 && phaseId <= 8 ? (phaseId <= 4 ? phaseId + 4 : phaseId - 4) : null;

/**
 * The phase that takes extra time for one ring within one barrier group: the
 * coordinated phase where it is there, its concurrent partner beside it, and
 * otherwise the longest running phase (the through, usually).
 */
export function receivingPhase(
  phases: readonly SplitPhase[],
  values: SplitValues,
  coordinatedPhase: number | null,
): SplitPhase | null {
  const active = phases.filter((p) => p.active);
  if (active.length === 0) return null;
  const coordinated = active.find((p) => p.phaseId === coordinatedPhase);
  if (coordinated) return coordinated;
  const partner = coordinatedPhase == null ? null : nemaPartner(coordinatedPhase);
  const beside = active.find((p) => p.phaseId === partner);
  if (beside) return beside;
  return active.reduce((best, p) =>
    valueOf(values, p.phaseId) >= valueOf(values, best.phaseId) ? p : best,
  );
}

/**
 * Make the rings reach every barrier together: a ring that is short in a group
 * gives the difference to its receiving phase.
 */
export function balanceBarriers(
  plan: SplitPlan,
  values: SplitValues,
  coordinatedPhase: number | null,
): Record<number, number> {
  const next: Record<number, number> = { ...values };
  for (const group of plan.groups) {
    const length = groupLength(next, group);
    for (const r of group.rings) {
      const short = length - ringGroupTotal(next, r.phases);
      if (short <= 0) continue;
      const to = receivingPhase(r.phases, next, coordinatedPhase);
      if (to) next[to.phaseId] = valueOf(next, to.phaseId) + short;
    }
  }
  return next;
}

/**
 * Fit the splits to the cycle the way it's done by hand. First the rings are
 * lined up at every barrier. Then, if there is time left in the cycle, it goes
 * to the coordinated phase's barrier group — the coordinated phase in its ring,
 * its partner in the other — so the band gets the slack. If the splits run past
 * the cycle, time comes back off those same phases first, then off the longest
 * phases elsewhere, never below a phase's minimum. With no coordinated phase,
 * slack is shared across groups in proportion to their length.
 *
 * `addedS` is the change in cycle time used (negative when trimmed); `overS` is
 * how far past the cycle the splits still run when minimums stop the trimming.
 */
export function buildUpToCycle(
  plan: SplitPlan,
  values: SplitValues,
  cycleS: number,
  coordinatedPhase: number | null,
): { values: Record<number, number>; addedS: number; overS: number } {
  const next = balanceBarriers(plan, values, coordinatedPhase);
  const usedNow = () => plan.groups.reduce((n, g) => n + groupLength(next, g), 0);
  const cycle = Math.round(cycleS);
  const before = usedNow();
  const home = plan.groups.find((g) =>
    g.rings.some((r) => r.phases.some((p) => p.active && p.phaseId === coordinatedPhase)),
  );

  if (cycle > before) {
    const leftover = cycle - before;
    const shares = home
      ? plan.groups.map((g) => (g === home ? leftover : 0))
      : apportion(
          plan.groups.map((g) => groupLength(next, g)),
          leftover,
        );
    plan.groups.forEach((g, gi) => {
      if (shares[gi] <= 0) return;
      for (const r of g.rings) {
        const to = receivingPhase(r.phases, next, coordinatedPhase);
        if (to) next[to.phaseId] = valueOf(next, to.phaseId) + shares[gi];
      }
    });
  } else if (cycle < before) {
    // Trim group by group, the coordinated one first, each ring by the same
    // amount so the barriers stay lined up.
    let excess = before - cycle;
    const order = [
      ...(home ? [home] : []),
      ...plan.groups
        .filter((g) => g !== home)
        .sort((a, b) => groupLength(next, b) - groupLength(next, a)),
    ];
    for (const g of order) {
      if (excess <= 0) break;
      const takers = g.rings
        .map((r) => receivingPhase(r.phases, next, coordinatedPhase))
        .filter((p): p is SplitPhase => p !== null);
      if (takers.length === 0) continue;
      const room = Math.min(
        ...takers.map((p) => valueOf(next, p.phaseId) - Math.max(1, p.minimumS ?? 1)),
      );
      const take = Math.min(excess, Math.max(0, room));
      if (take <= 0) continue;
      for (const p of takers) next[p.phaseId] = valueOf(next, p.phaseId) - take;
      excess -= take;
    }
  }
  const after = usedNow();
  return { values: next, addedS: after - before, overS: Math.max(0, after - cycle) };
}

/**
 * Scale everything to the cycle, keeping proportions, ring by ring within each
 * barrier group so the rings still meet at the barriers.
 */
export function scaleToCycle(
  plan: SplitPlan,
  values: SplitValues,
  cycleS: number,
): Record<number, number> {
  const next: Record<number, number> = { ...values };
  const lengths = plan.groups.map((g) => groupLength(values, g));
  if (lengths.every((l) => l === 0)) return next;
  const targets = apportion(lengths, Math.max(0, Math.round(cycleS)));
  plan.groups.forEach((g, gi) => {
    for (const r of g.rings) {
      const weights = r.phases.map((p) => valueOf(values, p.phaseId));
      if (weights.every((w) => w === 0)) continue;
      apportion(weights, targets[gi]).forEach((v, i) => (next[r.phases[i].phaseId] = v));
    }
  });
  return next;
}

export interface SplitCheck {
  ringTotals: { ring: number; totalS: number }[];
  /** Groups whose rings don't reach the barrier together. */
  unbalanced: { barrierId: string; totals: { ring: number; totalS: number }[] }[];
  /** Running phases given less than their minimum (0 is "not used", not too short). */
  belowMinimum: { phaseId: number; valueS: number; minimumS: number }[];
  /** Cycle time the splits take: the sum of each barrier group's busiest ring. */
  usedS: number;
  /** True when every ring adds up to the cycle and every barrier lines up. */
  ok: boolean;
}

/** What is wrong with a set of splits, if anything. */
export function checkSplits(plan: SplitPlan, values: SplitValues, cycleS: number): SplitCheck {
  const rings = Array.from(new Set(plan.phases.map((p) => p.ring))).sort((a, b) => a - b);
  const ringTotals = rings.map((ring) => ({
    ring,
    totalS: ringGroupTotal(
      values,
      plan.phases.filter((p) => p.ring === ring),
    ),
  }));
  const unbalanced = plan.groups
    .map((g) => ({
      barrierId: g.barrierId,
      totals: g.rings.map((r) => ({ ring: r.ring, totalS: ringGroupTotal(values, r.phases) })),
    }))
    .filter((g) => new Set(g.totals.map((t) => t.totalS)).size > 1);
  const belowMinimum = plan.phases
    .filter(
      (p) =>
        p.active &&
        p.minimumS != null &&
        valueOf(values, p.phaseId) > 0 &&
        valueOf(values, p.phaseId) < p.minimumS,
    )
    .map((p) => ({
      phaseId: p.phaseId,
      valueS: valueOf(values, p.phaseId),
      minimumS: p.minimumS as number,
    }));
  const usedS = plan.groups.reduce((n, g) => n + groupLength(values, g), 0);
  const cycle = Math.round(cycleS);
  return {
    ringTotals,
    unbalanced,
    belowMinimum,
    usedS,
    ok: cycle > 0 && unbalanced.length === 0 && ringTotals.every((r) => r.totalS === cycle),
  };
}

/** A signal's saved splits in a pattern, as values. */
export const savedSplitValues = (
  splits: readonly Split[],
  patternId: string,
  signalId: string,
): Record<number, number> => {
  const values: Record<number, number> = {};
  for (const s of splits) {
    if (s.patternId === patternId && s.signalId === signalId && s.phaseId != null) {
      values[s.phaseId] = s.splitS ?? 0;
    }
  }
  return values;
};

// --- Writing ----------------------------------------------------------------

export interface SplitsChange {
  patternId: string;
  signalIds: string[];
  /** Rows added (by phase), changed (with the old value) and removed (with where they were). */
  created: { signalId: string; phaseId: number }[];
  updated: { signalId: string; phaseId: number; previousS: number | null }[];
  removed: { index: number; row: Split }[];
}

/**
 * Write signals' splits for one pattern. A phase with seconds gets a row, made
 * or updated in place; a phase set to 0 loses its row, which is how the files
 * say "not used". Phases not mentioned are left alone. Returns what to undo.
 */
export function writeSplits(
  patternId: string,
  bySignal: ReadonlyMap<string, SplitValues>,
): SplitsChange {
  const key = COORDINATION_STORAGE_KEYS.splits;
  const before = getFromStorage<Split[]>(key, []);
  const change: SplitsChange = {
    patternId,
    signalIds: Array.from(bySignal.keys()),
    created: [],
    updated: [],
    removed: [],
  };

  const rows: Split[] = [];
  const seen = new Set<string>();
  const id = (signalId: string, phaseId: number | null) => `${signalId}\u001f${phaseId}`;
  before.forEach((row, index) => {
    const values = row.patternId === patternId ? bySignal.get(row.signalId) : undefined;
    if (!values || row.phaseId == null || !(row.phaseId in values)) {
      rows.push(row);
      return;
    }
    seen.add(id(row.signalId, row.phaseId));
    const next = Math.max(0, Math.round(values[row.phaseId]));
    if (next === 0) {
      change.removed.push({ index, row });
      return;
    }
    if (next !== row.splitS) {
      change.updated.push({ signalId: row.signalId, phaseId: row.phaseId, previousS: row.splitS });
    }
    rows.push(next === row.splitS ? row : { ...row, splitS: next });
  });

  // New rows go after the signal's others in the pattern, else after the
  // pattern's, else at the end — so the file stays grouped.
  for (const [signalId, values] of Array.from(bySignal)) {
    const fresh = Object.keys(values)
      .map(Number)
      .filter((phaseId) => !seen.has(id(signalId, phaseId)) && Math.round(values[phaseId]) > 0)
      .sort((a, b) => a - b);
    if (fresh.length === 0) continue;
    const lastOf = (match: (r: Split) => boolean) => {
      for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) return i;
      return -1;
    };
    let at = lastOf((r) => r.patternId === patternId && r.signalId === signalId);
    if (at === -1) at = lastOf((r) => r.patternId === patternId);
    const insert = fresh.map((phaseId) => ({
      patternId,
      signalId,
      phaseId,
      splitS: Math.round(values[phaseId]),
    }));
    rows.splice(at === -1 ? rows.length : at + 1, 0, ...insert);
    change.created.push(...fresh.map((phaseId) => ({ signalId, phaseId })));
  }

  saveToStorage(key, rows);
  return change;
}

/** Put back what `writeSplits` changed. */
export function undoSplitsChange(change: SplitsChange): void {
  const key = COORDINATION_STORAGE_KEYS.splits;
  const created = new Set(change.created.map((c) => `${c.signalId}\u001f${c.phaseId}`));
  const updated = new Map(
    change.updated.map((u) => [`${u.signalId}\u001f${u.phaseId}`, u.previousS]),
  );
  const mine = (r: Split) => r.patternId === change.patternId;
  const rows = getFromStorage<Split[]>(key, [])
    .filter((r) => !(mine(r) && created.has(`${r.signalId}\u001f${r.phaseId}`)))
    .map((r) => {
      const k = `${r.signalId}\u001f${r.phaseId}`;
      return mine(r) && updated.has(k) ? { ...r, splitS: updated.get(k) ?? null } : r;
    });
  for (const { index, row } of [...change.removed].sort((a, b) => a.index - b.index)) {
    rows.splice(Math.min(index, rows.length), 0, row);
  }
  saveToStorage(key, rows);
}
