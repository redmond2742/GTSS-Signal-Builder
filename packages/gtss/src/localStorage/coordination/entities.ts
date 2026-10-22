import {
  generateCoordinationCSV,
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
  parseCoordinationTXT,
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

/** localStorage keys, kept beside the registry rather than in the shared keys
 *  file so the coordination module stays self-contained. */
export const COORDINATION_STORAGE_KEYS = {
  corridors: "gtss_corridors",
  corridorSignals: "gtss_corridor_signals",
  coordination: "gtss_coordination",
  patterns: "gtss_patterns",
  patternSignals: "gtss_pattern_signals",
  splits: "gtss_splits",
  schedule: "gtss_schedule",
  phaseSequence: "gtss_phase_sequence",
} as const satisfies Record<CoordinationKey, string>;

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
    key: "coordination",
    storageKey: COORDINATION_STORAGE_KEYS.coordination,
    filename: "Coordination.txt",
    label: "Coordination plans",
    filenameMatch: ["coordination"],
    generate: generateCoordinationCSV,
    parse: parseCoordinationTXT,
    identity: (r) => identityOf(r.coordinationId),
    keyFields: ["coordinationId"],
    applyScope: (rows, scope) =>
      rows.filter((r) => inScope(scope.coordinationIds, r.coordinationId)),
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
    applyScope: (rows, scope) => rows.filter((r) => inScope(scope.patternIds, r.patternId)),
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
};

/** Signal rename / delete fan-out for the four signal-scoped files. */
export const deleteCoordinationBySignal = (signalId: string): void => {
  COORDINATION_ENTITIES.forEach((e) => e.deleteBySignal?.(signalId));
};
export const updateCoordinationSignalId = (oldId: string, newId: string): void => {
  COORDINATION_ENTITIES.forEach((e) => e.updateSignalId?.(oldId, newId));
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
