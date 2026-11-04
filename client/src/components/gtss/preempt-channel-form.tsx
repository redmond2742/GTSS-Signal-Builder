import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  movementsOfPhase,
  preemptChannelsFor,
  preemptRowsFor,
  undoPreemptChange,
  writePreemptChannel,
  type PreemptGtssData,
  type PreemptMovement,
  type PreemptRow,
} from "gtss";
import { phaseColors, PreemptDiagram } from "gtss-diagram";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

interface PreemptChannelFormProps {
  signalId: string;
  /** The channel to edit, or null to add one. */
  channel: number | null;
  preempts: readonly PreemptRow[];
  gtss: PreemptGtssData;
  isLht: boolean;
  onCancel: () => void;
  /** After a save, with what it did in words and how to undo it. */
  onSaved: (text: string, undo: () => void) => void;
}

/** How a phase's movements read: "EB left", or "EB through, WB through". */
export const describeMovements = (movements: readonly PreemptMovement[]): string =>
  movements.map((m) => (m.problem ? m.problem : `${m.direction} ${m.label}`)).join(", ");

const mostCommon = <T,>(values: readonly T[]): T | undefined => {
  const counts = new Map<T, number>();
  let best: T | undefined;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (best === undefined || n > (counts.get(best) ?? 0)) best = v;
  }
  return best;
};

/**
 * Add a preempt channel or change one: its number, type and max time, and which
 * of the signal's phases it brings up, with the chart drawn as they're ticked.
 */
export default function PreemptChannelForm({
  signalId,
  channel,
  preempts,
  gtss,
  isLht,
  onCancel,
  onSaved,
}: PreemptChannelFormProps) {
  const isNew = channel === null;
  const atSignal = preempts.filter((r) => r.signalId === signalId);
  const own = atSignal.filter((r) => r.channel === channel);
  const takenChannels = new Set(atSignal.map((r) => r.channel));

  const firstFree = () => {
    let n = 1;
    while (takenChannels.has(n)) n++;
    return n;
  };
  const initialType = own[0]?.type ?? mostCommon(atSignal.map((r) => r.type)) ?? "EMERGENCY";
  const initialMax = own[0]?.maxTimeS ?? mostCommon(atSignal.map((r) => r.maxTimeS)) ?? null;
  const initialPhases = own.map((r) => r.phase);

  const [channelText, setChannelText] = useState(String(channel ?? firstFree()));
  const [type, setType] = useState(initialType ?? "");
  const [maxText, setMaxText] = useState(initialMax === null ? "" : String(initialMax));
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set(initialPhases));

  const number = /^\d+$/.test(channelText.trim()) ? Number(channelText.trim()) : null;
  const maxTimeS = /^\d+$/.test(maxText.trim()) ? Number(maxText.trim()) : null;
  const maxInvalid = maxText.trim() !== "" && maxTimeS === null;

  // The signal's vehicle phases, and any the channel already names that aren't
  // among them. With no phases in GTSS at all, the usual eight.
  const gtssNumbers = gtss.phases
    .filter((p) => p.signalId === signalId && p.movementType !== "Pedestrian")
    .map((p) => p.phase);
  const options = Array.from(
    new Set([
      ...(gtssNumbers.length > 0 ? gtssNumbers : [1, 2, 3, 4, 5, 6, 7, 8]),
      ...initialPhases,
    ]),
  ).sort((a, b) => a - b);

  const toggle = (phase: number, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(phase);
      else next.delete(phase);
      return next;
    });

  const previewNumber = number ?? 0;
  const rows = preemptRowsFor(
    signalId,
    previewNumber,
    Array.from(picked),
    type.trim() || null,
    maxTimeS,
  );
  const [preview] = preemptChannelsFor(rows, signalId, gtss);
  const approaches = gtss.approaches.filter((a) => a.signalId === signalId);

  const problems = [
    number === null || number < 1 ? "The channel needs a whole number from 1 up." : null,
    isNew && number !== null && takenChannels.has(number)
      ? `Signal ${signalId} already has channel ${number}. Edit that one, or pick another number.`
      : null,
    maxInvalid ? "Max time must be a whole number of seconds." : null,
    picked.size === 0 ? "Tick at least one phase." : null,
  ].filter((p): p is string => p !== null);

  // Rows written the same as they are don't count as a change, in any order.
  const unchanged =
    !isNew &&
    JSON.stringify(rows) ===
      JSON.stringify(
        preemptRowsFor(
          signalId,
          previewNumber,
          initialPhases,
          own[0]?.type ?? null,
          own[0]?.maxTimeS ?? null,
        ),
      );

  const save = () => {
    const change = writePreemptChannel(signalId, previewNumber, rows);
    const list = rows.map((r) => `φ${r.phase}`).join(" + ");
    onSaved(
      `${isNew ? "Added" : "Saved"} channel ${previewNumber} at signal ${signalId}: ${list}.`,
      () => undoPreemptChange(change),
    );
  };

  return (
    <div className="col-span-full space-y-3 rounded-lg border border-primary-300 bg-primary-50/30 p-3 text-xs">
      <div className="font-semibold text-grey-800">
        {isNew
          ? `New channel at signal ${signalId}`
          : `Editing channel ${channel}, signal ${signalId}`}
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-grey-600">
            {isNew && (
              <label className="flex items-center gap-1.5">
                Channel
                <Input
                  value={channelText}
                  onChange={(e) => setChannelText(e.target.value)}
                  inputMode="numeric"
                  aria-label="Channel number"
                  className="h-7 w-14 text-xs"
                />
              </label>
            )}
            <label className="flex items-center gap-1.5">
              Type
              <Input
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-label="Preempt type"
                className="h-7 w-32 text-xs"
              />
            </label>
            <label className="flex items-center gap-1.5">
              Max time (s)
              <Input
                value={maxText}
                onChange={(e) => setMaxText(e.target.value)}
                inputMode="numeric"
                aria-label="Max time in seconds"
                className="h-7 w-16 text-xs"
              />
            </label>
          </div>
          <div>
            <div className="mb-1 font-semibold text-grey-700">Phases it brings up</div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              {options.map((phase) => (
                <label key={phase} className="flex items-center gap-1.5 text-grey-700">
                  <Checkbox
                    checked={picked.has(phase)}
                    onCheckedChange={(c) => toggle(phase, c === true)}
                    aria-label={`Phase ${phase}`}
                  />
                  <span
                    className="font-mono font-semibold"
                    style={{ color: phaseColors[phase] ?? "#64748b" }}
                  >
                    φ{phase}
                  </span>
                  <span className="text-[11px] text-grey-500">
                    {describeMovements(movementsOfPhase(signalId, phase, gtss))}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded border border-grey-200 bg-white p-1">
          <PreemptDiagram
            phases={(preview?.movements ?? []).map((m) => ({
              phase: m.phase,
              approachId: m.approachId,
              movementType: m.movementType ?? "",
            }))}
            approaches={approaches.map((a) => ({
              approachId: a.approachId,
              compassBearing: a.compassBearing ?? null,
            }))}
            isLht={isLht}
            label={`Preview of channel ${channelText} at signal ${signalId}`}
          />
        </div>
      </div>
      {problems.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-amber-700">
          {problems.map((p) => (
            <li key={p} className="flex items-start gap-1">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onCancel} className="h-8 px-3 text-xs">
          Cancel
        </Button>
        <Button
          disabled={problems.length > 0 || unchanged}
          onClick={save}
          className="h-8 px-3 text-xs"
        >
          {isNew ? "Add channel" : "Save channel"}
        </Button>
      </div>
    </div>
  );
}
