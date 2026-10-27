import {
  intersectionStreetNames,
  opposingPhaseNumber,
  progressionPhases,
  reverseDirection,
  sequenceForPattern,
  setProgression,
  sortBySequence,
  type CoordinationRows,
} from "gtss";
import type { Approach, Phase, Signal } from "gtss/schema";
import { phaseColors } from "gtss-diagram";
import { CornerUpLeft, GitMerge } from "lucide-react";

interface ProgressionPanelProps {
  coordination: CoordinationRows;
  patternId: string;
  corridorId: string;
  /** The corridor's direction, for signals whose own row doesn't say. */
  forwardDirection: string | null;
  signals: readonly Signal[];
  gtss: { phases: readonly Phase[]; approaches: readonly Approach[] };
  readOnly: boolean;
  /** Called after a write so the store can reload from storage. */
  onChanged: () => void;
}

/**
 * Which phases, besides the coordinated one, let the corridor's traffic through
 * each signal: an overlap that keeps the through movement going, or a left turn
 * the route takes. Each choice is per direction and goes in PhaseSequence.txt's
 * progression column; the time-space diagram above draws it and lets vehicles
 * and the bandwidth use it.
 */
export default function ProgressionPanel({
  coordination,
  patternId,
  corridorId,
  forwardDirection,
  signals,
  gtss,
  readOnly,
  onChanged,
}: ProgressionPanelProps) {
  const members = sortBySequence(
    coordination.corridorSignals.filter((cs) => cs.corridorId === corridorId),
  );
  if (!patternId || members.length === 0) return null;

  const movementOf = (signalId: string, phase: number) => {
    const p = gtss.phases.find((x) => x.signalId === signalId && x.phase === phase);
    if (!p) return null;
    const approach = gtss.approaches.find((a) => a.approachId === p.approachId);
    return { type: p.movementType, street: approach?.streetName ?? null };
  };

  const rows = members.map((cs) => {
    const signalId = cs.signalId;
    const ps = coordination.patternSignals.find(
      (r) => r.patternId === patternId && r.signalId === signalId,
    );
    const coordinated = ps?.coordinatedPhase ?? null;
    // The phases this pattern runs here: those in its sequence with a split.
    const ids = Array.from(
      new Set(
        coordination.phaseSequence.filter((r) => r.signalId === signalId).map((r) => r.sequenceId),
      ),
    );
    const sequenceId =
      sequenceForPattern(
        coordination.patternSignals,
        coordination.phaseSequence,
        patternId,
        signalId,
      ) ?? ids[0];
    const timed = new Set(
      coordination.splits
        .filter((s) => s.patternId === patternId && s.signalId === signalId && (s.splitS ?? 0) > 0)
        .map((s) => s.phaseId),
    );
    const phases = coordination.phaseSequence
      .filter(
        (r) =>
          r.signalId === signalId &&
          r.sequenceId === sequenceId &&
          r.phaseId != null &&
          timed.has(r.phaseId),
      )
      .map((r) => r.phaseId as number)
      .sort((a, b) => a - b);
    const forward = cs.direction ?? forwardDirection;
    const back = reverseDirection(forward);
    const signal = signals.find((s) => s.signalId === signalId);
    return {
      signalId,
      streets: signal ? intersectionStreetNames(signal, gtss.approaches).join(" / ") : "",
      coordinated,
      directions: [
        { direction: forward, own: coordinated },
        { direction: back, own: coordinated === null ? null : opposingPhaseNumber(coordinated) },
      ].map(({ direction, own }) => {
        const marked = progressionPhases(coordination.phaseSequence, signalId, direction);
        // A marked phase this pattern doesn't time still shows, so it can be unmarked.
        const offered = Array.from(new Set([...phases, ...marked]))
          .filter((p) => p !== own)
          .sort((a, b) => a - b);
        return { direction, own, marked: new Set(marked), offered, timed };
      }),
    };
  });

  const toggle = (signalId: string, phase: number, direction: string, on: boolean) => {
    if (setProgression(signalId, phase, direction, on)) onChanged();
  };

  const count = rows.reduce((n, r) => n + r.directions.reduce((m, d) => m + d.marked.size, 0), 0);

  return (
    <div className="border-t border-grey-200 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-grey-700">
          Progression through overlaps and left turns
          {count > 0 && <span className="ml-1.5 font-normal text-grey-500">({count} on)</span>}
        </h3>
        <p className="text-[11px] text-grey-500">
          Turn on a phase that also carries the corridor&rsquo;s traffic through a signal. It is
          drawn dashed above, vehicles go through on it, and it counts toward the bandwidth. Saved
          in PhaseSequence.txt (progression column).
        </p>
      </div>
      <div className="mt-1.5 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] text-grey-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Signal</th>
              <th className="py-1 pr-2 font-medium">Coordinated</th>
              {rows[0].directions.map((d, i) => (
                <th key={i} className="py-1 pr-2 font-medium">
                  {i === 0 ? "Forward" : "Return"} {d.direction ? `(${d.direction})` : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.signalId} className="border-t border-grey-100 align-top">
                <td className="py-1 pr-2">
                  <span className="font-medium text-grey-800">{r.signalId}</span>
                  {r.streets && (
                    <span className="block text-[10px] text-grey-500">{r.streets}</span>
                  )}
                </td>
                <td className="py-1 pr-2 text-grey-600">
                  {r.coordinated === null ? "runs free" : `φ${r.coordinated}`}
                </td>
                {r.directions.map((d, i) => (
                  <td key={i} className="py-1 pr-2">
                    {r.coordinated === null || !d.direction ? (
                      <span className="text-grey-400">—</span>
                    ) : d.offered.length === 0 ? (
                      <span className="text-grey-400">no other timed phases</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {d.offered.map((phase) => {
                          const on = d.marked.has(phase);
                          const movement = movementOf(r.signalId, phase);
                          const left = /left/i.test(movement?.type ?? "");
                          const untimed = !d.timed.has(phase);
                          const Icon = left ? CornerUpLeft : GitMerge;
                          return (
                            <button
                              key={phase}
                              type="button"
                              disabled={readOnly}
                              aria-pressed={on}
                              onClick={() => toggle(r.signalId, phase, d.direction as string, !on)}
                              title={[
                                movement
                                  ? `φ${phase}: ${movement.type}${movement.street ? `, ${movement.street}` : ""}.`
                                  : `φ${phase}.`,
                                on
                                  ? `${d.direction} traffic goes through ${r.signalId} on it too. Click to stop.`
                                  : `Click if ${d.direction} traffic also goes through ${r.signalId} on it (${left ? "the route turns left here" : "an overlap carries the through movement"}).`,
                                untimed ? `${patternId} gives it no split, so it never runs.` : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] disabled:cursor-not-allowed ${
                                on
                                  ? "border-green-700 bg-green-50 font-semibold text-green-800"
                                  : "border-grey-300 bg-white text-grey-600 hover:border-grey-400"
                              } ${untimed ? "border-dashed opacity-70" : ""}`}
                            >
                              <span
                                className="inline-block h-2 w-2 rounded-sm"
                                style={{ background: phaseColors[phase] ?? "#9ca3af" }}
                              />
                              φ{phase}
                              <Icon
                                className="h-3 w-3"
                                aria-label={left ? "left turn" : "overlap"}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
