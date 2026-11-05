import { getFromStorage, saveToStorage } from "../storage-utils";
import { COORDINATION_STORAGE_KEYS } from "./entities";
import {
  buildSequenceDiagrams,
  sequenceFromNotes,
  sequenceNumberInNotes,
} from "./phaseSequenceLayout";
import type { PatternSignal, PhaseSequenceEntry } from "./rows";

/**
 * Building and editing one ring-barrier sequence in PhaseSequence.txt.
 *
 * The file spells a sequence out row by row (ring, position, phase, barrier),
 * which is awkward to edit directly: moving one phase renumbers the rest of its
 * ring. The editor works on a layout instead — barrier groups in running order,
 * and each ring's phases in each — and turns it back into rows on save, with
 * positions counting up through each ring as the converter writes them.
 */

export interface SequenceLayout {
  /** Barrier group ids, in running order. */
  barriers: (string | null)[];
  /** Each ring's phases in each barrier group (same order as `barriers`), in running order. */
  rings: { ring: number; groups: number[][] }[];
}

/** The highest phase number the editor offers, as NTCIP controllers number them. */
export const MAX_PHASE = 16;

/**
 * The standard dual-ring layout: ring 1 runs 1, 2 | 3, 4 and ring 2 runs
 * 5, 6 | 7, 8. Only the phases given are placed; with none, all eight are.
 */
export function standardLayout(phaseNumbers: readonly number[]): SequenceLayout {
  const given = new Set(phaseNumbers.filter((p) => p >= 1 && p <= 8));
  const has = (p: number) => given.size === 0 || given.has(p);
  const pick = (phases: number[]) => phases.filter(has);
  return {
    barriers: ["A", "B"],
    rings: [
      { ring: 1, groups: [pick([1, 2]), pick([3, 4])] },
      { ring: 2, groups: [pick([5, 6]), pick([7, 8])] },
    ],
  };
}

/** One sequence's layout, read from its rows. Rows missing a ring, position or phase are left out. */
export function layoutFromRows(
  rows: readonly PhaseSequenceEntry[],
  signalId: string,
  sequenceId: string,
): SequenceLayout {
  const diagram = buildSequenceDiagrams(
    rows.filter((r) => r.sequenceId === sequenceId),
    signalId,
  )[0];
  if (!diagram) return { barriers: [], rings: [] };
  return {
    barriers: diagram.columns.map((c) => c.barrierId),
    rings: diagram.rings.map((r) => ({
      ring: r.ring,
      groups: r.groups.map((g) => g.map((c) => c.phaseId)),
    })),
  };
}

/**
 * The rows for a layout. Positions count up through each ring, across its
 * barrier groups. A phase keeps the progression it had in `previous` (the
 * sequence's rows before the edit), since that belongs to the phase, not to
 * where it sits.
 */
export function rowsFromLayout(
  signalId: string,
  sequenceId: string,
  layout: SequenceLayout,
  previous: readonly PhaseSequenceEntry[] = [],
): PhaseSequenceEntry[] {
  // Only from rows that had the column, so a row read from a file keeps its blank.
  const progressionOf = new Map(
    previous
      .filter(
        (r) =>
          r.signalId === signalId &&
          r.sequenceId === sequenceId &&
          r.phaseId != null &&
          "progression" in r,
      )
      .map((r) => [r.phaseId as number, r.progression]),
  );
  const rows: PhaseSequenceEntry[] = [];
  for (const { ring, groups } of layout.rings) {
    let position = 1;
    groups.forEach((phases, i) => {
      for (const phaseId of phases) {
        const row: PhaseSequenceEntry = {
          signalId,
          sequenceId,
          ring,
          position: position++,
          phaseId,
          barrierId: layout.barriers[i] ?? null,
        };
        if (progressionOf.has(phaseId)) row.progression = progressionOf.get(phaseId);
        rows.push(row);
      }
    });
  }
  return rows;
}

/** Every phase placed in a layout, in phase order. */
export const placedPhases = (layout: SequenceLayout): number[] =>
  layout.rings.flatMap((r) => r.groups.flat()).sort((a, b) => a - b);

