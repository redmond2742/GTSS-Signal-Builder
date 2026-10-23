// Row types for the 8 coordination entities, plus the key→row map that the
// registry is generic over.
//
// Deliberately different from the six original entities in one respect: these
// rows carry NO surrogate `id`. Parsers there mint a `nanoid()` per row, which
// makes merge-dedupe a pure append (the id is always new, so nothing ever
// matches) and invalidates any id the UI is holding the moment a file is
// re-imported. Here the natural key IS the identity — see `identity` on each
// descriptor in entities.ts — so React lists key on that, not on a surrogate.

export interface Corridor {
  corridorId: string;
  name: string | null;
  description: string | null;
  primaryDirection: string | null;
}

export interface CorridorSignal {
  corridorId: string;
  sequence: number | null;
  signalId: string;
  direction: string | null;
}

export interface CoordinationPlan {
  coordinationId: string;
  name: string | null;
  referenceClock: string | null;
  timezone: string | null;
  description: string | null;
}

export interface Pattern {
  patternId: string;
  patternNumber: number | null;
  corridorId: string | null;
  /** 0 means the corridor runs free in this pattern. */
  cycleLengthS: number | null;
  referencePoint: string | null;
  description: string | null;
}

export interface PatternSignal {
  patternId: string;
  signalId: string;
  offsetS: number | null;
  /** Blank means this signal runs free in this pattern. */
  coordinatedPhase: number | null;
  referencePoint: string | null;
  notes: string | null;
}

export interface Split {
  patternId: string;
  signalId: string;
  phaseId: number | null;
  splitS: number | null;
}

export interface ScheduleEntry {
  scheduleId: string;
  coordinationId: string | null;
  /** WEEKDAY / SATURDAY / SUNDAY, or a SPECIAL_* range whose higher priority wins. */
  dayType: string | null;
  startTime: string | null;
  endTime: string | null;
  patternId: string | null;
  priority: number | null;
}

export interface PhaseSequenceEntry {
  signalId: string;
  sequenceId: string;
  ring: number | null;
  position: number | null;
  phaseId: number | null;
  barrierId: string | null;
}

/**
 * The key→row mapping the whole registry is generic over.
 *
 * Keying descriptors on `keyof` this map (rather than on the row type) is what
 * keeps an array of heterogeneous descriptors type-safe: a `generate` that
 * takes `Split[]` cannot be paired with `key: "corridors"`.
 */
export type CoordinationRows = {
  corridors: Corridor[];
  corridorSignals: CorridorSignal[];
  coordination: CoordinationPlan[];
  patterns: Pattern[];
  patternSignals: PatternSignal[];
  splits: Split[];
  schedule: ScheduleEntry[];
  phaseSequence: PhaseSequenceEntry[];
};

export type CoordinationKey = keyof CoordinationRows;
export type CoordinationRow<K extends CoordinationKey> = CoordinationRows[K][number];

/** What an import produces: any subset of the 8 files. */
export type ParsedCoordination = Partial<CoordinationRows>;

/** Per-file export toggles. Adding a registry key makes exhaustive consumers fail to compile. */
export type CoordinationFlags = { [K in CoordinationKey]: boolean };

export const emptyCoordinationRows = (): CoordinationRows => ({
  corridors: [],
  corridorSignals: [],
  coordination: [],
  patterns: [],
  patternSignals: [],
  splits: [],
  schedule: [],
  phaseSequence: [],
});

// --- Natural-key identity -------------------------------------------------

/**
 * ASCII unit separator. Deliberately not "-": the existing approach dedupe key
 * (`imports.ts`) joins with a hyphen while auto-generated approach ids already
 * contain hyphens, so `signalId "A-1" + approachId "2"` collides with
 * `signalId "A" + approachId "1-2"`. With 3- and 4-part coordination keys that
 * class of collision gets much more likely, and 0x1F cannot appear in a parsed
 * CSV field.
 */
const UNIT_SEPARATOR = "\u001f";

/**
 * Build a composite identity. Values are normalised so that a number, the same
 * number as a string, null and undefined don't produce four different keys.
 * Case is preserved — GTSS ids are case-sensitive.
 */
export const identityOf = (...parts: readonly unknown[]): string =>
  parts.map((p) => (p == null ? "" : String(p).trim())).join(UNIT_SEPARATOR);
