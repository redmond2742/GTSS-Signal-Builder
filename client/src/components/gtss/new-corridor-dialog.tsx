import CorridorsMap from "@/components/gtss/corridors-map";
import SchedulePaintGrid from "@/components/gtss/schedule-paint-grid";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeDay, emptySlots, slotsToBlocks, type DaySlots } from "@/lib/schedule-slots";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applyBuild,
  directionBearing,
  intersectionStreetNames,
  OFFSET_REFERENCES,
  orderAlongBearing,
  planCorridor,
  scheduleIdsFor,
  throughApproachFor,
  WEEKLY_DAY_TYPES,
  type CoordinationRows,
  type CorridorPlan,
  type CorridorSignal,
  type GtssBuildData,
  type OffsetReference,
  type SignalPlan,
} from "gtss";
import { ArrowDownUp, ChevronDown, ChevronUp, X } from "lucide-react";
import { useMemo, useState } from "react";

interface NewCorridorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gtss: GtssBuildData;
  coordination: CoordinationRows;
  /** An agency's timezone, for the coordination plan if a schedule is built. */
  timezoneOf?: (agencyId: string) => string | null;
  /** The corridor was written; `notes` says what was filled in and what wasn't. */
  onCreated: (corridorId: string, notes: string[]) => void;
}

const DIRECTIONS = ["NB", "SB", "EB", "WB", "NEB", "SWB", "NWB", "SEB"];
const DEFAULT_CYCLE_S = "100";
/** Select values; Radix doesn't allow an empty one. */
const FOLLOW = "corridor";
const AUTO = "auto";
const NONE = "none";

/** What the dialog keeps per signal: text as typed, so a half-typed cycle isn't lost. */
interface SignalChoice {
  direction?: string;
  /** AUTO, NONE, or a phase number as text. */
  phase?: string;
  cycle?: string;
}

/**
 * Build a corridor from GTSS signals: click them on the map in travel order,
 * pick the direction (which picks each signal's coordinated phase), and
 * optionally a starter pattern, its cycle and offset reference, and the times
 * it runs. Every choice can be overridden per signal. Nothing existing is
 * overwritten.
 */
