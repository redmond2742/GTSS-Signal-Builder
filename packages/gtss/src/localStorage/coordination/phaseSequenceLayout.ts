import type { PatternSignal, PhaseSequenceEntry } from "./rows";

/**
 * PhaseSequence.txt, arranged for drawing as a ring-barrier diagram.
 *
 * A signal can have several sequences (SIG-022 has SEQ-01 and SEQ-11, the same
 * phases in lead and lag order), and each is its own diagram. Rows have no
 * grouping of their own, so everything here starts from `sequenceId`.
 */

export interface DiagramCell {
  phaseId: number;
  ring: number;
  position: number;
  barrierId: string | null;
}

/** One vertical band of the diagram: everything between two barriers. */
export interface BarrierColumn {
  barrierId: string | null;
  /** Width in phase slots: the most phases any ring has in this band. */
  slots: number;
}

export interface SequenceDiagram {
  signalId: string;
  sequenceId: string;
  columns: BarrierColumn[];
  rings: {
    ring: number;
    /** `groups[i]` is this ring's phases in `columns[i]`, in position order. */
    groups: DiagramCell[][];
  }[];
  /** Things wrong with the structure, in words. Empty means it is well formed. */
  problems: string[];
}

const barrierKey = (barrierId: string | null) => barrierId ?? "";
const barrierLabel = (barrierId: string | null) => barrierId ?? "(none)";
const list = (values: readonly (string | number)[]) => values.join(", ");

/**
 * Build one diagram per sequence for one signal, in file order.
 *
 * Barrier bands are ordered by where they first appear in a ring. A band is a
 * clean cut across every ring, so a ring that leaves a barrier and comes back to
 * it, or two rings that cross the barriers in a different order, is reported
 * rather than drawn as if it made sense.
 */
export function buildSequenceDiagrams(
  rows: readonly PhaseSequenceEntry[],
  signalId: string,
): SequenceDiagram[] {
  const bySequence = new Map<string, PhaseSequenceEntry[]>();
  for (const row of rows) {
    if (row.signalId !== signalId) continue;
    const bucket = bySequence.get(row.sequenceId) ?? [];
    bucket.push(row);
    bySequence.set(row.sequenceId, bucket);
  }

  return Array.from(bySequence).map(([sequenceId, seqRows]) =>
    buildOne(signalId, sequenceId, seqRows),
  );
}

