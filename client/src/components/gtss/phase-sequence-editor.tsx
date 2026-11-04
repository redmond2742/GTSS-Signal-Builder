import PhaseSequenceDiagram from "@/components/gtss/phase-sequence-diagram";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addBarrierGroup,
  addPhase,
  addRing,
  buildSequenceDiagrams,
  layoutFromRows,
  MAX_PHASE,
  movePhase,
  placedPhases,
  removeBarrierGroup,
  removePhase,
  removeRing,
  rowsFromLayout,
  sameLayout,
  standardLayout,
  suggestSequenceId,
  writePhaseSequence,
  type PatternSignal,
  type PhaseSequenceEntry,
  type SequenceChange,
  type SequenceLayout,
} from "gtss";
import type { Phase } from "gtss/schema";
import { phaseColors } from "gtss-diagram";
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Plus, X } from "lucide-react";
import { useState } from "react";

interface PhaseSequenceEditorProps {
  signalId: string;
  /** The sequence to edit, or null to add one. */
  sequenceId: string | null;
  phaseSequence: readonly PhaseSequenceEntry[];
  patternSignals: readonly PatternSignal[];
  /** This signal's GTSS phases, for labels and the standard layout. */
  gtssPhases: readonly Phase[];
  onCancel: () => void;
  onSaved: (text: string, change: SequenceChange) => void;
}

const STANDARD = "standard";
const EMPTY = "empty";
const COPY = "copy:";

/**
 * Build a ring-barrier sequence or change one: phases are placed in each ring's
 * barrier groups and moved along the ring, and the rows are written on Save.
 */
