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
import { moveCorridorSignal, sortBySequence, type Corridor, type CorridorSignal } from "gtss";
import type { Signal } from "gtss/schema";
import { ListOrdered, Route } from "lucide-react";
import { useMemo } from "react";

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
}: CorridorOrderCardProps) {
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
              className="min-h-0 flex-1 overflow-y-auto"
            />
            {!readOnly && (
              <p className="border-t border-grey-200 bg-grey-50 px-2 py-1.5 text-[11px] text-grey-500">
                Drag a stop, or use the arrows, to reorder. The map and the time&ndash;space diagram
                follow the new order.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
