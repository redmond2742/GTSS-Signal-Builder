import { sequenceForPattern } from "./phaseSequenceLayout";
import type { PatternSignal, PhaseSequenceEntry, Split } from "./rows";

/**
 * The green the opposite direction gets at a signal.
 *
 * PatternSignals records ONE coordinated phase and ONE offset per signal: the
 * through movement of the direction being coordinated. Traffic the other way
 * runs on the opposing through phase, which has its own split and, depending on
 * the sequence, its own start. Drawing the opposite direction with the
 * coordinated phase's window would be wrong wherever those differ — and in real
 * exports they often do (SIG-022 in the sample: phase 4 gets 35s, phase 8 gets 50s).
 *
 * The ring-barrier structure pins it down. Both rings cross a barrier at the same
 * instant, so within a barrier group each phase starts after whatever runs before
 * it in its own ring. The opposing phase therefore starts at the coordinated
 * phase's start, shifted by the difference in time spent on earlier phases.
 */

export interface OpposingWindow {
  /** Seconds after the system reference when the opposing green starts. */
  offsetS: number;
  greenS: number;
  /**
   * "ring-barrier": worked out from the sequence and the splits.
   * "assumed": the data couldn't support that, so this is the coordinated
   * phase's own window, standing in.
   */
  basis: "ring-barrier" | "assumed";
  /** The opposing phase used, when it was worked out. */
  partnerPhase: number | null;
}

/**
 * The phase opposing `phase` in a standard dual-ring numbering: 2↔6, 4↔8 for
 * the through movements, 1↔5 and 3↔7 for the lefts. Null for anything outside
 * 1–8, which has no such pairing.
 */
export function opposingPhaseNumber(phase: number): number | null {
  if (!Number.isInteger(phase) || phase < 1 || phase > 8) return null;
  return phase <= 4 ? phase + 4 : phase - 4;
}

export interface OpposingInput {
  patternId: string;
  signalId: string;
  coordinatedPhase: number | null;
  /** The coordinated phase's offset and green, as drawn. */
  offsetS: number;
  greenS: number;
  patternSignals: readonly PatternSignal[];
  phaseSequence: readonly PhaseSequenceEntry[];
  /** Splits for this pattern; others are ignored. */
  splits: readonly Split[];
}

/** Where and how long a phase is green, placed relative to the coordinated phase. */
export interface PhaseWindow {
  phase: number;
  offsetS: number;
  greenS: number;
}

/**
 * The green window of `targetPhase`, worked out from the coordinated phase's.
 *
 * Both rings cross a barrier at the same instant, so within a barrier group every
 * phase starts after whatever runs before it in its own ring. A phase in the same
 * group as the coordinated phase therefore starts at the coordinated phase's
 * start, shifted by the difference in time spent on earlier phases.
 *
 * Null when the data can't support it: no PhaseSequence for the signal, either
 * phase missing from the sequence, a different barrier group, or no split.
 */
export function phaseWindow(
  input: OpposingInput,
  targetPhase: number,
  options: {
    otherRing?: boolean;
    /**
     * Also place a phase in another barrier group, by walking the groups in
     * running order: each lasts as long as its busiest ring.
     */
    acrossBarriers?: boolean;
  } = {},
): PhaseWindow | null {
  const { patternId, signalId, coordinatedPhase, offsetS } = input;
  if (coordinatedPhase === null || targetPhase === coordinatedPhase) return null;

  // A signal can have several sequences. Use the one this pattern runs, as named
  // in PatternSignals' notes, and fall back to the first listed.
  const signalRows = input.phaseSequence.filter((r) => r.signalId === signalId);
  if (signalRows.length === 0) return null;
  const sequenceId =
    sequenceForPattern(input.patternSignals, input.phaseSequence, patternId, signalId) ??
    signalRows[0].sequenceId;
  const rows = signalRows.filter((r) => r.sequenceId === sequenceId);

  const place = (phase: number) => rows.find((r) => r.phaseId === phase);
  const here = place(coordinatedPhase);
  const there = place(targetPhase);
  if (!here || !there) return null;
  if (here.ring == null || here.position == null || here.barrierId == null) return null;
  if (there.ring == null || there.position == null || there.barrierId == null) return null;
  if (here.barrierId !== there.barrierId && !options.acrossBarriers) return null;
  if (options.otherRing && here.ring === there.ring) return null;

  const splitOf = (phase: number) =>
    input.splits.find(
      (s) => s.patternId === patternId && s.signalId === signalId && s.phaseId === phase,
    )?.splitS ?? null;
  const targetGreen = splitOf(targetPhase);
  if (targetGreen === null || targetGreen <= 0) return null;

  // Time spent in the barrier group before this phase starts, in its own ring.
  // Phases with no split take no time and add nothing.
  const before = (target: PhaseSequenceEntry) =>
    rows
      .filter(
        (r) =>
          r.ring === target.ring &&
          r.barrierId === target.barrierId &&
          r.position != null &&
          r.position < (target.position as number) &&
          r.phaseId != null,
      )
      .reduce((sum, r) => sum + (splitOf(r.phaseId as number) ?? 0), 0);

  // Where each barrier group starts within the cycle, from the first. Both rings
  // cross a barrier together, so a group lasts as long as its busiest ring.
  const groupStart = new Map<string, number>();
  if (here.barrierId !== there.barrierId) {
    const firstAt = new Map<string, number>();
    for (const r of rows) {
      if (r.barrierId == null || r.position == null) continue;
      const at = firstAt.get(r.barrierId);
      if (at === undefined || r.position < at) firstAt.set(r.barrierId, r.position);
    }
    const order = Array.from(firstAt.keys()).sort(
      (a, b) => (firstAt.get(a) ?? 0) - (firstAt.get(b) ?? 0),
    );
    let at = 0;
    for (const barrierId of order) {
      groupStart.set(barrierId, at);
      const rings = Array.from(new Set(rows.map((r) => r.ring)));
      at += Math.max(
        0,
        ...rings.map((ring) =>
          rows
            .filter((r) => r.ring === ring && r.barrierId === barrierId && r.phaseId != null)
            .reduce((sum, r) => sum + (splitOf(r.phaseId as number) ?? 0), 0),
        ),
      );
    }
  }
  const startOf = (r: PhaseSequenceEntry) =>
    (groupStart.get(r.barrierId as string) ?? 0) + before(r);

  return {
    phase: targetPhase,
    offsetS: offsetS + startOf(there) - startOf(here),
    greenS: targetGreen,
  };
}

export function opposingWindow(input: OpposingInput): OpposingWindow {
  const { coordinatedPhase, offsetS, greenS } = input;
  const assumed: OpposingWindow = { offsetS, greenS, basis: "assumed", partnerPhase: null };
  if (coordinatedPhase === null) return assumed;
  const partner = opposingPhaseNumber(coordinatedPhase);
  if (partner === null) return assumed;
  // Opposing phases run in different rings, between the same two barriers.
  const window = phaseWindow(input, partner, { otherRing: true });
  return window
    ? {
        offsetS: window.offsetS,
        greenS: window.greenS,
        basis: "ring-barrier",
        partnerPhase: partner,
      }
    : assumed;
}
