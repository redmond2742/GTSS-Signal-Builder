import {
  generateCorridorSignalsCSV,
  generateCorridorsCSV,
  generatePatternSignalsCSV,
  generatePatternsCSV,
  generatePhaseSequenceCSV,
  generateScheduleCSV,
  generateSplitsCSV,
} from "./csv-export";
import { defineEntity, type Entity } from "./factory";
import {
  parseCorridorSignalsTXT,
  parseCorridorsTXT,
  parsePatternSignalsTXT,
  parsePatternsTXT,
  parsePhaseSequenceTXT,
  parseScheduleTXT,
  parseSplitsTXT,
} from "./parsers";
import { identityOf, type CoordinationKey, type CoordinationRows } from "./rows";
import { inScope } from "./scope";
import { getFromStorage, removeFromStorage, saveToStorage } from "../storage-utils";

/** localStorage keys, kept beside the registry rather than in the shared keys
 *  file so the coordination module stays self-contained. */
export const COORDINATION_STORAGE_KEYS = {
  corridors: "gtss_corridors",
  corridorSignals: "gtss_corridor_signals",
  patterns: "gtss_patterns",
  patternSignals: "gtss_pattern_signals",
  splits: "gtss_splits",
  schedule: "gtss_schedule",
  phaseSequence: "gtss_phase_sequence",
} as const satisfies Record<CoordinationKey, string>;

/** Where Coordination.txt was kept before it was folded into corridors.txt. See legacy.ts. */
export const LEGACY_COORDINATION_STORAGE_KEY = "gtss_coordination";

/**
 * The registry. Declaration order is topological — parents before children —
 * because `resolveCoordinationScope` walks the same chain.
 *
 * Adding a file means adding one entry here plus its columns, parser, generator
 * and row type. Everything else (storage, clear, load, import replace/merge,
 * export, signal fan-out, both UI panels) iterates this array.
 */
export const COORDINATION_ENTITIES: readonly Entity[] = [
  defineEntity({
    key: "corridors",
    storageKey: COORDINATION_STORAGE_KEYS.corridors,
    filename: "corridors.txt",
    label: "Corridors",
    filenameMatch: ["corridors"],
    generate: generateCorridorsCSV,
    parse: parseCorridorsTXT,
    identity: (r) => identityOf(r.corridorId),
    keyFields: ["corridorId"],
    applyScope: (rows, scope) => rows.filter((r) => inScope(scope.corridorIds, r.corridorId)),
  }),

  defineEntity({
    key: "corridorSignals",
    storageKey: COORDINATION_STORAGE_KEYS.corridorSignals,
    filename: "corridorSignals.txt",
    label: "Corridor signals",
    // Must out-rank both "corridors" and the legacy "signal" check.
    filenameMatch: ["corridorsignals", "corridor_signals", "corridor-signals"],
    generate: generateCorridorSignalsCSV,
    parse: parseCorridorSignalsTXT,
    identity: (r) => identityOf(r.corridorId, r.sequence),
    keyFields: ["corridorId", "sequence"],
    applyScope: (rows, scope) => rows.filter((r) => inScope(scope.signalIds, r.signalId)),
    signalRef: { get: (r) => r.signalId, set: (r, signalId) => ({ ...r, signalId }) },
  }),

  defineEntity({
    key: "patterns",
    storageKey: COORDINATION_STORAGE_KEYS.patterns,
    filename: "Patterns.txt",
    label: "Patterns",
    filenameMatch: ["patterns"],
    generate: generatePatternsCSV,
    parse: parsePatternsTXT,
    identity: (r) => identityOf(r.patternId),
    keyFields: ["patternId"],
    applyScope: (rows, scope) => rows.filter((r) => inScope(scope.patternIds, r.patternId)),
  }),

  defineEntity({
    key: "patternSignals",
    storageKey: COORDINATION_STORAGE_KEYS.patternSignals,
    filename: "PatternSignals.txt",
    label: "Pattern signals",
    // Must out-rank both "patterns" and the legacy "signal" check.
    filenameMatch: ["patternsignals", "pattern_signals", "pattern-signals"],
    generate: generatePatternSignalsCSV,
    parse: parsePatternSignalsTXT,
    identity: (r) => identityOf(r.patternId, r.signalId),
    keyFields: ["patternId", "signalId"],
    applyScope: (rows, scope) =>
      rows.filter(
        (r) => inScope(scope.patternIds, r.patternId) && inScope(scope.signalIds, r.signalId),
      ),
    signalRef: { get: (r) => r.signalId, set: (r, signalId) => ({ ...r, signalId }) },
  }),

  defineEntity({
    key: "splits",
    storageKey: COORDINATION_STORAGE_KEYS.splits,
    filename: "Splits.txt",
    label: "Splits",
    filenameMatch: ["splits"],
    generate: generateSplitsCSV,
    parse: parseSplitsTXT,
    identity: (r) => identityOf(r.patternId, r.signalId, r.phaseId),
    keyFields: ["patternId", "signalId", "phaseId"],
    applyScope: (rows, scope) =>
      rows.filter(
        (r) => inScope(scope.patternIds, r.patternId) && inScope(scope.signalIds, r.signalId),
      ),
    signalRef: { get: (r) => r.signalId, set: (r, signalId) => ({ ...r, signalId }) },
  }),

  defineEntity({
    key: "schedule",
    storageKey: COORDINATION_STORAGE_KEYS.schedule,
    filename: "Schedule.txt",
    label: "Schedule",
    filenameMatch: ["schedule"],
    generate: generateScheduleCSV,
    parse: parseScheduleTXT,
    identity: (r) => identityOf(r.scheduleId),
    keyFields: ["scheduleId"],
    // A blank corridor means "its pattern's", which the pattern test already covers.
    applyScope: (rows, scope) =>
      rows.filter(
        (r) =>
          inScope(scope.patternIds, r.patternId) &&
          (r.corridorId == null || inScope(scope.corridorIds, r.corridorId)),
      ),
  }),

  defineEntity({
    key: "phaseSequence",
    storageKey: COORDINATION_STORAGE_KEYS.phaseSequence,
    filename: "PhaseSequence.txt",
    label: "Phase sequence",
    // Must out-rank the legacy "phase" check.
    filenameMatch: ["phasesequence", "phase_sequence", "phase-sequence"],
    generate: generatePhaseSequenceCSV,
    parse: parsePhaseSequenceTXT,
    identity: (r) => identityOf(r.signalId, r.sequenceId, r.ring, r.position),
    keyFields: ["signalId", "sequenceId", "ring", "position"],
    applyScope: (rows, scope) => rows.filter((r) => inScope(scope.signalIds, r.signalId)),
    signalRef: { get: (r) => r.signalId, set: (r, signalId) => ({ ...r, signalId }) },
  }),
];

