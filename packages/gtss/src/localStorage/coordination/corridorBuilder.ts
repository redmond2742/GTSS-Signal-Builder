import type { BasicTiming, Signal } from "../../../schema/public";
import { sortBySequence } from "./corridor-order";
import { COORDINATION_ENTITIES } from "./entities";
import { fitSplitsToCycle } from "./fitSplits";
import { directionBearing, throughPhaseFor, type GtssLinkData } from "./gtssLink";
import { offsetReferenceFor, type OffsetReference } from "./offsetReference";
import { isFreePattern } from "./schedule";
import { scheduleRowsFor, type TimeBlock } from "./scheduleBuilder";
import type {
  CoordinationRows,
  ParsedCoordination,
  Pattern,
  PatternSignal,
  PhaseSequenceEntry,
  Split,
} from "./rows";

/**
 * Building coordination rows from the GTSS intersection data.
 *
 * A corridor needs more than a list of signals before it can be drawn: each
 * signal needs a coordinated phase, a ring-barrier sequence and splits. GTSS
 * already knows each signal's phases, which approach each serves and which way
 * that traffic travels, and its timings — so most of that can be filled in rather
 * than typed. What can't be worked out is left blank and said so, not guessed.
 */

export interface GtssBuildData extends GtssLinkData {
  signals: readonly Signal[];
  basicTimings: readonly BasicTiming[];
}

export interface BuildResult {
  /** Rows to add. Existing rows are never overwritten (see `applyBuild`). */
  rows: ParsedCoordination;
  /** What was filled in from GTSS and what couldn't be, in words. */
  notes: string[];
  /** Why nothing can be built, if that's the case. */
  error: string | null;
}

const failed = (error: string): BuildResult => ({ rows: {}, notes: [], error });

/** Marker in PatternSignals notes, and the sequence-number convention the diagrams read. */
const BUILT_NOTE = "Added in GTSS Builder";
const BUILT_SEQUENCE = "SEQ-01";

/**
 * The standard dual-ring layout for the vehicle phases a signal has: ring 1 runs
 * 1, 2 | 3, 4 and ring 2 runs 5, 6 | 7, 8, with the barrier between. Phases the
 * signal doesn't have are left out; positions count up through each ring.
 */
export function standardPhaseSequence(
  signalId: string,
  phaseNumbers: readonly number[],
  sequenceId = BUILT_SEQUENCE,
): PhaseSequenceEntry[] {
  const present = new Set(phaseNumbers.filter((p) => p >= 1 && p <= 8));
  const layout: [number, [string, number[]][]][] = [
    [
      1,
      [
        ["A", [1, 2]],
        ["B", [3, 4]],
      ],
    ],
    [
      2,
      [
        ["A", [5, 6]],
        ["B", [7, 8]],
      ],
    ],
  ];
  const rows: PhaseSequenceEntry[] = [];
  for (const [ring, groups] of layout) {
    let position = 1;
    for (const [barrierId, phases] of groups) {
      for (const phaseId of phases) {
        if (!present.has(phaseId)) continue;
        rows.push({ signalId, sequenceId, ring, position: position++, phaseId, barrierId });
      }
    }
  }
  return rows;
}

/**
 * A starting split from a phase's timings: its max green plus yellow and all-red,
 * since a split includes the clearance. Null if there is no max green to start from.
 */
export function splitFromTimings(timing: BasicTiming | undefined): number | null {
  if (!timing || timing.maxGreen == null || timing.maxGreen <= 0) return null;
  return Math.round(timing.maxGreen + (timing.yellow ?? 0) + (timing.allRed ?? 0));
}

/**
 * Signals in the order traffic heading `bearing` reaches them, by projecting each
 * onto that heading. Signals without coordinates go last, in the order given.
 */
