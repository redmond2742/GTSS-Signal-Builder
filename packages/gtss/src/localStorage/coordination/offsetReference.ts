import { getFromStorage, saveToStorage } from "../storage-utils";
import { COORDINATION_STORAGE_KEYS } from "./entities";
import type { Pattern, PatternSignal } from "./rows";

/**
 * What an offset is measured to.
 *
 * An offset is the time from the system reference to some point in the
 * coordinated phase's cycle — but which point varies by controller and agency:
 * the moment it turns green, or the moment its yellow starts. The same number
 * means a different picture under each, so the diagram has to know which.
 */
export type OffsetReference = "BegGRN" | "BegYEL";

export const OFFSET_REFERENCES: readonly {
  value: OffsetReference;
  label: string;
  hint: string;
}[] = [
  {
    value: "BegGRN",
    label: "Begin of green",
    hint: "The offset is when the coordinated phase turns green.",
  },
  {
    value: "BegYEL",
    label: "Begin of yellow",
    hint: "The offset is when the coordinated phase's yellow starts, i.e. the end of its green.",
  },
];

/** Normalised forms (see `parseOffsetReference`) and what they mean. */
const ALIASES: Record<string, OffsetReference> = {
  BEGGRN: "BegGRN",
  BOG: "BegGRN",
  BEGYEL: "BegYEL",
  BOY: "BegYEL",
  // The green ends exactly where the yellow begins.
  ENDGRN: "BegYEL",
  EOG: "BegYEL",
};

/**
 * "BegGRN", "Begin of green", "BOG" → "BegGRN"; "Start of yellow", "EndGRN" →
 * "BegYEL". Null for anything else — including a signal id, which is what some
 * exports put in reference_point.
 */
export function parseOffsetReference(text: string | null | undefined): OffsetReference | null {
  const key = (text ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .replace(/BEGINNING|BEGIN|START/g, "BEG")
    .replace(/GREEN/g, "GRN")
    .replace(/YELLOW/g, "YEL")
    .replace(/OF/g, "");
  return ALIASES[key] ?? null;
}

export type OffsetReferenceSource = "pattern signal" | "pattern" | "notes" | "default";

/**
 * The reference a signal's offset uses in a pattern. Its own PatternSignals row
 * wins, then the pattern's, then an "offset ref X" in the notes (converted
 * timing sheets put it there), then begin of green.
 */
export function offsetReferenceFor(
  patternSignal: Pick<PatternSignal, "referencePoint" | "notes"> | undefined,
  pattern: Pick<Pattern, "referencePoint"> | undefined,
): { reference: OffsetReference; source: OffsetReferenceSource } {
  const own = parseOffsetReference(patternSignal?.referencePoint);
  if (own) return { reference: own, source: "pattern signal" };
  const shared = parseOffsetReference(pattern?.referencePoint);
  if (shared) return { reference: shared, source: "pattern" };
  const noted = /offset\s*ref(?:erence)?\s*[:=]?\s*([A-Za-z ]+?)(?:;|$)/i.exec(
    patternSignal?.notes ?? "",
  );
  const fromNotes = parseOffsetReference(noted?.[1]);
  if (fromNotes) return { reference: fromNotes, source: "notes" };
  return { reference: "BegGRN", source: "default" };
}

/**
 * How far the start of the coordinated phase's split sits from its offset.
 *
 * A split is green plus yellow plus all-red. Measured to begin of green, the split
 * starts at the offset. Measured to begin of yellow, the green ends at the offset,
 * so the split starts `split - clearance` before it.
 */
export function splitStartShift(
  reference: OffsetReference,
  splitS: number,
  clearanceS: number,
): number {
  if (reference === "BegGRN") return 0;
  return -Math.max(0, splitS - Math.max(0, clearanceS));
}

// --- Changing a pattern's reference ------------------------------------------

export interface ReferenceChange {
  patternId: string;
  reference: OffsetReference;
  /** What to put back to undo it. */
  previousPatternReference: string | null;
  previous: { signalId: string; referencePoint: string | null; offsetS: number | null }[];
}

/**
 * Say what a pattern's offsets are measured to: the token goes in the pattern's
 * reference_point and in each of its PatternSignals rows'. Offsets are left as
 * they are unless `offsets` gives new ones (signal id → seconds), which is how a
 * caller keeps each green where it was when the reference changes underneath it.
 */
export function setPatternOffsetReference(
  patternId: string,
  reference: OffsetReference,
  offsets?: ReadonlyMap<string, number>,
): ReferenceChange | null {
  const keys = COORDINATION_STORAGE_KEYS;
  const patterns = getFromStorage<Pattern[]>(keys.patterns, []);
  const rows = getFromStorage<PatternSignal[]>(keys.patternSignals, []);
  const pattern = patterns.find((p) => p.patternId === patternId);
  if (!pattern) return null;

  const change: ReferenceChange = {
    patternId,
    reference,
    previousPatternReference: pattern.referencePoint,
    previous: rows
      .filter((r) => r.patternId === patternId)
      .map((r) => ({ signalId: r.signalId, referencePoint: r.referencePoint, offsetS: r.offsetS })),
  };
  saveToStorage(
    keys.patterns,
    patterns.map((p) => (p.patternId === patternId ? { ...p, referencePoint: reference } : p)),
  );
  saveToStorage(
    keys.patternSignals,
    rows.map((r) =>
      r.patternId !== patternId
        ? r
        : {
            ...r,
            referencePoint: reference,
            offsetS: offsets?.has(r.signalId) ? (offsets.get(r.signalId) as number) : r.offsetS,
          },
    ),
  );
  return change;
}

/** Put back what `setPatternOffsetReference` changed. */
export function undoReferenceChange(change: ReferenceChange): void {
  const keys = COORDINATION_STORAGE_KEYS;
  const before = new Map(change.previous.map((p) => [p.signalId, p]));
  const patterns = getFromStorage<Pattern[]>(keys.patterns, []);
  saveToStorage(
    keys.patterns,
    patterns.map((p) =>
      p.patternId === change.patternId
        ? { ...p, referencePoint: change.previousPatternReference }
        : p,
    ),
  );
  const rows = getFromStorage<PatternSignal[]>(keys.patternSignals, []);
  saveToStorage(
    keys.patternSignals,
    rows.map((r) => {
      const was = r.patternId === change.patternId ? before.get(r.signalId) : undefined;
      return was ? { ...r, referencePoint: was.referencePoint, offsetS: was.offsetS } : r;
    }),
  );
}