// --- Edits ----------------------------------------------------------------
// Each returns a new layout and leaves the one given alone.

const copy = (layout: SequenceLayout): SequenceLayout => ({
  barriers: [...layout.barriers],
  rings: layout.rings.map((r) => ({ ring: r.ring, groups: r.groups.map((g) => [...g]) })),
});

/** Take a phase out, wherever it is. */
export function removePhase(layout: SequenceLayout, phaseId: number): SequenceLayout {
  const next = copy(layout);
  for (const r of next.rings) r.groups = r.groups.map((g) => g.filter((p) => p !== phaseId));
  return next;
}

/** Put a phase at the end of a ring's barrier group, taking it from wherever it was. */
export function addPhase(
  layout: SequenceLayout,
  ring: number,
  groupIndex: number,
  phaseId: number,
): SequenceLayout {
  const next = removePhase(layout, phaseId);
  const target = next.rings.find((r) => r.ring === ring)?.groups[groupIndex];
  if (!target) return layout;
  target.push(phaseId);
  return next;
}

/**
 * Move a phase one place earlier (-1) or later (+1) in its ring. Within a
 * barrier group it swaps with its neighbour, which is how a lead becomes a lag;
 * at the edge of the group it crosses the barrier into the next one.
 */
export function movePhase(
  layout: SequenceLayout,
  phaseId: number,
  direction: -1 | 1,
): SequenceLayout {
  const next = copy(layout);
  for (const r of next.rings) {
    const gi = r.groups.findIndex((g) => g.includes(phaseId));
    if (gi === -1) continue;
    const group = r.groups[gi];
    const at = group.indexOf(phaseId);
    const to = at + direction;
    if (to >= 0 && to < group.length) {
      [group[at], group[to]] = [group[to], group[at]];
      return next;
    }
    const neighbour = r.groups[gi + direction];
    if (!neighbour) return layout;
    group.splice(at, 1);
    if (direction === 1) neighbour.unshift(phaseId);
    else neighbour.push(phaseId);
    return next;
  }
  return layout;
}

/** The next unused barrier id: A, B, C… */
const nextBarrierId = (used: readonly (string | null)[]): string => {
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(65 + i);
    if (!used.includes(id)) return id;
  }
  return `B${used.length + 1}`;
};

/** Add an empty barrier group after the others. */
export function addBarrierGroup(layout: SequenceLayout): SequenceLayout {
  const next = copy(layout);
  next.barriers.push(nextBarrierId(next.barriers));
  for (const r of next.rings) r.groups.push([]);
  return next;
}

/** Drop a barrier group, only if no ring has a phase in it. */
export function removeBarrierGroup(layout: SequenceLayout, index: number): SequenceLayout {
  if (layout.rings.some((r) => (r.groups[index] ?? []).length > 0)) return layout;
  const next = copy(layout);
  next.barriers.splice(index, 1);
  for (const r of next.rings) r.groups.splice(index, 1);
  return next;
}

/** Add an empty ring, numbered after the others (controllers run up to four). */
export function addRing(layout: SequenceLayout): SequenceLayout {
  const ring = Math.max(0, ...layout.rings.map((r) => r.ring)) + 1;
  if (ring > 4) return layout;
  const next = copy(layout);
  next.rings.push({ ring, groups: next.barriers.map(() => []) });
  return next;
}

/** Drop a ring, only if it has no phases. */
export function removeRing(layout: SequenceLayout, ring: number): SequenceLayout {
  const r = layout.rings.find((x) => x.ring === ring);
  if (!r || r.groups.some((g) => g.length > 0)) return layout;
  const next = copy(layout);
  next.rings = next.rings.filter((x) => x.ring !== ring);
  return next;
}

/** Whether two layouts would write the same rows. */
export const sameLayout = (a: SequenceLayout, b: SequenceLayout): boolean =>
  JSON.stringify(rowsFromLayout("", "", a)) === JSON.stringify(rowsFromLayout("", "", b));

