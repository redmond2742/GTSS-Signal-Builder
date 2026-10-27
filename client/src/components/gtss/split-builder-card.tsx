import SplitDiagram from "@/components/gtss/split-diagram";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applyBuild,
  balanceBarriers,
  buildUpToCycle,
  checkSplits,
  isFreePattern,
  savedSplitValues,
  scaleToCycle,
  sequenceForPattern,
  splitPlanFor,
  standardPhaseSequence,
  startingSplits,
  undoSplitsChange,
  writeSplits,
  type CoordinationRows,
  type SplitPlan,
  type SplitsChange,
  type SplitStart,
  type SplitValues,
} from "gtss";
import type { Approach, BasicTiming, Phase } from "gtss/schema";
import { phaseColors } from "gtss-diagram";
import { AlertTriangle, Calculator, CheckCircle2, Info, Minus, Plus, Undo2, X } from "lucide-react";
import { useState } from "react";

export interface SplitSignalOption {
  signalId: string;
  hasSplits: boolean;
}

interface SplitBuilderCardProps {
  coordination: CoordinationRows;
  gtss: {
    phases: readonly Phase[];
    approaches: readonly Approach[];
    basicTimings: readonly BasicTiming[];
  };
  patternId: string;
  patternOptions: readonly string[];
  onPatternChange: (patternId: string) => void;
  signalId: string;
  /** The pattern's signals, in corridor order. */
  signalOptions: readonly SplitSignalOption[];
  onSignalChange: (signalId: string) => void;
  readOnly: boolean;
  /** Called after a write so the store can reload from storage. */
  onChanged: () => void;
}

const START_OPTIONS: { value: SplitStart; label: string; hint: string }[] = [
  {
    value: "minimum",
    label: "Minimums",
    hint: "Min green (or walk + ped clearance, if longer) plus yellow and all-red",
  },
  { value: "maxGreen", label: "Max greens", hint: "Max green plus yellow and all-red" },
  { value: "even", label: "Even", hint: "The cycle shared evenly across barriers, then phases" },
];

/** The phases a plan covers, with 0 for any the values leave out. */
const onlyPlanned = (plan: SplitPlan, values: SplitValues) =>
  Object.fromEntries(plan.phases.map((p) => [p.phaseId, Math.max(0, values[p.phaseId] ?? 0)]));

const sameValues = (plan: SplitPlan, a: SplitValues, b: SplitValues) =>
  plan.phases.every((p) => (a[p.phaseId] ?? 0) === (b[p.phaseId] ?? 0));

/** Phases a step changed, for a one-line account of what it did. */
const describeChange = (plan: SplitPlan, before: SplitValues, after: SplitValues) =>
  plan.phases
    .filter((p) => (after[p.phaseId] ?? 0) !== (before[p.phaseId] ?? 0))
    .map((p) => {
      const d = (after[p.phaseId] ?? 0) - (before[p.phaseId] ?? 0);
      return `φ${p.phaseId} ${d > 0 ? "+" : "−"}${Math.abs(d)}s`;
    })
    .join(", ");

/**
 * Build or adjust one signal's splits in one pattern, with the ring-barrier
 * diagram drawn to time beside the numbers. Nothing is written until Save.
 */