export function orderAlongBearing<T extends { latitude: number | null; longitude: number | null }>(
  signals: readonly T[],
  bearing: number,
): T[] {
  const rad = (bearing * Math.PI) / 180;
  const along = (s: T) => {
    if (s.latitude == null || s.longitude == null) return Number.POSITIVE_INFINITY;
    // Longitude degrees shrink with latitude; scale them so east and north compare.
    const east = s.longitude * Math.cos((s.latitude * Math.PI) / 180);
    return s.latitude * Math.cos(rad) + east * Math.sin(rad);
  };
  return [...signals]
    .map((s, i) => ({ s, i, key: along(s) }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map((x) => x.s);
}

const vehiclePhasesOf = (signalId: string, gtss: GtssBuildData) =>
  Array.from(
    new Set(
      gtss.phases
        .filter((p) => p.signalId === signalId && p.movementType !== "Pedestrian")
        .map((p) => p.phase)
        .filter((p) => p >= 1 && p <= 8),
    ),
  ).sort((a, b) => a - b);

/** How one signal takes part, where it differs from the rest of the corridor. */
export interface SignalPlan {
  /** The way traffic travels through this signal, where the road bends. Defaults to the corridor's. */
  direction?: string | null;
  /** The phase to coordinate. Left out, it is found from the direction; null leaves it blank (free). */
  coordinatedPhase?: number | null;
  /** The cycle to fit this signal's splits to, if it isn't the pattern's. */
  cycleS?: number | null;
}

interface SignalBuildOptions extends SignalPlan {
  direction: string;
  /** Fit the splits built from timings to the cycle. */
  fitSplits?: boolean;
}

/** What one signal needs to take part in a corridor's patterns. */
function rowsForSignal(
  signalId: string,
  options: SignalBuildOptions,
  patterns: readonly Pattern[],
  gtss: GtssBuildData,
  existing: CoordinationRows,
  notes: string[],
): Pick<CoordinationRows, "patternSignals" | "splits" | "phaseSequence"> {
  const { direction } = options;
  const out: Pick<CoordinationRows, "patternSignals" | "splits" | "phaseSequence"> = {
    patternSignals: [],
    splits: [],
    phaseSequence: [],
  };
  const bearing = directionBearing(direction);
  const phases = vehiclePhasesOf(signalId, gtss);

  // Ring-barrier structure, only if the signal has none yet.
  const hasSequence = existing.phaseSequence.some((r) => r.signalId === signalId);
  if (!hasSequence && phases.length > 0) {
    out.phaseSequence = standardPhaseSequence(signalId, phases);
  } else if (!hasSequence) {
    notes.push(`${signalId}: no phases in GTSS, so no ring-barrier sequence was built.`);
  }
  const ownSequence = out.phaseSequence.length > 0;

  if (patterns.length === 0) return out;

  const chosen = options.coordinatedPhase !== undefined;
  const coordinated = chosen
    ? (options.coordinatedPhase ?? null)
    : bearing === null
      ? null
      : throughPhaseFor(signalId, bearing, gtss);
  if (coordinated === null && !chosen) {
    notes.push(
      `${signalId}: no through phase on an approach heading ${direction}, so its coordinated phase is blank and it runs free until you set one.`,
    );
  }

  for (const pattern of patterns) {
    // A free pattern has no offsets or splits to give anyone; the files carry no
    // PatternSignals rows for it.
    if (isFreePattern(pattern)) continue;
    const siblings = existing.patternSignals.filter((ps) => ps.patternId === pattern.patternId);
    const already = siblings.some((ps) => ps.signalId === signalId);
    if (!already) {
      // "seq 1" names the sequence built above, which is how the diagrams find
      // which sequence a pattern runs. Where the pattern's other signals say
      // their offset reference in their notes (as converted files do), say the
      // same, so this one is read the same way.
      const noteParts = [BUILT_NOTE];
      if (ownSequence) noteParts.push("seq 1");
      const shared = siblings
        .map((ps) => offsetReferenceFor(ps, pattern))
        .find((r) => r.source === "notes");
      if (shared) noteParts.push(`offset ref ${shared.reference}`);
      const row: PatternSignal = {
        patternId: pattern.patternId,
        signalId,
        offsetS: 0,
        coordinatedPhase: coordinated,
        referencePoint: pattern.referencePoint,
        notes: noteParts.join("; "),
      };
      out.patternSignals.push(row);
    }

    const hasSplits = existing.splits.some(
      (s) => s.patternId === pattern.patternId && s.signalId === signalId,
    );
    if (hasSplits) continue;

    const missing: number[] = [];
    let built: Split[] = [];
    for (const phaseId of phases) {
      const timing = gtss.basicTimings.find((t) => t.signalId === signalId && t.phase === phaseId);
      const splitS = splitFromTimings(timing);
      if (splitS === null) {
        missing.push(phaseId);
        continue;
      }
      built.push({ patternId: pattern.patternId, signalId, phaseId, splitS });
    }
    if (missing.length > 0) {
      notes.push(
        `${signalId}: no max green for phase ${missing.join(", ")} in Basic Timings, so ${missing.length === 1 ? "that split was" : "those splits were"} left out of ${pattern.patternId}.`,
      );
    }

    const cycleS = options.cycleS ?? pattern.cycleLengthS ?? 0;
    if (options.fitSplits && built.length > 0 && cycleS > 0) {
      // Fit against the sequence built above, or else the one the signal has.
      const sequence = ownSequence
        ? out.phaseSequence
        : existing.phaseSequence.filter(
            (r) =>
              r.signalId === signalId &&
              r.sequenceId ===
                existing.phaseSequence.find((x) => x.signalId === signalId)?.sequenceId,
          );
      const fit = fitSplitsToCycle(built, sequence, cycleS);
      if (fit) {
        built = fit.splits;
        if (fit.unplaced.length > 0) {
          notes.push(
            `${signalId}: phase ${fit.unplaced.join(", ")} isn't in its ring-barrier sequence, so its split wasn't fitted to the cycle.`,
          );
        }
      } else {
        notes.push(
          `${signalId}: no ring-barrier sequence, so its splits weren't fitted to the cycle.`,
        );
      }
    }
    if (cycleS > 0 && cycleS !== pattern.cycleLengthS) {
      notes.push(
        `${signalId} runs a ${cycleS}s cycle in ${pattern.patternId}, which is ${pattern.cycleLengthS}s. The files can't say that per signal, so validation will point it out.`,
      );
    }
    out.splits.push(...built);
  }
  return out;
}

export interface PatternPlan {
  patternId: string;
  patternNumber: number | null;
  cycleS: number;
  /** What each offset is measured to. Begin of green unless said otherwise. */
  offsetReference?: OffsetReference;
  /** Fit the splits built from timings to each signal's cycle, ring by ring. */
  fitSplits?: boolean;
}

export interface SchedulePlan {
  /** Defaults to `<corridor>-COORD`. */
  coordinationId?: string;
  timezone?: string | null;
  /** When the starter pattern runs. */
  blocks: readonly TimeBlock[];
  /** Run a free pattern the rest of the time, so every day is accounted for. */
  freeRest: boolean;
}

export interface CorridorPlan {
  corridorId: string;
  name?: string | null;
  description?: string | null;
  /** NB, SB, EB, WB… — the way the corridor's coordinated traffic travels. */
  direction: string;
  /** In travel order. */
  signalIds: readonly string[];
  /** Where a signal differs from the corridor: a bend, a chosen phase, its own cycle. */
  perSignal?: Readonly<Record<string, SignalPlan>>;
  /** A starter pattern to create with it, if any. */
  pattern?: PatternPlan | null;
  /** When the starter pattern runs. Needs a pattern. */
  schedule?: SchedulePlan | null;
}

/** Ids a schedule build would use, so a dialog can check them before building. */
export const scheduleIdsFor = (corridorId: string) => ({
  coordinationId: `${corridorId}-COORD`,
  freePatternId: `${corridorId}-FREE`,
  schedulePrefix: corridorId,
});

/** Rows for a new corridor and, optionally, a starter pattern. Nothing is written. */
export function planCorridor(
  plan: CorridorPlan,
  gtss: GtssBuildData,
  existing: CoordinationRows,
): BuildResult {
  const corridorId = plan.corridorId.trim();
  const direction = plan.direction.trim().toUpperCase();
  if (corridorId === "") return failed("Give the corridor an ID.");
  if (existing.corridors.some((c) => c.corridorId === corridorId)) {
    return failed(`There is already a corridor called ${corridorId}.`);
  }
  if (directionBearing(direction) === null) {
    return failed(`"${plan.direction}" isn't a direction. Use NB, SB, EB, WB or similar.`);
  }
  const signalIds = Array.from(new Set(plan.signalIds));
  if (signalIds.length === 0) return failed("Add at least one signal.");
  const unknown = signalIds.filter((id) => !gtss.signals.some((s) => s.signalId === id));
  if (unknown.length > 0) return failed(`Not in the GTSS signals: ${unknown.join(", ")}.`);

  const perSignal = plan.perSignal ?? {};
  for (const signalId of signalIds) {
    const own = perSignal[signalId]?.direction?.trim();
    if (own && directionBearing(own) === null) {
      return failed(`${signalId}: "${own}" isn't a direction. Use NB, SB, EB, WB or similar.`);
    }
    const cycle = perSignal[signalId]?.cycleS;
    if (cycle != null && !(cycle > 0))
      return failed(`${signalId}: a cycle has to be more than 0s.`);
  }

  let pattern: Pattern | null = null;
  if (plan.pattern) {
    const patternId = plan.pattern.patternId.trim();
    if (patternId === "") return failed("Give the starter pattern an ID.");
    if (existing.patterns.some((p) => p.patternId === patternId)) {
      return failed(`There is already a pattern called ${patternId}.`);
    }
    if (!(plan.pattern.cycleS > 0)) return failed("The starter pattern needs a cycle length.");
    pattern = {
      patternId,
      patternNumber: plan.pattern.patternNumber,
      corridorId,
      cycleLengthS: plan.pattern.cycleS,
      referencePoint: plan.pattern.offsetReference ?? "BegGRN",
      description: `Starter pattern created in GTSS Builder`,
    };
  }

  const ids = scheduleIdsFor(corridorId);
  const schedulePlan = plan.schedule ?? null;
  if (schedulePlan) {
    if (!pattern) return failed("A schedule needs a starter pattern to run.");
    const coordinationId = schedulePlan.coordinationId?.trim() || ids.coordinationId;
    if (existing.coordination.some((c) => c.coordinationId === coordinationId)) {
      return failed(`There is already a coordination plan called ${coordinationId}.`);
    }
    if (schedulePlan.freeRest && existing.patterns.some((p) => p.patternId === ids.freePatternId)) {
      return failed(`There is already a pattern called ${ids.freePatternId}.`);
    }
    if (ids.freePatternId === pattern.patternId && schedulePlan.freeRest) {
      return failed(
        `The starter pattern can't be called ${ids.freePatternId}; that's the free pattern's ID.`,
      );
    }
  }

  const notes: string[] = [];
  const rows: Required<Pick<ParsedCoordination, "corridors" | "corridorSignals" | "patterns">> &
    Pick<CoordinationRows, "patternSignals" | "splits" | "phaseSequence"> = {
    corridors: [
      {
        corridorId,
        name: plan.name?.trim() || null,
        description: plan.description?.trim() || null,
        primaryDirection: direction,
      },
    ],
    corridorSignals: signalIds.map((signalId, i) => ({
      corridorId,
      sequence: i + 1,
      signalId,
      direction: perSignal[signalId]?.direction?.trim().toUpperCase() || direction,
    })),
    patterns: pattern ? [pattern] : [],
    patternSignals: [],
    splits: [],
    phaseSequence: [],
  };
  for (const signalId of signalIds) {
    const own = perSignal[signalId] ?? {};
    const built = rowsForSignal(
      signalId,
      {
        ...own,
        direction: own.direction?.trim().toUpperCase() || direction,
        fitSplits: plan.pattern?.fitSplits ?? false,
      },
      pattern ? [pattern] : [],
      gtss,
      existing,
      notes,
    );
    rows.patternSignals.push(...built.patternSignals);
    rows.splits.push(...built.splits);
    rows.phaseSequence.push(...built.phaseSequence);
  }

  if (schedulePlan && pattern) {
    const coordinationId = schedulePlan.coordinationId?.trim() || ids.coordinationId;
    const free: Pattern | null = schedulePlan.freeRest
      ? {
          patternId: ids.freePatternId,
          patternNumber: 254,
          corridorId,
          cycleLengthS: 0,
          referencePoint: null,
          description: "Free: runs whenever the corridor isn't coordinated",
        }
      : null;
    const schedule = scheduleRowsFor({
      idPrefix: ids.schedulePrefix,
      coordinationId,
      patternId: pattern.patternId,
      freePatternId: free?.patternId ?? null,
      blocks: schedulePlan.blocks,
    });
    const taken = schedule.filter((r) =>
      existing.schedule.some((e) => e.scheduleId === r.scheduleId),
    );
    if (taken.length > 0) {
      return failed(`Schedule ${taken.map((r) => r.scheduleId).join(", ")} already exists.`);
    }
    if (!schedule.some((r) => r.patternId === pattern.patternId)) {
      notes.push(`No times were picked, so ${pattern.patternId} isn't scheduled to run.`);
    }
    return {
      rows: {
        ...rows,
        patterns: free ? [...rows.patterns, free] : rows.patterns,
        coordination: [
          {
            coordinationId,
            name: plan.name?.trim() || corridorId,
            referenceClock: null,
            timezone: schedulePlan.timezone?.trim() || null,
            description: "Created in GTSS Builder",
          },
        ],
        schedule,
      },
      notes,
      error: null,
    };
  }
  return { rows, notes, error: null };
}

/** Rows to add one GTSS signal to the end of an existing corridor. Nothing is written. */
export function planAddSignal(
  existing: CoordinationRows,
  corridorId: string,
  signalId: string,
  gtss: GtssBuildData,
): BuildResult {
  const corridor = existing.corridors.find((c) => c.corridorId === corridorId);
  if (!corridor) return failed(`There is no corridor called ${corridorId}.`);
  if (!gtss.signals.some((s) => s.signalId === signalId)) {
    return failed(`${signalId} is not in the GTSS signals.`);
  }
  const members = sortBySequence(
    existing.corridorSignals.filter((c) => c.corridorId === corridorId),
  );
  if (members.some((m) => m.signalId === signalId)) {
    return failed(`${signalId} is already in ${corridorId}.`);
  }
  const direction = corridor.primaryDirection ?? members[members.length - 1]?.direction ?? "";
  const last = Math.max(0, ...members.map((m) => m.sequence ?? 0));

  const notes: string[] = [];
  const patterns = existing.patterns.filter((p) => p.corridorId === corridorId);
  const built = rowsForSignal(signalId, { direction }, patterns, gtss, existing, notes);
  return {
    rows: {
      corridorSignals: [{ corridorId, sequence: last + 1, signalId, direction: direction || null }],
      ...built,
    },
    notes,
    error: null,
  };
}

/**
 * Write a plan. Rows merge in by natural key, so anything already there is kept
 * rather than overwritten — building never destroys data.
 */
export function applyBuild(rows: ParsedCoordination): void {
  for (const entity of COORDINATION_ENTITIES) entity.mergeFrom(rows);
}