function buildOne(
  signalId: string,
  sequenceId: string,
  seqRows: readonly PhaseSequenceEntry[],
): SequenceDiagram {
  const problems: string[] = [];

  const cells: DiagramCell[] = [];
  let incomplete = 0;
  for (const r of seqRows) {
    if (r.ring == null || r.position == null || r.phaseId == null) {
      incomplete++;
      continue;
    }
    cells.push({ phaseId: r.phaseId, ring: r.ring, position: r.position, barrierId: r.barrierId });
  }
  if (incomplete > 0) {
    problems.push(
      `${incomplete} row${incomplete === 1 ? " is" : "s are"} missing a ring, position or phase and can't be drawn.`,
    );
  }

  // The same phase twice in one sequence.
  const seen = new Set<number>();
  const repeated = new Set<number>();
  for (const c of cells) (seen.has(c.phaseId) ? repeated : seen).add(c.phaseId);
  if (repeated.size > 0) {
    problems.push(
      `Phase ${list(Array.from(repeated).sort((a, b) => a - b))} appears more than once.`,
    );
  }

  const ringNumbers = Array.from(new Set(cells.map((c) => c.ring))).sort((a, b) => a - b);

  // Two phases in the same place.
  for (const ring of ringNumbers) {
    const positions = cells.filter((c) => c.ring === ring).map((c) => c.position);
    const twice = Array.from(new Set(positions.filter((p, i) => positions.indexOf(p) !== i)));
    if (twice.length > 0)
      problems.push(`Ring ${ring} uses position ${list(twice)} more than once.`);
    const sorted = Array.from(new Set(positions)).sort((a, b) => a - b);
    const skipped = sorted.some((p, i) => i > 0 && p !== sorted[i - 1] + 1);
    if (skipped) problems.push(`Ring ${ring} positions skip a number (${list(sorted)}).`);
  }

  // Barrier bands, in the order a ring first reaches them.
  const firstPosition = new Map<string, number>();
  for (const c of cells) {
    const key = barrierKey(c.barrierId);
    const at = firstPosition.get(key);
    if (at === undefined || c.position < at) firstPosition.set(key, c.position);
  }
  const bandOrder = Array.from(firstPosition)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);

  // Each ring should pass through the bands in that order, each in one run.
  for (const ring of ringNumbers) {
    const ordered = cells.filter((c) => c.ring === ring).sort((a, b) => a.position - b.position);
    const runs: string[] = [];
    for (const c of ordered) {
      const key = barrierKey(c.barrierId);
      if (runs[runs.length - 1] !== key) runs.push(key);
    }
    const expected = bandOrder.filter((key) => runs.includes(key));
    if (runs.join("\u001f") !== expected.join("\u001f")) {
      problems.push(
        `Ring ${ring} crosses the barriers as ${runs.map((k) => barrierLabel(k || null)).join(" → ")}, which isn't a clean cut across the rings.`,
      );
    }
  }

  const columns: BarrierColumn[] = bandOrder.map((key) => {
    const perRing = ringNumbers.map(
      (ring) => cells.filter((c) => c.ring === ring && barrierKey(c.barrierId) === key).length,
    );
    return { barrierId: key === "" ? null : key, slots: Math.max(...perRing, 1) };
  });

  const rings = ringNumbers.map((ring) => ({
    ring,
    groups: bandOrder.map((key) =>
      cells
        .filter((c) => c.ring === ring && barrierKey(c.barrierId) === key)
        .sort((a, b) => a.position - b.position),
    ),
  }));

  return { signalId, sequenceId, columns, rings, problems };
}

// --- Which pattern uses which sequence ------------------------------------

/**
 * PatternSignals has no sequence column, but the converter writes one into the
 * free-text notes ("split table 1; seq 4; offset ref BegGRN"). That number is
 * the trailing digits of a PhaseSequence sequence_id (SEQ-04 → 4).
 *
 * Returns the sequence ids that note names, or null when it names none — blank
 * notes, or a file that doesn't follow the convention. This is an inference from
 * text, so callers should say where it came from rather than present it as data.
 */
export function sequenceFromNotes(
  notes: string | null | undefined,
  sequenceIds: readonly string[],
): string | null {
  const match = /\bseq(?:uence)?\s*#?\s*(\d+)\b/i.exec(notes ?? "");
  if (!match) return null;
  const wanted = Number(match[1]);
  const hits = sequenceIds.filter((id) => {
    const digits = /(\d+)$/.exec(id);
    return digits !== null && Number(digits[1]) === wanted;
  });
  return hits.length === 1 ? hits[0] : null;
}

/** For one signal: sequence id → the patterns whose notes name it. */
export function patternsUsingSequences(
  patternSignals: readonly PatternSignal[],
  signalId: string,
  sequenceIds: readonly string[],
): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const ps of patternSignals) {
    if (ps.signalId !== signalId) continue;
    const seq = sequenceFromNotes(ps.notes, sequenceIds);
    if (seq === null) continue;
    const bucket = used.get(seq) ?? [];
    bucket.push(ps.patternId);
    used.set(seq, bucket);
  }
  return used;
}

/**
 * The sequence a pattern runs a signal on, or null if the notes don't say.
 * Callers that need *a* sequence anyway fall back to the first listed — and
 * should say so, because it is a guess.
 */
export function sequenceForPattern(
  patternSignals: readonly PatternSignal[],
  rows: readonly PhaseSequenceEntry[],
  patternId: string,
  signalId: string,
): string | null {
  const ps = patternSignals.find((p) => p.patternId === patternId && p.signalId === signalId);
  if (!ps) return null;
  const ids = Array.from(
    new Set(rows.filter((r) => r.signalId === signalId).map((r) => r.sequenceId)),
  );
  return sequenceFromNotes(ps.notes, ids);
}