/** Every coordination row currently in storage. */
export const readAllCoordination = (): CoordinationRows =>
  Object.fromEntries(
    COORDINATION_ENTITIES.map((e) => [e.key, e.read()]),
  ) as unknown as CoordinationRows;

/** Clear every coordination key — called from `clearAllData`. */
export const clearAllCoordination = (): void => {
  COORDINATION_ENTITIES.forEach((e) => e.clear());
  removeFromStorage(LEGACY_COORDINATION_STORAGE_KEY);
};

/** Signal delete fan-out for the four signal-scoped files. */
export const deleteCoordinationBySignal = (signalId: string): void => {
  COORDINATION_ENTITIES.forEach((e) => e.deleteBySignal?.(signalId));
};

export interface SignalRenameReport {
  /** Rows re-pointed across the four signal-scoped files. */
  changed: number;
  /** Rows left on the old id because the new one would have duplicated a row. */
  skipped: number;
  /** `reference_point` values retargeted in Patterns and PatternSignals. */
  referencePoints: number;
}

/**
 * `reference_point` names a signal too (the one a pattern's offsets are measured
 * from), in both Patterns.txt and PatternSignals.txt, but it isn't in the
 * registry's `signalRef` — it isn't part of any row's identity. A rename that
 * missed it would leave every pattern pointing at a signal that no longer exists.
 */
const retargetReferencePoints = (oldId: string, newId: string): number => {
  let count = 0;
  for (const key of [
    COORDINATION_STORAGE_KEYS.patterns,
    COORDINATION_STORAGE_KEYS.patternSignals,
  ]) {
    const rows = getFromStorage<{ referencePoint: string | null }[]>(key, []);
    const next = rows.map((row) => {
      if (row.referencePoint !== oldId) return row;
      count++;
      return { ...row, referencePoint: newId };
    });
    if (next.some((row, i) => row !== rows[i])) saveToStorage(key, next);
  }
  return count;
};

/**
 * Rename a signal throughout the coordination files: every row of the four
 * signal-scoped files, and the reference points that name it.
 *
 * Rows whose move would duplicate an existing row are skipped and reported
 * rather than merged. If any were skipped the old id is still in use, so the
 * reference points are left alone too.
 */
export const renameSignalInCoordination = (oldId: string, newId: string): SignalRenameReport => {
  const target = newId.trim();
  let changed = 0;
  let skipped = 0;
  for (const entity of COORDINATION_ENTITIES) {
    const report = entity.changeSignalInFile?.(oldId, target);
    if (report) {
      changed += report.changed;
      skipped += report.skipped;
    }
  }
  const referencePoints =
    skipped === 0 && target !== "" && target !== oldId ? retargetReferencePoints(oldId, target) : 0;
  return { changed, skipped, referencePoints };
};

/** The signal-rename fan-out called from `signalStorage.update`. */
export const updateCoordinationSignalId = (oldId: string, newId: string): void => {
  renameSignalInCoordination(oldId, newId);
};

/**
 * Identify a coordination file by name.
 *
 * MUST be consulted before the legacy `detectFileType` chain in the import
 * panel: that chain tests `signal` → `approach` → `phase` → … in order, so
 * `corridorSignals.txt` and `PatternSignals.txt` would be claimed by `signals`
 * and `PhaseSequence.txt` by `phases`, each then failing inside the wrong
 * parser with a misleading message.
 *
 * Within the registry, longer matches win, so "corridorsignals" beats
 * "corridors" regardless of declaration order.
 */
export const detectCoordinationFile = (filename: string): Entity | null => {
  const name = filename.toLowerCase().replace(/\.txt$/, "");
  let best: { entity: Entity; length: number } | null = null;
  for (const entity of COORDINATION_ENTITIES) {
    for (const fragment of entity.filenameMatch) {
      if (name.includes(fragment) && (best === null || fragment.length > best.length)) {
        best = { entity, length: fragment.length };
      }
    }
  }
  return best?.entity ?? null;
};