export default function NewCorridorDialog({
  open,
  onOpenChange,
  gtss,
  coordination,
  timezoneOf,
  onCreated,
}: NewCorridorDialogProps) {
  const [corridorId, setCorridorId] = useState("");
  const [name, setName] = useState("");
  const [direction, setDirection] = useState("NB");
  const [selected, setSelected] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, SignalChoice>>({});
  const [withPattern, setWithPattern] = useState(true);
  const [patternId, setPatternId] = useState("");
  const [patternEdited, setPatternEdited] = useState(false);
  const [cycle, setCycle] = useState(DEFAULT_CYCLE_S);
  const [offsetReference, setOffsetReference] = useState<OffsetReference>("BegGRN");
  const [fitSplits, setFitSplits] = useState(true);
  const [withSchedule, setWithSchedule] = useState(false);
  const [slots, setSlots] = useState<DaySlots>(emptySlots);
  const [freeRest, setFreeRest] = useState(true);
  const [attempted, setAttempted] = useState(false);

  const signalById = useMemo(
    () => new Map(gtss.signals.map((s) => [s.signalId, s])),
    [gtss.signals],
  );
  const streetsOf = (signalId: string) => {
    const s = signalById.get(signalId);
    return s ? intersectionStreetNames(s, gtss.approaches).join(" & ") : "";
  };

  const choiceOf = (signalId: string): SignalChoice => choices[signalId] ?? {};
  const setChoice = (signalId: string, patch: SignalChoice) =>
    setChoices((all) => ({ ...all, [signalId]: { ...all[signalId], ...patch } }));
  const directionOf = (signalId: string) => choiceOf(signalId).direction || direction;

  // The phase each signal's direction finds, for the list to show as "Auto".
  const autoPhaseOf = (signalId: string) => {
    const bearing = directionBearing(directionOf(signalId));
    return bearing === null ? null : throughApproachFor(signalId, bearing, gtss);
  };
  const phasesOf = (signalId: string) =>
    gtss.phases
      .filter((p) => p.signalId === signalId && p.movementType !== "Pedestrian")
      .sort((a, b) => a.phase - b.phase);

  // The pattern id follows the corridor id until it is typed over.
  const effectivePatternId = patternEdited
    ? patternId
    : corridorId.trim()
      ? `${corridorId.trim()}-P01`
      : "";

  // The schedule runs on the clock of the agency that owns the first signal.
  const firstAgency = selected.length ? signalById.get(selected[0])?.agencyId : undefined;
  const timezone = firstAgency && timezoneOf ? timezoneOf(firstAgency) : null;

  const plan: CorridorPlan = useMemo(() => {
    const perSignal: Record<string, SignalPlan> = {};
    for (const id of selected) {
      const c = choices[id] ?? {};
      const own: SignalPlan = {};
      if (c.direction) own.direction = c.direction;
      if (c.phase === NONE) own.coordinatedPhase = null;
      else if (c.phase && c.phase !== AUTO) own.coordinatedPhase = Number(c.phase);
      if (c.cycle?.trim()) own.cycleS = Number(c.cycle);
      perSignal[id] = own;
    }
    return {
      corridorId,
      name,
      direction,
      signalIds: selected,
      perSignal,
      pattern: withPattern
        ? {
            patternId: effectivePatternId,
            patternNumber: 1,
            cycleS: Number(cycle),
            offsetReference,
            fitSplits,
          }
        : null,
      schedule:
        withPattern && withSchedule
          ? { blocks: slotsToBlocks(slots), freeRest, timezone: timezone ?? null }
          : null,
    };
  }, [
    corridorId,
    name,
    direction,
    selected,
    choices,
    withPattern,
    effectivePatternId,
    cycle,
    offsetReference,
    fitSplits,
    withSchedule,
    slots,
    freeRest,
    timezone,
  ]);

  // Planning writes nothing, so it runs as you go: what would be built, and why not.
  const preview = useMemo(() => planCorridor(plan, gtss, coordination), [plan, gtss, coordination]);

  const reset = () => {
    setCorridorId("");
    setName("");
    setDirection("NB");
    setSelected([]);
    setChoices({});
    setWithPattern(true);
    setPatternId("");
    setPatternEdited(false);
    setCycle(DEFAULT_CYCLE_S);
    setOffsetReference("BegGRN");
    setFitSplits(true);
    setWithSchedule(false);
    setSlots(emptySlots());
    setFreeRest(true);
    setAttempted(false);
  };

  const add = (id: string) => setSelected((list) => (list.includes(id) ? list : [...list, id]));
  const remove = (id: string) => setSelected((list) => list.filter((x) => x !== id));
  const move = (from: number, to: number) =>
    setSelected((list) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  const sortAlongDirection = () => {
    const bearing = directionBearing(direction);
    if (bearing === null) return;
    const chosen = selected.flatMap((id) => signalById.get(id) ?? []);
    setSelected(orderAlongBearing(chosen, bearing).map((s) => s.signalId));
  };

  const create = () => {
    setAttempted(true);
    if (preview.error) return;
    applyBuild(preview.rows);
    onCreated(corridorId.trim(), preview.notes);
    reset();
    onOpenChange(false);
  };

  // The map draws the picked signals as a corridor, in the order picked.
  const draft: CorridorSignal[] = selected.map((signalId, i) => ({
    corridorId: "",
    sequence: i + 1,
    signalId,
    direction: directionOf(signalId),
  }));
  const candidates = gtss.signals.filter((s) => !selected.includes(s.signalId));

  const counts = preview.rows;
  const built = [
    counts.patternSignals?.length ? `${counts.patternSignals.length} offsets` : "",
    counts.splits?.length ? `${counts.splits.length} splits` : "",
    counts.phaseSequence?.length
      ? `${new Set(counts.phaseSequence.map((r) => r.signalId)).size} ring-barrier sequences`
      : "",
    counts.schedule?.length ? `${counts.schedule.length} schedule rows` : "",
  ].filter(Boolean);
  const ids = scheduleIdsFor(corridorId.trim() || "…");

  return (
    // Closing keeps the draft: a stray Escape or click outside shouldn't throw
    // away a corridor picked signal by signal. "Start over" clears it.
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New corridor</DialogTitle>
          <DialogDescription>
            Click signals on the map in the order traffic reaches them. The direction picks each
            signal&rsquo;s coordinated phase; change it per signal where the road bends. A starter
            pattern fills in ring-barrier sequences and splits from GTSS timings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor="nc-id" className="text-xs">
                Corridor ID
              </Label>
              <Input
                id="nc-id"
                value={corridorId}
                onChange={(e) => setCorridorId(e.target.value)}
                placeholder="MAIN-SB"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-name" className="text-xs">
                Name
              </Label>
              <Input
                id="nc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Main St southbound"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Direction</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger className="h-8 w-24 text-xs" aria-label="Direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTIONS.map((d) => (
                    <SelectItem key={d} value={d} className="text-xs">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
            <CorridorsMap
              corridorSignals={draft}
              signals={gtss.signals}
              candidates={candidates}
              onCandidateSelect={add}
              candidateLabel={streetsOf}
              onSignalSelect={remove}
              selectHint="click to take it out"
              frameAll
              className="h-[340px] w-full"
            />
            <div className="flex max-h-[340px] flex-col rounded-lg border border-grey-200">
              <div className="flex items-center justify-between gap-2 border-b border-grey-200 bg-grey-50 px-2 py-1.5">
                <span className="text-xs font-medium text-grey-700">
                  Signals in travel order ({selected.length})
                </span>
                <Button
                  variant="outline"
                  onClick={sortAlongDirection}
                  disabled={selected.length < 2}
                  title={`Put the picked signals in the order ${direction} traffic reaches them, from their coordinates`}
                  className="h-6 px-2 text-[11px]"
                >
                  <ArrowDownUp className="mr-1 h-3 w-3" />
                  Order {direction}
                </Button>
              </div>
              {selected.length === 0 ? (
                <p className="p-3 text-xs text-grey-500">
                  Click grey dots on the map to add signals. Click a numbered pin to take it out.
                </p>
              ) : (
                <ol
                  className="min-h-0 flex-1 divide-y divide-grey-100 overflow-y-auto"
                  aria-label="Signals in the new corridor"
                >
                  {selected.map((id, i) => {
                    const c = choiceOf(id);
                    const auto = autoPhaseOf(id);
                    const phaseValue = c.phase ?? AUTO;
                    const free = phaseValue === NONE || (phaseValue === AUTO && auto === null);
                    return (
                      <li key={id} className="space-y-1 px-2 py-1.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
                            {i + 1}
                          </span>
                          <span className="font-medium text-grey-800">{id}</span>
                          <span className="min-w-0 flex-1 truncate text-grey-500">
                            {streetsOf(id)}
                          </span>
                          <Button
                            variant="ghost"
                            disabled={i === 0}
                            onClick={() => move(i, i - 1)}
                            aria-label={`Move ${id} up`}
                            className="h-5 w-5 p-0"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={i === selected.length - 1}
                            onClick={() => move(i, i + 1)}
                            aria-label={`Move ${id} down`}
                            className="h-5 w-5 p-0"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => remove(id)}
                            aria-label={`Take ${id} out`}
                            className="h-5 w-5 p-0 text-grey-400 hover:text-red-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-1 pl-6">
                          <Select
                            value={c.direction || FOLLOW}
                            onValueChange={(v) =>
                              setChoice(id, { direction: v === FOLLOW ? undefined : v })
                            }
                          >
                            <SelectTrigger
                              className={`h-6 w-[68px] px-2 text-[11px] ${c.direction ? "font-semibold text-blue-700" : ""}`}
                              aria-label={`${id} direction`}
                              title={
                                c.direction
                                  ? `${c.direction} here, where the corridor runs ${direction}`
                                  : "The way coordinated traffic travels through this signal"
                              }
                            >
                              {/* Just the direction; the menu says whether it follows the corridor. */}
                              <SelectValue>{directionOf(id)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={FOLLOW} className="text-xs">
                                {direction} (corridor)
                              </SelectItem>
                              {DIRECTIONS.filter((d) => d !== direction).map((d) => (
                                <SelectItem key={d} value={d} className="text-xs">
                                  {d}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={phaseValue}
                            onValueChange={(v) => setChoice(id, { phase: v })}
                          >
                            <SelectTrigger
                              className={`h-6 min-w-0 flex-1 px-2 text-[11px] ${free ? "text-amber-700" : ""}`}
                              aria-label={`${id} coordinated phase`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={AUTO} className="text-xs">
                                {auto
                                  ? `Auto: φ${auto.phase} · ${auto.streetName}`
                                  : `Auto: nothing heads ${directionOf(id)} (free)`}
                              </SelectItem>
                              {phasesOf(id).map((p) => {
                                const approach = gtss.approaches.find(
                                  (a) => a.approachId === p.approachId,
                                );
                                return (
                                  <SelectItem
                                    key={p.phase}
                                    value={String(p.phase)}
                                    className="text-xs"
                                  >
                                    {`φ${p.phase} ${p.movementType}${approach ? ` · ${approach.streetName}` : ""}`}
                                  </SelectItem>
                                );
                              })}
                              <SelectItem value={NONE} className="text-xs">
                                None: runs free
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          {withPattern && (
                            <label className="flex items-center gap-0.5 text-[11px] text-grey-500">
                              <Input
                                type="number"
                                min={1}
                                value={c.cycle ?? ""}
                                onChange={(e) => setChoice(id, { cycle: e.target.value })}
                                placeholder={cycle}
                                aria-label={`${id} cycle in seconds`}
                                title="This signal's cycle, if not the pattern's"
                                className="h-6 w-14 px-1 text-[11px]"
                              />
                              s
                            </label>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2 rounded border border-grey-200 p-2">
              <label className="flex items-center gap-2 text-xs font-medium text-grey-700">
                <Checkbox
                  checked={withPattern}
                  onCheckedChange={(c) => setWithPattern(c === true)}
                  aria-label="Create a starter pattern"
                />
                Create a starter pattern
              </label>
              {withPattern && (
                <>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="nc-pattern" className="text-xs">
                        Pattern ID
                      </Label>
                      <Input
                        id="nc-pattern"
                        value={effectivePatternId}
                        onChange={(e) => {
                          setPatternEdited(true);
                          setPatternId(e.target.value);
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="nc-cycle" className="text-xs">
                        Cycle (s)
                      </Label>
                      <Input
                        id="nc-cycle"
                        type="number"
                        min={1}
                        value={cycle}
                        onChange={(e) => setCycle(e.target.value)}
                        className="h-8 w-20 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-grey-500">
                    Every signal runs this cycle unless you give it its own in the list.
                  </p>
                  <div className="space-y-1">
                    <Label className="text-xs">Offsets measured to</Label>
                    <Select
                      value={offsetReference}
                      onValueChange={(v) => setOffsetReference(v as OffsetReference)}
                    >
                      <SelectTrigger className="h-8 text-xs" aria-label="Offset reference">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OFFSET_REFERENCES.map((r) => (
                          <SelectItem key={r.value} value={r.value} className="text-xs">
                            {r.label} ({r.value})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-grey-500">
                      {OFFSET_REFERENCES.find((r) => r.value === offsetReference)?.hint} Written to
                      reference_point.
                    </p>
                  </div>
                  <label className="flex items-start gap-2 text-xs text-grey-700">
                    <Checkbox
                      checked={fitSplits}
                      onCheckedChange={(c) => setFitSplits(c === true)}
                      aria-label="Fit splits to the cycle"
                      className="mt-0.5"
                    />
                    <span>
                      Fit splits to the cycle
                      <span className="block text-[11px] text-grey-500">
                        Splits start at max green + yellow + all-red, then are scaled so each ring
                        adds up to the cycle and both rings meet at the barrier.
                      </span>
                    </span>
                  </label>
                </>
              )}
            </div>

            <div className="space-y-2 rounded border border-grey-200 p-2">
              <label className="flex items-center gap-2 text-xs font-medium text-grey-700">
                <Checkbox
                  checked={withPattern && withSchedule}
                  disabled={!withPattern}
                  onCheckedChange={(c) => setWithSchedule(c === true)}
                  aria-label="Schedule the pattern"
                />
                Schedule when it runs
              </label>
              {withPattern && withSchedule ? (
                <>
                  <SchedulePaintGrid
                    slots={slots}
                    onChange={setSlots}
                    restLabel={freeRest ? "free" : "not scheduled"}
                  />
                  <label className="flex items-start gap-2 text-xs text-grey-700">
                    <Checkbox
                      checked={freeRest}
                      onCheckedChange={(c) => setFreeRest(c === true)}
                      aria-label="Run free the rest of the time"
                      className="mt-0.5"
                    />
                    <span>
                      Run free the rest of the time
                      <span className="block text-[11px] text-grey-500">
                        Adds {ids.freePatternId} (pattern 254) so every day has all 24 hours.
                      </span>
                    </span>
                  </label>
                  <ul className="space-y-0.5 text-[11px] text-grey-600">
                    {WEEKLY_DAY_TYPES.map((d) => (
                      <li key={d}>
                        <span className="font-medium">{d}</span>: {describeDay(slots[d])}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="w-[250px] text-[11px] text-grey-500">
                  {withPattern
                    ? "Paint the times of the week the pattern runs. Builds Coordination.txt and Schedule.txt rows."
                    : "Needs a starter pattern."}
                </p>
              )}
            </div>
          </div>

          {selected.length > 0 && corridorId.trim() !== "" && !preview.error && (
            <div className="rounded border border-grey-200 bg-grey-50 px-3 py-2 text-[11px] text-grey-600">
              <p>
                Will create {corridorId.trim()} with {selected.length} signal
                {selected.length === 1 ? "" : "s"}
                {built.length ? `, ${built.join(", ")}` : ""}.
              </p>
              {preview.notes.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-800">
                  {preview.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {(attempted || (selected.length > 0 && corridorId.trim() !== "")) && preview.error && (
            <p role="alert" className="text-xs text-red-700">
              {preview.error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={reset}
            disabled={selected.length === 0 && corridorId === "" && name === ""}
            className="h-8 text-xs text-grey-500"
          >
            Start over
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-8 text-xs">
              Close
            </Button>
            <Button
              onClick={create}
              disabled={corridorId.trim() === "" || selected.length === 0}
              className="h-8 text-xs"
            >
              Create corridor
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