export default function SplitBuilderCard({
  coordination,
  gtss,
  patternId,
  patternOptions,
  onPatternChange,
  signalId,
  signalOptions,
  onSignalChange,
  readOnly,
  onChanged,
}: SplitBuilderCardProps) {
  const [notice, setNotice] = useState<{ text: string; change: SplitsChange | null } | null>(null);

  const pattern = coordination.patterns.find((p) => p.patternId === patternId);
  const cycle = pattern?.cycleLengthS ?? 0;
  const free = pattern ? isFreePattern(pattern) : false;

  // The sequence this pattern runs, as named in PatternSignals' notes, else the first.
  const sequenceFor = (id: string) => {
    const ids = Array.from(
      new Set(coordination.phaseSequence.filter((r) => r.signalId === id).map((r) => r.sequenceId)),
    );
    const named = sequenceForPattern(
      coordination.patternSignals,
      coordination.phaseSequence,
      patternId,
      id,
    );
    const sequenceId = named ?? ids[0] ?? null;
    return {
      sequenceId,
      named: named != null,
      count: ids.length,
      rows: coordination.phaseSequence.filter(
        (r) => r.signalId === id && r.sequenceId === sequenceId,
      ),
    };
  };
  const planFor = (id: string) =>
    splitPlanFor(
      id,
      sequenceFor(id).rows,
      gtss,
      coordination.splits.filter((s) => s.signalId === id),
    );
  const coordinatedOf = (id: string) =>
    coordination.patternSignals.find((ps) => ps.patternId === patternId && ps.signalId === id)
      ?.coordinatedPhase ?? null;

  const seq = sequenceFor(signalId);
  const plan = planFor(signalId);
  const saved = savedSplitValues(coordination.splits, patternId, signalId);
  const hasSaved = Object.keys(saved).length > 0;
  const coordinated = coordinatedOf(signalId);

  const gtssVehiclePhases = gtss.phases
    .filter((p) => p.signalId === signalId && p.movementType !== "Pedestrian")
    .map((p) => p.phase);

  const buildSequence = () => {
    applyBuild({ phaseSequence: standardPhaseSequence(signalId, gtssVehiclePhases) });
    onChanged();
    setNotice({
      text: `Built ${signalId}'s ring-barrier sequence from its GTSS phases: 1 2 | 3 4 over 5 6 | 7 8. Check it on the PhaseSequence page.`,
      change: null,
    });
  };

  // Every signal in the pattern still without splits, built the same way. One
  // with no ring-barrier sequence has nothing to build on, so it isn't offered.
  const missing = signalOptions.filter((o) => !o.hasSplits).map((o) => o.signalId);
  const buildable = missing.filter((id) => planFor(id).phases.length > 0);
  const unbuildable = missing.filter((id) => !buildable.includes(id));
  const buildMissing = () => {
    const bySignal = new Map<string, SplitValues>();
    for (const id of buildable) {
      const p = planFor(id);
      const start = startingSplits(p, "minimum", cycle).values;
      bySignal.set(id, onlyPlanned(p, buildUpToCycle(p, start, cycle, coordinatedOf(id)).values));
    }
    const skipped = unbuildable;
    const change = writeSplits(patternId, bySignal);
    onChanged();
    setNotice({
      text:
        `Built splits for ${Array.from(bySignal.keys()).join(", ")}: minimums, then the rest of the ${cycle}s cycle to each coordinated phase.` +
        (skipped.length ? ` Skipped ${skipped.join(", ")}: no ring-barrier sequence.` : ""),
      change,
    });
  };

  const save = (values: SplitValues) => {
    const change = writeSplits(patternId, new Map([[signalId, onlyPlanned(plan, values)]]));
    onChanged();
    setNotice({
      text: `${hasSaved ? "Saved" : "Created"} ${signalId}'s splits in ${patternId}.`,
      change,
    });
  };

  const undo = () => {
    if (!notice?.change) return;
    undoSplitsChange(notice.change);
    onChanged();
    setNotice(null);
  };

  const labelOf = (phaseId: number) => {
    const phase = gtss.phases.find((p) => p.signalId === signalId && p.phase === phaseId);
    if (!phase) return null;
    const approach = gtss.approaches.find((a) => a.approachId === phase.approachId);
    return approach ? `${phase.movementType} · ${approach.streetName}` : phase.movementType;
  };

  return (
    <Card>
      <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-grey-800">
            <Calculator className="h-4 w-4 text-primary-600" />
            Split builder
            {pattern && (
              <span className="text-xs font-normal text-grey-500">
                {free ? `${patternId} runs free` : `${patternId} runs a ${cycle}s cycle`}
              </span>
            )}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly && !free && cycle > 0 && buildable.length > 0 && (
              <Button
                variant="outline"
                onClick={buildMissing}
                className="h-7 px-2 text-xs"
                title={`Build splits for ${buildable.join(", ")}: each from its minimums, with the rest of the cycle on its coordinated phase.${unbuildable.length ? ` ${unbuildable.join(", ")} can't be built yet: no ring-barrier sequence.` : ""}`}
              >
                Build missing ({buildable.length})
              </Button>
            )}
            <Select value={patternId} onValueChange={onPatternChange}>
              <SelectTrigger className="h-7 w-44 text-xs" aria-label="Pattern">
                <SelectValue placeholder="Pattern" />
              </SelectTrigger>
              <SelectContent>
                {patternOptions.map((id) => (
                  <SelectItem key={id} value={id} className="text-xs">
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={signalId} onValueChange={onSignalChange}>
              <SelectTrigger className="h-7 w-48 text-xs" aria-label="Signal">
                <SelectValue placeholder="Signal" />
              </SelectTrigger>
              <SelectContent>
                {signalOptions.map((o) => (
                  <SelectItem key={o.signalId} value={o.signalId} className="text-xs">
                    {o.signalId}
                    {o.hasSplits ? "" : " · no splits"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3">
        {notice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"
          >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{notice.text}</span>
            {notice.change && (
              <Button variant="outline" onClick={undo} className="h-6 bg-white px-2 text-[11px]">
                <Undo2 className="mr-1 h-3 w-3" />
                Undo
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="h-6 w-6 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {!pattern || !signalId ? (
          <p className="text-xs text-grey-500">
            Pick a pattern and a signal. Patterns come from Patterns.txt and signals from the
            pattern&rsquo;s corridor.
          </p>
        ) : free ? (
          <p className="text-xs text-grey-500">
            {patternId} has no cycle (it is the free pattern), so its signals have no splits.
          </p>
        ) : cycle <= 0 ? (
          <p className="text-xs text-grey-500">{patternId} needs a cycle length in Patterns.txt.</p>
        ) : plan.phases.length === 0 ? (
          <div className="space-y-2 text-xs text-grey-600">
            <p>
              {signalId} has no ring-barrier sequence in PhaseSequence.txt, so there is nothing to
              lay its splits out on.
            </p>
            {!readOnly && gtssVehiclePhases.length > 0 && (
              <Button variant="outline" onClick={buildSequence} className="h-7 px-2 text-xs">
                Build the standard sequence from its GTSS phases
              </Button>
            )}
          </div>
        ) : (
          <SplitEditor
            // A new signal, pattern or saved state starts the draft afresh.
            key={`${patternId}|${signalId}|${seq.sequenceId}|${JSON.stringify(saved)}`}
            plan={plan}
            saved={saved}
            hasSaved={hasSaved}
            cycle={cycle}
            coordinatedPhase={coordinated}
            labelOf={labelOf}
            caption={
              seq.count > 1
                ? seq.named
                  ? `Laid out on ${seq.sequenceId}, the sequence this pattern's notes name.`
                  : `Laid out on ${seq.sequenceId}, the first of ${seq.count} sequences; PatternSignals doesn't say which this pattern runs.`
                : null
            }
            readOnly={readOnly}
            onSave={save}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface SplitEditorProps {
  plan: SplitPlan;
  saved: SplitValues;
  hasSaved: boolean;
  cycle: number;
  coordinatedPhase: number | null;
  labelOf: (phaseId: number) => string | null;
  caption: string | null;
  readOnly: boolean;
  onSave: (values: SplitValues) => void;
}

function SplitEditor({
  plan,
  saved,
  hasSaved,
  cycle,
  coordinatedPhase,
  labelOf,
  caption,
  readOnly,
  onSave,
}: SplitEditorProps) {
  // With nothing saved, start from a finished build rather than an empty diagram.
  const initial = () => {
    if (hasSaved) return { values: onlyPlanned(plan, saved), message: null as string | null };
    const start = startingSplits(plan, "minimum", cycle);
    const built = buildUpToCycle(plan, start.values, cycle, coordinatedPhase);
    return {
      values: built.values,
      message: [
        built.overS > 0
          ? `No splits yet. Even at their minimums the phases need ${cycle + built.overS}s, more than the ${cycle}s cycle, so these run ${built.overS}s over.`
          : `No splits yet: built from minimums, with the rest of the ${cycle}s cycle${coordinatedPhase != null ? ` on φ${coordinatedPhase} and the phase beside it` : " shared across the barriers"}.`,
        "Save to add them to Splits.txt.",
        ...start.notes,
      ].join(" "),
    };
  };
  const [first] = useState(initial);
  const [draft, setDraft] = useState<Record<number, number>>(first.values);
  const [message, setMessage] = useState<string | null>(first.message);

  const check = checkSplits(plan, draft, cycle);
  const below = new Set(check.belowMinimum.map((b) => b.phaseId));
  const dirty = !hasSaved || !sameValues(plan, draft, saved);

  const apply = (next: Record<number, number>, describe: (change: string) => string) => {
    const change = describeChange(plan, draft, next);
    setDraft(next);
    setMessage(change ? describe(change) : "No change.");
  };
  const setOne = (phaseId: number, seconds: number) =>
    setDraft((d) => ({ ...d, [phaseId]: Math.max(0, Math.round(seconds)) }));

  const startFrom = (from: SplitStart | "saved") => {
    if (from === "saved") {
      setDraft(onlyPlanned(plan, saved));
      setMessage("Back to the saved splits.");
      return;
    }
    const start = startingSplits(plan, from, cycle);
    setDraft(start.values);
    setMessage(
      [
        `Started from ${START_OPTIONS.find((o) => o.value === from)?.label.toLowerCase()}: ${checkSplits(plan, start.values, cycle).usedS}s of the ${cycle}s cycle used. Build up to fill the rest.`,
        ...start.notes,
      ].join(" "),
    );
  };

  const buildUp = () => {
    const { values, addedS, overS } = buildUpToCycle(plan, draft, cycle, coordinatedPhase);
    const change = describeChange(plan, draft, values);
    setDraft(values);
    setMessage(
      overS > 0
        ? `Even with every phase it could trim at its minimum, these splits need ${cycle + overS}s: ${overS}s more than the ${cycle}s cycle.${change ? ` Changed ${change}.` : ""} Shorten a phase by hand, or lengthen the cycle.`
        : addedS > 0
          ? `Built up to ${cycle}s: ${change}.`
          : addedS < 0
            ? `Trimmed to ${cycle}s, from the coordinated phases first: ${change}.`
            : change
              ? `Lined up the barriers: ${change}.`
              : `Already fills the ${cycle}s cycle.`,
    );
  };

  const groupedRows = plan.groups.flatMap((g) =>
    g.rings.flatMap((r) => r.phases.map((p, i) => ({ g, r, p, first: i === 0 }))),
  );

  return (
    <div className="space-y-3">
      <SplitDiagram
        plan={plan}
        values={draft}
        cycleS={cycle}
        coordinatedPhase={coordinatedPhase}
        belowMinimum={below}
        onChange={readOnly ? undefined : setOne}
      />
      {caption && <p className="text-[11px] text-grey-500">{caption}</p>}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-grey-500">Start from</span>
            {START_OPTIONS.map((o) => (
              <Button
                key={o.value}
                variant="outline"
                onClick={() => startFrom(o.value)}
                title={o.hint}
                className="h-7 px-2 text-xs"
              >
                {o.label}
              </Button>
            ))}
            {hasSaved && (
              <Button
                variant="outline"
                onClick={() => startFrom("saved")}
                title="The splits in Splits.txt"
                className="h-7 px-2 text-xs"
              >
                Saved
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-grey-500">Then</span>
            <Button
              onClick={buildUp}
              className="h-7 px-2 text-xs"
              title={`Line the rings up at each barrier, then give the rest of the cycle to ${coordinatedPhase != null ? `φ${coordinatedPhase} and the phase beside it` : "the longest phase in each ring, across the barriers"}. If the splits run long, take it back from the same phases first, never below a minimum.`}
            >
              Build up to {cycle}s
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                apply(
                  balanceBarriers(plan, draft, coordinatedPhase),
                  (c) => `Lined up the barriers: ${c}.`,
                )
              }
              title="Give a ring that reaches a barrier early the difference, so both rings cross together"
              className="h-7 px-2 text-xs"
            >
              Line up barriers
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                apply(scaleToCycle(plan, draft, cycle), (c) => `Scaled to ${cycle}s: ${c}.`)
              }
              title="Stretch or shrink every phase in proportion so the cycle is filled exactly"
              className="h-7 px-2 text-xs"
            >
              Scale to {cycle}s
            </Button>
          </div>
        </div>
      )}
      {message && <p className="text-[11px] text-grey-600">{message}</p>}

      <div className="overflow-x-auto rounded border border-grey-200">
        <table className="w-full text-xs">
          <thead className="bg-grey-50 text-left text-grey-500">
            <tr>
              <th className="px-2 py-1 font-medium">Barrier · ring</th>
              <th className="px-2 py-1 font-medium">Phase</th>
              <th className="px-2 py-1 font-medium">Movement</th>
              <th className="px-2 py-1 text-right font-medium">Minimum</th>
              <th className="px-2 py-1 font-medium">Split (s)</th>
              <th className="px-2 py-1 text-right font-medium">Green</th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map(({ g, r, p, first }) => {
              const value = draft[p.phaseId] ?? 0;
              const low = below.has(p.phaseId);
              return (
                <tr
                  key={p.phaseId}
                  className={`border-t border-grey-100 ${p.active ? "" : "text-grey-400"} ${first && r.ring === g.rings[0].ring ? "border-t-grey-300" : ""}`}
                >
                  <td className="px-2 py-1 text-grey-500">
                    {first ? `${g.barrierId || "—"} · R${r.ring}` : ""}
                  </td>
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ background: phaseColors[p.phaseId] ?? "#9ca3af" }}
                      />
                      <span className="font-medium">φ{p.phaseId}</span>
                      {p.phaseId === coordinatedPhase && (
                        <span className="rounded bg-grey-800 px-1 text-[10px] text-white">
                          coord
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-grey-600">
                    {labelOf(p.phaseId) ?? (p.active ? "" : "not used here")}
                  </td>
                  <td
                    className="px-2 py-1 text-right tabular-nums text-grey-500"
                    title={
                      p.minimumBasis
                        ? `From ${p.minimumBasis} plus yellow and all-red`
                        : "No timings in GTSS"
                    }
                  >
                    {p.minimumS != null ? `${p.minimumS}s` : "—"}
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        disabled={readOnly || value <= 0}
                        onClick={() => setOne(p.phaseId, value - 1)}
                        aria-label={`φ${p.phaseId} one second less`}
                        className="h-6 w-6 p-0"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        value={value}
                        disabled={readOnly}
                        onChange={(e) => setOne(p.phaseId, Number(e.target.value) || 0)}
                        aria-label={`φ${p.phaseId} split in seconds`}
                        className={`h-6 w-16 px-1 text-xs tabular-nums ${low ? "border-red-400 text-red-700" : ""}`}
                      />
                      <Button
                        variant="ghost"
                        disabled={readOnly}
                        onClick={() => setOne(p.phaseId, value + 1)}
                        aria-label={`φ${p.phaseId} one second more`}
                        className="h-6 w-6 p-0"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      {low && <span className="text-[10px] text-red-700">below {p.minimumS}s</span>}
                    </div>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-grey-500">
                    {value > 0 && p.clearanceS != null
                      ? `${Math.max(0, value - p.clearanceS)}s`
                      : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <ul className="space-y-0.5 text-[11px]">
          {check.ok ? (
            <li className="flex items-center gap-1 text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Every ring adds up to {cycle}s and the rings cross each barrier together.
            </li>
          ) : (
            <>
              {check.ringTotals
                .filter((t) => t.totalS !== cycle)
                .map((t) => (
                  <li key={`r${t.ring}`} className="flex items-center gap-1 text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Ring {t.ring} adds up to {t.totalS}s, not {cycle}s (
                    {t.totalS > cycle ? `${t.totalS - cycle}s over` : `${cycle - t.totalS}s short`}
                    ).
                  </li>
                ))}
              {check.unbalanced.map((u) => (
                <li key={`b${u.barrierId}`} className="flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Barrier {u.barrierId || "(none)"}: the rings get there at different times (
                  {u.totals.map((t) => `R${t.ring} ${t.totalS}s`).join(", ")}).
                </li>
              ))}
            </>
          )}
          {check.belowMinimum.map((b) => (
            <li key={`m${b.phaseId}`} className="flex items-center gap-1 text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />φ{b.phaseId} has {b.valueS}s, less than its{" "}
              {b.minimumS}s minimum.
            </li>
          ))}
          <li className="text-grey-500">
            0s means the phase doesn&rsquo;t run in this pattern; it gets no row in Splits.txt.
          </li>
        </ul>
        {!readOnly && (
          <div className="flex items-center gap-2">
            {hasSaved && (
              <Button
                variant="outline"
                disabled={!dirty}
                onClick={() => {
                  setDraft(onlyPlanned(plan, saved));
                  setMessage(null);
                }}
                className="h-8 px-3 text-xs"
              >
                Revert
              </Button>
            )}
            <Button disabled={!dirty} onClick={() => onSave(draft)} className="h-8 px-3 text-xs">
              {hasSaved ? "Save splits" : "Create splits"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
