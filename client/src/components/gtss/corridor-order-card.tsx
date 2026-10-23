import CorridorsMap, { type PinLabelMode } from "@/components/gtss/corridors-map";
import SortableStopList from "@/components/gtss/sortable-stop-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SEGMENT_ITEM_CLASS } from "@/lib/segmented";
import {
  applyBuild,
  intersectionStreetNames,
  naturalCompare,
  planAddSignal,
  removeCorridorSignal,
  moveCorridorSignal,
  sortBySequence,
  type CoordinationRows,
  type Corridor,
  type CorridorSignal,
  type GtssBuildData,
} from "gtss";
import type { Signal } from "gtss/schema";
import { AlertTriangle, Info, ListOrdered, Plus, Route, X } from "lucide-react";
import { useMemo, useState } from "react";

interface CorridorOrderCardProps {
  corridors: readonly Corridor[];
  /** Every corridor's members; this card narrows to `corridorId`. */
  corridorSignals: readonly CorridorSignal[];
  signals: readonly Signal[];
  corridorId: string;
  onCorridorChange: (corridorId: string) => void;
  labelMode: PinLabelMode;
  onLabelModeChange: (mode: PinLabelMode) => void;
  hoveredSignalId: string | null;
  onHover: (signalId: string | null) => void;
  readOnly: boolean;
  /** Called after a write so the store can reload from storage. */
  onChanged: () => void;
  /** Everything stored, so adding a signal can see what it already has. */
  coordination: CoordinationRows;
  /** GTSS signals, phases, approaches and timings to build new rows from. */
  gtss: GtssBuildData;
  /** Open the New corridor dialog. */
  onNewCorridor?: () => void;
  /** What the last add, remove or build did. Kept by the page so a new corridor can report too. */
  notice: CorridorNotice | null;
  onNotice: (notice: CorridorNotice | null) => void;
}

export interface CorridorNotice {
  tone: "info" | "error";
  lines: string[];
}

const LABEL_OPTIONS: { value: PinLabelMode; label: string; hint: string }[] = [
  { value: "sequence", label: "#", hint: "Label pins with their order in the corridor" },
  { value: "signalId", label: "ID", hint: "Label pins with the signal ID" },
  { value: "both", label: "# + ID", hint: "Label pins with both" },
];

/**
 * A corridor on a map beside its stops in order. The list is where order is
 * edited; the map is where you check the result, and it redraws as you go.
 */