// --- Naming a new sequence ------------------------------------------------

const sequenceIdFor = (n: number) => `SEQ-${String(n).padStart(2, "0")}`;

/**
 * An id for a new sequence at a signal. If the signal has none yet but its
 * PatternSignals notes name one ("seq 4"), that one, so those patterns find it;
 * otherwise one past the highest number the signal uses.
 */
export function suggestSequenceId(
  rows: readonly PhaseSequenceEntry[],
  patternSignals: readonly PatternSignal[],
  signalId: string,
): string {
  const taken = new Set(rows.filter((r) => r.signalId === signalId).map((r) => r.sequenceId));
  const named = patternSignals
    .filter((ps) => ps.signalId === signalId)
    .map((ps) => sequenceNumberInNotes(ps.notes))
    .filter((n): n is number => n !== null);
  if (taken.size === 0 && named.length > 0) {
    // The one most of its patterns name.
    const counts = new Map<number, number>();
    for (const n of named) counts.set(n, (counts.get(n) ?? 0) + 1);
    const [best] = Array.from(counts).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    return sequenceIdFor(best);
  }
  const numbers = Array.from(taken).map((id) => Number(/(\d+)$/.exec(id)?.[1] ?? 0));
  let n = Math.max(0, ...numbers) + 1;
  while (taken.has(sequenceIdFor(n))) n++;
  return sequenceIdFor(n);
}

// --- Saving ---------------------------------------------------------------

/** What a save or delete did, to undo it. */
export interface SequenceChange {
  signalId: string;
  sequenceId: string;
  /** The sequence's rows before; empty if it is new. */
  previous: PhaseSequenceEntry[];
  /** Where its rows sit in the file. */
  index: number;
}

const isSequence = (signalId: string, sequenceId: string) => (r: PhaseSequenceEntry) =>
  r.signalId === signalId && r.sequenceId === sequenceId;

/**
 * Replace one sequence's rows with `rows`, where the old ones were. A new
 * sequence goes after the signal's others, else at the end, so the file stays
 * grouped by signal. Writing no rows deletes the sequence. Returns what to undo.
 */
export function writePhaseSequence(
  signalId: string,
  sequenceId: string,
  rows: readonly PhaseSequenceEntry[],
): SequenceChange {
  const key = COORDINATION_STORAGE_KEYS.phaseSequence;
  const all = getFromStorage<PhaseSequenceEntry[]>(key, []);
  const mine = isSequence(signalId, sequenceId);
  const previous = all.filter(mine);
  let index = all.findIndex(mine);
  const rest = all.filter((r) => !mine(r));
  if (index === -1) {
    let last = -1;
    rest.forEach((r, i) => {
      if (r.signalId === signalId) last = i;
    });
    index = last === -1 ? rest.length : last + 1;
  }
  rest.splice(index, 0, ...rows);
  saveToStorage(key, rest);
  return { signalId, sequenceId, previous, index };
}

/** Delete one sequence. Returns what to undo. */
export const deletePhaseSequence = (signalId: string, sequenceId: string): SequenceChange =>
  writePhaseSequence(signalId, sequenceId, []);

/** Put a sequence back as it was before a save or delete. */
export function undoSequenceChange(change: SequenceChange): void {
  const key = COORDINATION_STORAGE_KEYS.phaseSequence;
  const rest = getFromStorage<PhaseSequenceEntry[]>(key, []).filter(
    (r) => !isSequence(change.signalId, change.sequenceId)(r),
  );
  rest.splice(Math.min(change.index, rest.length), 0, ...change.previous);
  saveToStorage(key, rest);
}

// --- Which patterns run which sequence ------------------------------------
//
// PatternSignals has no sequence column. A pattern names the sequence it runs
// at a signal in its notes ("split table 1; seq 4; offset ref BegGreen"), by
// the number the sequence id ends in; with none named it runs the signal's
// first sequence. Choosing a pattern's sequence means rewriting that "seq N".