export default function PhaseSequenceEditor({
  signalId,
  sequenceId,
  phaseSequence,
  patternSignals,
  gtssPhases,
  onCancel,
  onSaved,
}: PhaseSequenceEditorProps) {
  const isNew = sequenceId === null;
  const existingIds = Array.from(
    new Set(phaseSequence.filter((r) => r.signalId === signalId).map((r) => r.sequenceId)),
  );
  const vehiclePhases = gtssPhases
    .filter((p) => p.movementType !== "Pedestrian")
    .map((p) => p.phase)
    .sort((a, b) => a - b);

  const startFrom = (choice: string): SequenceLayout => {
    if (choice === EMPTY) {
      return { barriers: ["A", "B"], rings: [1, 2].map((ring) => ({ ring, groups: [[], []] })) };
    }
    if (choice.startsWith(COPY)) {
      return layoutFromRows(phaseSequence, signalId, choice.slice(COPY.length));
    }
    return standardLayout(vehiclePhases);
  };

  const saved = isNew ? null : layoutFromRows(phaseSequence, signalId, sequenceId);
  const [start, setStart] = useState(STANDARD);
  const [layout, setLayout] = useState<SequenceLayout>(() => saved ?? startFrom(STANDARD));
  const [id, setId] = useState(() =>
    isNew ? suggestSequenceId(phaseSequence, patternSignals, signalId) : sequenceId,
  );
  // Resets the add-a-phase pickers after each pick.
  const [pickKey, setPickKey] = useState(0);

  const targetId = id.trim();
  const previous = isNew ? [] : phaseSequence.filter((r) => r.signalId === signalId);
  const rows = rowsFromLayout(signalId, targetId, layout, previous);
  const diagram = buildSequenceDiagrams(rows, signalId)[0];
  const placed = placedPhases(layout);

  const idProblem = !isNew
    ? null
    : targetId === ""
      ? "Give the sequence an ID."
      : existingIds.includes(targetId)
        ? `${signalId} already has ${targetId}.`
        : null;
  const problems = [
    ...(idProblem ? [idProblem] : []),
    ...(placed.length === 0 ? ["Place at least one phase."] : []),
    ...(diagram?.problems ?? []),
  ];
  const unplaced = vehiclePhases.filter((p) => !placed.includes(p));
  const changed = isNew || (saved !== null && !sameLayout(layout, saved));

  const labelOf = (phase: number) => {
    const p = gtssPhases.find((x) => x.phase === phase);
    return p ? `φ${phase} · ${p.movementType}` : `φ${phase}`;
  };
  const choices = Array.from({ length: MAX_PHASE }, (_, i) => i + 1).filter(
    (p) => !placed.includes(p),
  );
  // GTSS phases first: they are the ones this signal has.
  const offered = [
    ...choices.filter((p) => vehiclePhases.includes(p)),
    ...choices.filter((p) => !vehiclePhases.includes(p)),
  ];

  const ringEnds = (ring: SequenceLayout["rings"][number]) => {
    const all = ring.groups.flat();
    return { first: all[0], last: all[all.length - 1] };
  };

  const save = () => {
    const change = writePhaseSequence(signalId, targetId, rows);
    const rings = layout.rings.filter((r) => r.groups.some((g) => g.length > 0)).length;
    onSaved(
      `${isNew ? "Added" : "Saved"} ${signalId}'s ${targetId}: ${placed.length} phase${placed.length === 1 ? "" : "s"} in ${rings} ring${rings === 1 ? "" : "s"}.`,
      change,
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary-300 bg-primary-50/30 p-3">
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <div className="font-semibold text-grey-800">
          {isNew ? `New sequence for ${signalId}` : `Editing ${signalId} · ${sequenceId}`}
        </div>
        {isNew && (
          <>
            <label className="flex items-center gap-1.5 text-grey-600">
              ID
              <Input
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="h-7 w-24 font-mono text-xs"
                aria-label="Sequence ID"
              />
            </label>
            <label className="flex items-center gap-1.5 text-grey-600">
              Start from
              <Select
                value={start}
                onValueChange={(v) => {
                  setStart(v);
                  setLayout(startFrom(v));
                }}
              >
                <SelectTrigger className="h-7 w-56 text-xs" aria-label="Start from">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={STANDARD} className="text-xs">
                    Standard: 1 2 | 3 4 over 5 6 | 7 8
                  </SelectItem>
                  {existingIds.map((seq) => (
                    <SelectItem key={seq} value={`${COPY}${seq}`} className="text-xs">
                      A copy of {seq}
                    </SelectItem>
                  ))}
                  <SelectItem value={EMPTY} className="text-xs">
                    Empty rings
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th />
              {layout.barriers.map((b, i) => {
                const empty = layout.rings.every((r) => (r.groups[i] ?? []).length === 0);
                return (
                  <th
                    key={i}
                    className="border-l-2 border-grey-700 px-2 pb-1 text-left font-semibold text-grey-600"
                  >
                    <span className="flex items-center gap-1">
                      Barrier {b ?? "—"}
                      {empty && layout.barriers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLayout(removeBarrierGroup(layout, i))}
                          aria-label={`Remove barrier group ${b ?? i + 1}`}
                          className="rounded p-0.5 text-grey-400 hover:bg-grey-100 hover:text-grey-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  </th>
                );
              })}
              <th className="border-l-2 border-grey-700 pl-2">
                <Button
                  variant="ghost"
                  onClick={() => setLayout(addBarrierGroup(layout))}
                  className="h-6 px-1.5 text-[11px] text-grey-600"
                  title="Add a barrier group after the others"
                >
                  <Plus className="mr-0.5 h-3 w-3" />
                  Barrier
                </Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {layout.rings.map((ring) => {
              const { first, last } = ringEnds(ring);
              const empty = ring.groups.every((g) => g.length === 0);
              return (
                <tr key={ring.ring} className="border-t border-grey-200">
                  <th className="whitespace-nowrap py-1.5 pr-2 text-left font-semibold text-grey-600">
                    <span className="flex items-center gap-1">
                      Ring {ring.ring}
                      {empty && layout.rings.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLayout(removeRing(layout, ring.ring))}
                          aria-label={`Remove ring ${ring.ring}`}
                          className="rounded p-0.5 text-grey-400 hover:bg-grey-100 hover:text-grey-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  </th>
                  {ring.groups.map((group, gi) => (
                    <td key={gi} className="border-l-2 border-grey-700 px-2 py-1.5 align-middle">
                      <div className="flex flex-wrap items-center gap-1">
                        {group.map((phase) => {
                          const color = phaseColors[phase] ?? "#64748b";
                          return (
                            <span
                              key={phase}
                              className="inline-flex items-center rounded border bg-white"
                              style={{ borderColor: color }}
                              title={labelOf(phase)}
                            >
                              <button
                                type="button"
                                disabled={phase === first}
                                onClick={() => setLayout(movePhase(layout, phase, -1))}
                                aria-label={`Move φ${phase} earlier`}
                                className="px-0.5 text-grey-500 hover:text-grey-900 disabled:opacity-25"
                              >
                                <ChevronLeft className="h-3 w-3" />
                              </button>
                              <span
                                className="px-1 font-mono font-semibold"
                                style={{ color: color }}
                              >
                                {phase}
                              </span>
                              <button
                                type="button"
                                disabled={phase === last}
                                onClick={() => setLayout(movePhase(layout, phase, 1))}
                                aria-label={`Move φ${phase} later`}
                                className="px-0.5 text-grey-500 hover:text-grey-900 disabled:opacity-25"
                              >
                                <ChevronRight className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setLayout(removePhase(layout, phase))}
                                aria-label={`Remove φ${phase}`}
                                className="border-l border-grey-200 px-0.5 text-grey-400 hover:text-red-600"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                        <Select
                          key={`${pickKey}-${ring.ring}-${gi}`}
                          onValueChange={(v) => {
                            setLayout(addPhase(layout, ring.ring, gi, Number(v)));
                            setPickKey((k) => k + 1);
                          }}
                        >
                          <SelectTrigger
                            className="h-6 w-14 px-1.5 text-[11px] text-grey-500"
                            aria-label={`Add a phase to ring ${ring.ring}, barrier ${layout.barriers[gi] ?? gi + 1}`}
                          >
                            <SelectValue placeholder="+ φ" />
                          </SelectTrigger>
                          <SelectContent>
                            {offered.map((p) => (
                              <SelectItem key={p} value={String(p)} className="text-xs">
                                {labelOf(p)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                  ))}
                  <td className="border-l-2 border-grey-700" />
                </tr>
              );
            })}
          </tbody>
        </table>
        {layout.rings.length < 4 && (
          <Button
            variant="ghost"
            onClick={() => setLayout(addRing(layout))}
            className="mt-1 h-6 px-1.5 text-[11px] text-grey-600"
          >
            <Plus className="mr-0.5 h-3 w-3" />
            Ring
          </Button>
        )}
      </div>

      <p className="text-[11px] text-grey-500">
        Arrows move a phase along its ring: within a barrier group that swaps it with its neighbour
        (lead or lag), and at the edge it crosses the barrier. To move a phase to another ring, add
        it there.
      </p>

      {diagram ? (
        <div className="rounded border border-grey-200 bg-white p-2">
          <PhaseSequenceDiagram diagram={diagram} />
        </div>
      ) : null}

      <ul className="space-y-0.5 text-[11px]">
        {problems.map((p) => (
          <li key={p} className="flex items-start gap-1 text-amber-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {p}
          </li>
        ))}
        {unplaced.length > 0 && (
          <li className="flex items-start gap-1 text-grey-600">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {signalId} has GTSS phase{unplaced.length === 1 ? "" : "s"}{" "}
            {unplaced.map((p) => `φ${p}`).join(", ")}, not placed here.
          </li>
        )}
      </ul>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onCancel} className="h-8 px-3 text-xs">
          Cancel
        </Button>
        <Button
          disabled={problems.length > 0 || !changed}
          onClick={save}
          className="h-8 px-3 text-xs"
        >
          {isNew ? `Add ${targetId || "sequence"}` : `Save ${sequenceId}`}
        </Button>
      </div>
    </div>
  );
}