export default function CorridorOrderCard({
  corridors,
  corridorSignals,
  signals,
  corridorId,
  onCorridorChange,
  labelMode,
  onLabelModeChange,
  hoveredSignalId,
  onHover,
  readOnly,
  onChanged,
  coordination,
  gtss,
  onNewCorridor,
  notice,
  onNotice,
}: CorridorOrderCardProps) {
  // Remounts the "add a signal" select so it goes back to its placeholder.
  const [pickerKey, setPickerKey] = useState(0);
  const members = useMemo(
    () => corridorSignals.filter((cs) => cs.corridorId === corridorId),
    [corridorSignals, corridorId],
  );

  const unplacedIds = useMemo(() => {
    const placed = new Set(
      signals.filter((s) => s.latitude != null && s.longitude != null).map((s) => s.signalId),
    );
    return new Set(members.filter((cs) => !placed.has(cs.signalId)).map((cs) => cs.signalId));
  }, [members, signals]);

  // After deletes or a hand-edited file the numbers can skip or repeat. Any
  // move renumbers, but there should be a way to say "just tidy it".
  const needsRenumber = useMemo(
    () => sortBySequence(members).some((cs, i) => cs.sequence !== i + 1),
    [members],
  );

  const move = (from: number, to: number) => {
    if (moveCorridorSignal(corridorId, from, to)) onChanged();
  };

  // GTSS signals that could join: everything not already in the corridor.
  const candidates = useMemo(() => {
    const inCorridor = new Set(members.map((m) => m.signalId));
    return signals
      .filter((s) => !inCorridor.has(s.signalId))
      .sort((a, b) => naturalCompare(a.signalId, b.signalId));
  }, [signals, members]);

  // "SIG-100 — Lake Ave & Colorado Bl": each street once, without directions.
  const pickerLabel = (s: Signal) => {
    const streets = intersectionStreetNames(s, gtss.approaches);
    return streets.length ? `${s.signalId} \u2014 ${streets.join(" & ")}` : s.signalId;
  };

  const streetsOf = (signalId: string) => {
    const s = signals.find((x) => x.signalId === signalId);
    return s ? intersectionStreetNames(s, gtss.approaches).join(" / ") : "";
  };

  const add = (signalId: string) => {
    const result = planAddSignal(coordination, corridorId, signalId, gtss);
    if (result.error) {
      onNotice({ tone: "error", lines: [result.error] });
      return;
    }
    applyBuild(result.rows);
    onChanged();
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const added = [
      result.rows.patternSignals?.length
        ? count(result.rows.patternSignals.length, "pattern row", "pattern rows")
        : "",
      result.rows.splits?.length ? count(result.rows.splits.length, "split", "splits") : "",
      result.rows.phaseSequence?.length ? "a ring-barrier sequence" : "",
    ].filter(Boolean);
    const list =
      added.length < 2
        ? added.join("")
        : `${added.slice(0, -1).join(", ")} and ${added[added.length - 1]}`;
    onNotice({
      tone: "info",
      lines: [
        `Added ${signalId} to ${corridorId}${list ? `, with ${list} built from GTSS` : ""}.`,
        ...result.notes,
      ],
    });
  };

  const removeAt = (position: number) => {
    const signalId = sortBySequence(members)[position]?.signalId;
    if (!signalId || !removeCorridorSignal(corridorId, position)) return;
    onChanged();
    onNotice({
      tone: "info",
      lines: [
        `Removed ${signalId} from ${corridorId}. Its offsets and splits are kept, so adding it back restores them.`,
      ],
    });
  };

  return (
    <Card>
      <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-grey-800">
            <Route className="h-4 w-4 text-primary-600" />
            Corridor
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-grey-500">Pin label</span>
              <ToggleGroup
                type="single"
                value={labelMode}
                // Radix reports "" when the active item is clicked again; a map
                // with no label mode isn't a state worth having.
                onValueChange={(v) => v && onLabelModeChange(v as PinLabelMode)}
                aria-label="Pin label"
                variant="outline"
                className="gap-0"
              >
                {LABEL_OPTIONS.map((o) => (
                  <ToggleGroupItem
                    key={o.value}
                    value={o.value}
                    title={o.hint}
                    aria-label={o.hint}
                    className={SEGMENT_ITEM_CLASS}
                  >
                    {o.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {!readOnly && onNewCorridor && (
              <Button variant="outline" onClick={onNewCorridor} className="h-7 px-2 text-xs">
                <Plus className="mr-1 h-3 w-3" />
                New corridor
              </Button>
            )}
            {corridors.length > 1 && (
              <Select value={corridorId} onValueChange={onCorridorChange}>
                <SelectTrigger className="h-7 w-56 text-xs" aria-label="Corridor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {corridors.map((c) => (
                    <SelectItem key={c.corridorId} value={c.corridorId} className="text-xs">
                      {c.corridorId}
                      {c.name ? ` — ${c.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <CorridorsMap
            corridorSignals={members}
            signals={signals}
            labelMode={labelMode}
            highlightedSignalId={hoveredSignalId}
            onSignalHover={onHover}
            candidates={readOnly ? [] : candidates}
            onCandidateSelect={readOnly ? undefined : add}
            className="h-[380px] w-full"
          />
          <div className="flex max-h-[380px] flex-col rounded-lg border border-grey-200">
            <div className="flex items-center justify-between gap-2 border-b border-grey-200 bg-grey-50 px-2 py-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-grey-700">
                <ListOrdered className="h-3.5 w-3.5" />
                Order
              </span>
              {needsRenumber && !readOnly && (
                <Button
                  variant="outline"
                  onClick={() => move(0, 0)}
                  title="Numbers skip or repeat. Renumber the corridor 1 to N, keeping the current order."
                  className="h-6 px-2 text-[11px]"
                >
                  Renumber 1&ndash;{members.length}
                </Button>
              )}
            </div>
            <SortableStopList
              members={members}
              unplacedIds={unplacedIds}
              readOnly={readOnly}
              hoveredSignalId={hoveredSignalId}
              onHover={onHover}
              onMove={move}
              onRemove={readOnly ? undefined : removeAt}
              streetsOf={streetsOf}
              className="min-h-0 flex-1 overflow-y-auto"
            />
            {!readOnly && (
              <div className="border-t border-grey-200 p-1.5">
                <Select
                  key={pickerKey}
                  onValueChange={(id) => {
                    add(id);
                    setPickerKey((k) => k + 1);
                  }}
                >
                  <SelectTrigger className="h-7 text-xs" aria-label="Add a signal to the corridor">
                    <SelectValue
                      placeholder={
                        candidates.length > 0
                          ? "Add a signal\u2026"
                          : "Every GTSS signal is already in it"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((s) => (
                      <SelectItem key={s.signalId} value={s.signalId} className="text-xs">
                        {pickerLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!readOnly && (
              <p className="border-t border-grey-200 bg-grey-50 px-2 py-1.5 text-[11px] text-grey-500">
                Drag a stop, or use the arrows, to reorder. Click a grey pin on the map, or pick one
                above, to add a signal. The map and the time&ndash;space diagram follow along.
              </p>
            )}
          </div>
        </div>
        {notice && (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={`mt-3 flex items-start gap-2 rounded border px-3 py-2 text-xs ${
              notice.tone === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-blue-200 bg-blue-50 text-blue-900"
            }`}
          >
            {notice.tone === "error" ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <ul className="min-w-0 flex-1 space-y-0.5">
              {notice.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <Button
              variant="ghost"
              onClick={() => onNotice(null)}
              aria-label="Dismiss"
              className="h-5 w-5 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