/** The sequence one of a signal's patterns runs. */
export interface PatternSequence {
  patternId: string;
  /** Null when the signal has no sequence at all. */
  sequenceId: string | null;
  /** True when the notes name it; false when it is the signal's first, by default. */
  named: boolean;
}

/** A signal's sequence ids, in file order: the first is the one patterns fall back to. */
export const signalSequenceIds = (
  rows: readonly PhaseSequenceEntry[],
  signalId: string,
): string[] =>
  Array.from(new Set(rows.filter((r) => r.signalId === signalId).map((r) => r.sequenceId)));

/** The sequence each of a signal's patterns runs, in PatternSignals order. */
export function patternSequences(
  patternSignals: readonly PatternSignal[],
  rows: readonly PhaseSequenceEntry[],
  signalId: string,
): PatternSequence[] {
  const ids = signalSequenceIds(rows, signalId);
  return patternSignals
    .filter((ps) => ps.signalId === signalId)
    .map((ps) => {
      const named = sequenceFromNotes(ps.notes, ids);
      return {
        patternId: ps.patternId,
        sequenceId: named ?? ids[0] ?? null,
        named: named !== null,
      };
    });
}

/**
 * The number a note would name a sequence by, or null if it can't name it
 * alone: its id doesn't end in a number, or another of the signal's does too.
 */
export function sequenceNumberFor(
  sequenceId: string,
  sequenceIds: readonly string[],
): number | null {
  const digits = /(\d+)$/.exec(sequenceId);
  if (!digits) return null;
  const n = Number(digits[1]);
  return sequenceFromNotes(`seq ${n}`, sequenceIds) === sequenceId ? n : null;
}

/** A note naming sequence `n`: its "seq N" changed, or one added after what is there. */
export function withSequenceInNotes(notes: string | null | undefined, n: number): string {
  const text = (notes ?? "").trim();
  const re = /\bseq(?:uence)?\s*#?\s*(\d+)\b/i;
  if (re.test(text)) {
    return text.replace(re, (match, digits: string) => match.slice(0, -digits.length) + n);
  }
  return text === "" ? `seq ${n}` : `${text}; seq ${n}`;
}

/** What `setPatternSequences` changed, to undo it. */
export interface PatternSequenceChange {
  signalId: string;
  previous: { patternId: string; notes: string | null }[];
}

/**
 * Point patterns at sequences at one signal (pattern id → sequence id) by
 * writing the "seq N" in their PatternSignals notes. `sequenceIds` are the
 * signal's sequences once any being saved alongside are in; a sequence that
 * can't be named alone is skipped. Returns what to undo.
 */
export function setPatternSequences(
  signalId: string,
  assignments: ReadonlyMap<string, string>,
  sequenceIds: readonly string[],
): PatternSequenceChange {
  const key = COORDINATION_STORAGE_KEYS.patternSignals;
  const change: PatternSequenceChange = { signalId, previous: [] };
  const rows = getFromStorage<PatternSignal[]>(key, []).map((ps) => {
    const sequenceId = ps.signalId === signalId ? assignments.get(ps.patternId) : undefined;
    if (sequenceId === undefined) return ps;
    const n = sequenceNumberFor(sequenceId, sequenceIds);
    if (n === null) return ps;
    const notes = withSequenceInNotes(ps.notes, n);
    if (notes === ps.notes) return ps;
    change.previous.push({ patternId: ps.patternId, notes: ps.notes });
    return { ...ps, notes };
  });
  if (change.previous.length > 0) saveToStorage(key, rows);
  return change;
}

/** Put patterns' notes back as they were before `setPatternSequences`. */
export function undoPatternSequenceChange(change: PatternSequenceChange): void {
  if (change.previous.length === 0) return;
  const key = COORDINATION_STORAGE_KEYS.patternSignals;
  const before = new Map(change.previous.map((p) => [p.patternId, p.notes]));
  saveToStorage(
    key,
    getFromStorage<PatternSignal[]>(key, []).map((ps) =>
      ps.signalId === change.signalId && before.has(ps.patternId)
        ? { ...ps, notes: before.get(ps.patternId) ?? null }
        : ps,
    ),
  );
}
