import { Button } from "@/components/ui/button";
import { sortBySequence, type CorridorSignal } from "gtss";
import { ChevronDown, ChevronUp, GripVertical, MapPinOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface SortableStopListProps {
  members: readonly CorridorSignal[];
  /** Signals in the corridor that have no coordinates, so no pin on the map. */
  unplacedIds: ReadonlySet<string>;
  readOnly: boolean;
  hoveredSignalId: string | null;
  onHover: (signalId: string | null) => void;
  /** Positions in travel order, 0-based. */
  onMove: (from: number, to: number) => void;
  /** Take the stop at this position out of the corridor. Omit to hide the button. */
  onRemove?: (position: number) => void;
  /** Street names for a signal, shown small beside its id. */
  streetsOf?: (signalId: string) => string;
  className?: string;
}

/** Which of a row's two buttons to put focus back on after a keyboard move. */
type Direction = "up" | "down";

/**
 * A corridor's stops in travel order, rearrangeable by drag and drop.
 *
 * Native HTML5 drag and drop rather than a library: it's one list on a
 * desktop-only page, and the thing a library would really add — keyboard and
 * touch — is covered here by the ↑/↓ buttons, which are the accessible path.
 * Drag alone isn't reachable without a pointer.
 *
 * Rows are keyed by POSITION, not signal. A move changes who sits at each
 * position, and keeping the DOM nodes still is what lets the focus handoff
 * below be deterministic; keyed by signal, React would shuffle the nodes and
 * the browser would drop focus from the one that moved.
 */
export default function SortableStopList({
  members,
  unplacedIds,
  readOnly,
  hoveredSignalId,
  onHover,
  onMove,
  onRemove,
  streetsOf,
  className,
}: SortableStopListProps) {
  const ordered = sortBySequence(members);
  const listRef = useRef<HTMLOListElement>(null);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  // The insertion gap, 0..N: gap g is the line above row g, and N is the line
  // below the last row. Finer than "the row you're over", and it can express
  // "after the last one".
  const [gap, setGap] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<{ index: number; direction: Direction } | null>(null);

  // Hand focus to the moved stop once the new order has rendered.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-pos="${pending.index}"]`);
    const preferred = row?.querySelector<HTMLButtonElement>(`[data-move="${pending.direction}"]`);
    const fallback = row?.querySelector<HTMLButtonElement>(
      `[data-move="${pending.direction === "up" ? "down" : "up"}"]`,
    );
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
  }, [ordered]);

  const reset = () => {
    setDragFrom(null);
    setGap(null);
  };

  const move = (from: number, to: number, via: "drag" | Direction) => {
    if (readOnly || from === to) return;
    const signalId = ordered[from]?.signalId;
    if (via !== "drag") pendingFocus.current = { index: to, direction: via };
    onMove(from, to);
    setAnnouncement(`Moved ${signalId} to position ${to + 1} of ${ordered.length}`);
  };

  const commitDrop = () => {
    if (dragFrom !== null && gap !== null) {
      // Removing the dragged row shifts everything below it up by one.
      move(dragFrom, gap > dragFrom ? gap - 1 : gap, "drag");
    }
    reset();
  };

  if (ordered.length === 0) {
    return <p className="p-3 text-xs text-grey-500">This corridor has no signals.</p>;
  }

  return (
    <div className={className}>
      <ol ref={listRef} className="divide-y divide-grey-100" aria-label="Corridor stops in order">
        {ordered.map((cs, index) => {
          const highlighted = hoveredSignalId === cs.signalId;
          const dragging = dragFrom === index;
          const markerAbove = gap === index && dragFrom !== null;
          const markerBelow = gap === ordered.length && index === ordered.length - 1;
          return (
            <li
              key={index}
              data-pos={index}
              draggable={!readOnly}
              onDragStart={(e) => {
                setDragFrom(index);
                e.dataTransfer.effectAllowed = "move";
                // Firefox won't start a drag without data on the transfer.
                e.dataTransfer.setData("text/plain", cs.signalId);
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const box = e.currentTarget.getBoundingClientRect();
                setGap(index + (e.clientY > box.top + box.height / 2 ? 1 : 0));
              }}
              onDrop={(e) => {
                e.preventDefault();
                commitDrop();
              }}
              onDragEnd={reset}
              onMouseEnter={() => onHover(cs.signalId)}
              onMouseLeave={() => onHover(null)}
              className={[
                "flex items-center gap-1.5 px-1.5 py-1 text-xs",
                highlighted ? "bg-pink-50" : "bg-white",
                dragging ? "opacity-40" : "",
                markerAbove ? "shadow-[inset_0_2px_0_0_#2563eb]" : "",
                markerBelow ? "shadow-[inset_0_-2px_0_0_#2563eb]" : "",
                readOnly ? "" : "cursor-grab active:cursor-grabbing",
              ].join(" ")}
            >
              {!readOnly && (
                <GripVertical aria-hidden className="h-3.5 w-3.5 shrink-0 text-grey-300" />
              )}

              <span
                className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1 font-mono text-[10px] font-semibold text-white"
                title={
                  cs.sequence === index + 1
                    ? undefined
                    : `sequence ${cs.sequence ?? "blank"} in the file`
                }
              >
                {cs.sequence ?? "?"}
              </span>

              <span className="min-w-0 flex-1 truncate font-medium text-grey-800">
                {cs.signalId}
                {cs.direction && (
                  <span className="ml-1.5 font-normal text-grey-400">{cs.direction}</span>
                )}
                {streetsOf?.(cs.signalId) && (
                  <span className="block truncate text-[10px] font-normal text-grey-500">
                    {streetsOf(cs.signalId)}
                  </span>
                )}
              </span>

              {unplacedIds.has(cs.signalId) && (
                <MapPinOff
                  aria-label="No coordinates, so not drawn on the map"
                  className="h-3 w-3 shrink-0 text-amber-600"
                />
              )}

              {!readOnly && (
                <span className="flex shrink-0">
                  <Button
                    variant="ghost"
                    data-move="up"
                    disabled={index === 0}
                    onClick={() => move(index, index - 1, "up")}
                    aria-label={`Move ${cs.signalId} up, from position ${index + 1}`}
                    className="h-5 w-5 p-0"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    data-move="down"
                    disabled={index === ordered.length - 1}
                    onClick={() => move(index, index + 1, "down")}
                    aria-label={`Move ${cs.signalId} down, from position ${index + 1}`}
                    className="h-5 w-5 p-0"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  {onRemove && (
                    <Button
                      variant="ghost"
                      onClick={() => onRemove(index)}
                      aria-label={`Remove ${cs.signalId} from the corridor`}
                      title="Remove from the corridor. Its offsets and splits are kept, so adding it back restores them."
                      className="h-5 w-5 p-0 text-grey-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Drag has no spoken equivalent; say where the stop ended up. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
