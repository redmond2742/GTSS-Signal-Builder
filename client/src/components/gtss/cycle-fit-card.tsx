import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  ringSplitTotals,
  setSignalsCycle,
  undoCycleChange,
  type CoordinationRows,
  type CycleChange,
} from "gtss";
import { AlertTriangle, CheckCircle2, Info, Timer, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";

interface CycleFitCardProps {
  coordination: CoordinationRows;
  patternId: string;
  /** Signals with splits in the pattern, in corridor order where known. */
  signalIds: readonly string[];
  readOnly: boolean;
  /** Called after a write so the store can reload from storage. */
  onChanged: () => void;
}

/**
 * Mount with `key={patternId}`, so a new pattern starts fresh: its off-cycle
 * signals picked and its cycle filled in.
 *
 * Set a cycle length for several signals at once. Each signal's splits are
 * refitted ring by ring so both rings meet at each barrier and sum to the cycle;
 * optionally the pattern takes the same cycle. One undo puts it all back.
 */
export default function CycleFitCard({
  coordination,
  patternId,
  signalIds,
  readOnly,
  onChanged,
}: CycleFitCardProps) {
  const pattern = coordination.patterns.find((p) => p.patternId === patternId);
  const patternCycle = pattern?.cycleLengthS ?? 0;

  // Each signal's ring totals in this pattern, and whether they match the cycle.
  const rows = useMemo(() => {
    const { totals } = ringSplitTotals(coordination.phaseSequence, coordination.splits);
    return signalIds.map((signalId) => {
      const rings = Array.from(totals)
        .filter(([key]) => key.startsWith(`${patternId}|${signalId}|`))
        .map(([key, total]) => ({ ring: Number(key.split("|")[2]), total }))
        .sort((a, b) => a.ring - b.ring);
      const matches =
        patternCycle > 0 && rings.length > 0 && rings.every((r) => r.total === patternCycle);
      return { signalId, rings, matches };
    });
  }, [coordination, patternId, signalIds, patternCycle]);

  const mismatched = rows.filter((r) => r.rings.length > 0 && !r.matches).map((r) => r.signalId);

  const [selected, setSelected] = useState<Set<string>>(new Set(mismatched));
  const [cycleText, setCycleText] = useState(patternCycle > 0 ? String(patternCycle) : "");
  const [alsoPattern, setAlsoPattern] = useState(false);
  const [last, setLast] = useState<{
    change: CycleChange;
    cycle: number;
    patternId: string;
    setPattern: boolean;
  } | null>(null);

  const cycle = Number(cycleText);
  const cycleValid = Number.isFinite(cycle) && cycle > 0 && Number.isInteger(cycle);
  const picked = signalIds.filter((id) => selected.has(id));

  const toggle = (signalId: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(signalId);
      else next.delete(signalId);
      return next;
    });

  const apply = () => {
    if (!cycleValid || picked.length === 0) return;
    const change = setSignalsCycle(patternId, picked, cycle, { setPatternCycle: alsoPattern });
    onChanged();
    setLast({ change, cycle, patternId, setPattern: alsoPattern });
  };

  const undo = () => {
    if (!last) return;
    undoCycleChange(last.patternId, last.change);
    onChanged();
    setLast(null);
  };

  if (!pattern) return null;

  return (
    <Card>
      <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-grey-800">
          <Timer className="h-4 w-4 text-primary-600" />
          Cycle length
          <span className="text-xs font-normal text-grey-500">
            {patternId} runs {patternCycle > 0 ? `a ${patternCycle}s cycle` : "free"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-grey-500">Pick</span>
          <Button
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={() => setSelected(new Set(signalIds))}
            disabled={readOnly}
          >
            All
          </Button>
          <Button
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={() => setSelected(new Set(mismatched))}
            disabled={readOnly}
            title="Signals whose ring splits don't add up to the pattern's cycle"
          >
            Off cycle ({mismatched.length})
          </Button>
          <Button
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={() => setSelected(new Set())}
            disabled={readOnly}
          >
            None
          </Button>
        </div>
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-4" aria-label="Signals">
          {rows.map((r) => (
            <li key={r.signalId}>
              <label className="flex cursor-pointer items-center gap-2 rounded border border-grey-200 px-2 py-1 text-xs hover:bg-grey-50">
                <Checkbox
                  checked={selected.has(r.signalId)}
                  onCheckedChange={(c) => toggle(r.signalId, c === true)}
                  disabled={readOnly}
                  aria-label={`Fit ${r.signalId}`}
                />
                <span className="font-medium text-grey-800">{r.signalId}</span>
                <span
                  className={`ml-auto tabular-nums ${r.matches ? "text-green-700" : "text-amber-700"}`}
                  title={
                    r.rings.length === 0
                      ? "No ring totals: splits or the ring-barrier sequence are missing"
                      : r.rings.map((x) => `Ring ${x.ring}: ${x.total}s`).join(", ")
                  }
                >
                  {r.rings.length === 0 ? "—" : r.rings.map((x) => x.total).join(" / ")}
                  {r.rings.length > 0 &&
                    (r.matches ? (
                      <CheckCircle2 className="ml-1 inline h-3 w-3" />
                    ) : (
                      <AlertTriangle className="ml-1 inline h-3 w-3" />
                    ))}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3 border-t border-grey-200 pt-2 text-xs">
            <label className="flex items-center gap-1.5 text-grey-600">
              Cycle
              <Input
                type="number"
                min={1}
                step={1}
                value={cycleText}
                onChange={(e) => setCycleText(e.target.value)}
                className="h-7 w-20 text-xs"
                aria-label="Cycle length in seconds"
              />
              s
            </label>
            <label className="flex items-center gap-1.5 text-grey-600">
              <Checkbox
                checked={alsoPattern}
                onCheckedChange={(c) => setAlsoPattern(c === true)}
                aria-label={`Also set ${patternId}'s cycle`}
              />
              Also make it {patternId}&rsquo;s cycle
            </label>
            <Button
              onClick={apply}
              disabled={!cycleValid || picked.length === 0}
              className="h-7 px-3 text-xs"
            >
              Fit {picked.length} signal{picked.length === 1 ? "" : "s"} to{" "}
              {cycleValid ? `${cycle}s` : "…"}
            </Button>
            <span className="text-[11px] text-grey-500">
              Splits keep their proportions; both rings meet at each barrier.
            </span>
          </div>
        )}
        {last && last.patternId === patternId && (
          <div
            role="status"
            className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"
          >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p>
                {last.change.changed.length > 0
                  ? `Fitted ${last.change.changed.join(", ")} to ${last.cycle}s.`
                  : "Nothing was fitted."}
                {last.setPattern && last.change.previousCycle !== last.cycle
                  ? ` ${patternId} now runs ${last.cycle}s (was ${last.change.previousCycle ?? "blank"}).`
                  : ""}
              </p>
              {last.change.skipped.map((s) => (
                <p key={s.signalId}>
                  {s.signalId} {s.reason}, so it was left alone.
                </p>
              ))}
            </div>
            <Button variant="outline" onClick={undo} className="h-6 bg-white px-2 text-[11px]">
              <Undo2 className="mr-1 h-3 w-3" />
              Undo
            </Button>
            <Button
              variant="ghost"
              onClick={() => setLast(null)}
              aria-label="Dismiss"
              className="h-6 w-6 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
