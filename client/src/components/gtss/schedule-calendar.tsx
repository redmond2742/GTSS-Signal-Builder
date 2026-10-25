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
  alignDaySchedule,
  dayTypesFor,
  DAY_MINUTES,
  formatClock,
  isFreePattern,
  type AlignedSegment,
  type CoordinationRows,
  type DayAlignment,
  type Pattern,
  type SignalPatternState,
} from "gtss";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

interface ScheduleCalendarProps {
  coordination: CoordinationRows;
  corridorId: string;
  onCorridorChange: (corridorId: string) => void;
}

type Mode = "week" | "signals";

const PX_PER_HOUR = 26;
const BODY_HEIGHT = 24 * PX_PER_HOUR;
const AXIS_WIDTH = 48;
const MIN_LANE_WIDTH = 76;
/** Shortest block that has room for a line of text, and for two. */
const LABEL_MIN_PX = 15;
const SUBLABEL_MIN_PX = 34;
const HOVER_SNAP_MIN = 5;

/** Readable under white text. Assigned to coordinated patterns in a fixed order. */
const PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#0d9488",
  "#db2777",
  "#ea580c",
  "#4d7c0f",
  "#0891b2",
  "#a16207",
];

const hatch = (stripe: string, ground: string): CSSProperties => ({
  backgroundColor: ground,
  backgroundImage: `repeating-linear-gradient(135deg, ${stripe} 0 2px, transparent 2px 7px)`,
});

/** The whole corridor free: neutral grey. Nothing here needs attention. */
const FREE_STYLE: CSSProperties = { ...hatch("#cbd5e1", "#f1f5f9"), color: "#64748b" };
/** One signal free while the pattern is coordinated: amber. This is the "does not line up". */
const FREE_SIGNAL_STYLE: CSSProperties = {
  ...hatch("#fcd34d", "#fffbeb"),
  color: "#92400e",
  boxShadow: "inset 0 0 0 1px #f59e0b",
};
const MISSING_STYLE: CSSProperties = {
  backgroundColor: "#fff",
  color: "#b91c1c",
  boxShadow: "inset 0 0 0 1px #ef4444",
};
const UNKNOWN_STYLE: CSSProperties = { ...hatch("#fca5a5", "#fef2f2"), color: "#b91c1c" };
const GAP_STYLE: CSSProperties = {
  backgroundColor: "#fff",
  color: "#b91c1c",
  boxShadow: "inset 0 0 0 1px #fca5a5",
};

interface CellView {
  style: CSSProperties;
  label?: ReactNode;
  sub?: ReactNode;
  title: string;
  /** Small marker pinned to the top-right corner. */
  badge?: ReactNode;
}

const shortPattern = (patternId: string, corridorId: string) =>
  patternId.startsWith(`${corridorId}-`) ? patternId.slice(corridorId.length + 1) : patternId;

const range = (startMin: number, endMin: number) =>
  `${formatClock(startMin)}–${formatClock(endMin)}`;

/** Fixed hour grid behind every lane, drawn over the blocks so it reads across them. */
const HOUR_LINES: CSSProperties = {
  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PX_PER_HOUR - 1}px, rgba(0,0,0,0.10) ${PX_PER_HOUR - 1}px, rgba(0,0,0,0.10) ${PX_PER_HOUR}px)`,
};

/** One column of time: a block per segment, positioned by clock time. */
function Lane({
  segments,
  view,
}: {
  segments: readonly AlignedSegment[];
  view: (segment: AlignedSegment) => CellView;
}) {
  return (
    <div className="relative" style={{ height: BODY_HEIGHT }}>
      {segments.map((seg) => {
        const cell = view(seg);
        const heightPx = ((seg.endMin - seg.startMin) / 60) * PX_PER_HOUR;
        return (
          <div
            key={seg.startMin}
            role="img"
            aria-label={cell.title}
            title={cell.title}
            className="absolute inset-x-0.5 overflow-hidden rounded-sm px-1 text-[10px] leading-tight"
            style={{
              top: `calc(${(seg.startMin / DAY_MINUTES) * 100}% + 1px)`,
              height: `calc(${((seg.endMin - seg.startMin) / DAY_MINUTES) * 100}% - 2px)`,
              ...cell.style,
            }}
          >
            {heightPx >= LABEL_MIN_PX && (
              <div className="truncate pt-0.5 font-semibold">{cell.label}</div>
            )}
            {heightPx >= SUBLABEL_MIN_PX && cell.sub && (
              <div className="truncate opacity-80">{cell.sub}</div>
            )}
            {cell.badge && <div className="absolute right-0.5 top-0.5">{cell.badge}</div>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Schedule.txt as a calendar: hours down the side, one column per day type — or,
 * in "signals" mode, one column per corridor signal for a single day type.
 *
 * Every column is cut from the same segments and shares one vertical time axis,
 * so a horizontal line across the grid is the same clock time for all of them.
 * That is what makes inconsistency visible: a signal whose column differs from
 * its neighbours inside a block is a signal not doing what the corridor does.
 */
export default function ScheduleCalendar({
  coordination,
  corridorId,
  onCorridorChange,
}: ScheduleCalendarProps) {
  const [mode, setMode] = useState<Mode>("week");
  const [dayType, setDayType] = useState("");
  const [hoverMin, setHoverMin] = useState<number | null>(null);

  const days = useMemo(() => dayTypesFor(coordination, corridorId), [coordination, corridorId]);
  const activeDay = days.find((d) => d.dayType === dayType) ?? days[0];

  // Week mode needs every day; signals mode needs one. Both come from the same
  // alignment so the two views can't disagree about what a block is.
  const alignments = useMemo(
    () => days.map((d) => alignDaySchedule(coordination, corridorId, d.dayType)),
    [coordination, corridorId, days],
  );
  const activeAlignment = alignments.find((a) => a.day.dayType === activeDay?.dayType);

  // Patterns of this corridor, coordinated ones coloured in a stable order so a
  // pattern keeps its colour as you switch between views and days.
  const patterns = useMemo(
    () =>
      coordination.patterns
        .filter((p) => p.corridorId == null || p.corridorId === corridorId)
        .sort(
          (a, b) =>
            (a.patternNumber ?? 0) - (b.patternNumber ?? 0) ||
            a.patternId.localeCompare(b.patternId),
        ),
    [coordination.patterns, corridorId],
  );
  const colourOf = useMemo(() => {
    const map = new Map<string, string>();
    patterns
      .filter((p) => !isFreePattern(p))
      .forEach((p, i) => map.set(p.patternId, PALETTE[i % PALETTE.length]));
    return map;
  }, [patterns]);

  const scheduleView = (seg: AlignedSegment): CellView => {
    const times = range(seg.startMin, seg.endMin);
    const note =
      seg.block?.wrap === "head"
        ? ", continues past midnight"
        : seg.block?.wrap === "tail"
          ? ", from the previous evening"
          : "";
    if (!seg.block) {
      return {
        style: GAP_STYLE,
        label: "No pattern",
        sub: times,
        title: `${times}: no pattern scheduled`,
      };
    }
    const id = seg.block.patternId ?? "(blank)";
    const label = shortPattern(id, corridorId);
    const detail = `${seg.block.scheduleId}, priority ${seg.block.priority}`;
    if (!seg.pattern) {
      return {
        style: UNKNOWN_STYLE,
        label,
        sub: times,
        title: `${times}: ${id} is not in Patterns.txt (${detail})${note}`,
      };
    }
    if (isFreePattern(seg.pattern)) {
      return {
        style: FREE_STYLE,
        label: `${label} · free`,
        sub: times,
        title: `${times}: ${id}, free operation (${detail})${note}`,
      };
    }
    return {
      style: { backgroundColor: colourOf.get(id) ?? "#475569", color: "#fff" },
      label,
      sub: `${times} · ${seg.pattern.cycleLengthS}s`,
      title: `${times}: ${id}, ${seg.pattern.cycleLengthS}s cycle (${detail})${note}`,
    };
  };

  const signalView =
    (signalId: string) =>
    (seg: AlignedSegment): CellView => {
      const times = range(seg.startMin, seg.endMin);
      const state = seg.states.get(signalId);
      if (!seg.block || !state) {
        return { style: GAP_STYLE, title: `${signalId}, ${times}: no pattern scheduled` };
      }
      return stateView(signalId, times, seg, state, colourOf);
    };

  const hasData = days.length > 0;
  // The schedule's times are on the corridor's clock.
  const corridor = coordination.corridors.find((c) => c.corridorId === corridorId);
  const clock = [
    corridor?.timezone,
    corridor?.referenceClock ? `${corridor.referenceClock} clock` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Card>
      <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-grey-800">
            <CalendarClock className="h-4 w-4 text-primary-600" />
            Schedule calendar
            {clock && (
              <span
                className="text-xs font-normal text-grey-500"
                title="From the corridor's timezone and reference_clock in corridors.txt"
              >
                {clock}
              </span>
            )}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && setMode(v as Mode)}
              variant="outline"
              aria-label="Calendar layout"
              className="gap-0"
            >
              <ToggleGroupItem
                value="week"
                className={SEGMENT_ITEM_CLASS}
                title="One column per day type"
              >
                Week
              </ToggleGroupItem>
              <ToggleGroupItem
                value="signals"
                className={SEGMENT_ITEM_CLASS}
                title="One column per signal, for one day type, to compare them"
              >
                Compare signals
              </ToggleGroupItem>
            </ToggleGroup>

            {mode === "signals" && activeDay && (
              <Select value={activeDay.dayType} onValueChange={setDayType}>
                <SelectTrigger className="h-7 w-44 text-xs" aria-label="Day type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {days.map((d) => (
                    <SelectItem key={d.dayType} value={d.dayType} className="text-xs">
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {coordination.corridors.length > 1 && (
              <Select value={corridorId} onValueChange={onCorridorChange}>
                <SelectTrigger className="h-7 w-48 text-xs" aria-label="Corridor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {coordination.corridors.map((c) => (
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

      <CardContent className="space-y-3 p-3">
        {!hasData ? (
          <p className="p-4 text-center text-xs text-grey-500">
            This corridor has no schedule rows to draw.
          </p>
        ) : (
          <>
            <Legend
              patterns={patterns}
              colourOf={colourOf}
              corridorId={corridorId}
              compare={mode === "signals"}
            />

            {mode === "week" ? (
              <Grid
                hoverMin={hoverMin}
                onHover={setHoverMin}
                columns={alignments.map((a) => ({
                  key: a.day.dayType,
                  header: <DayHeader alignment={a} />,
                  lane: <Lane segments={a.segments} view={scheduleView} />,
                }))}
              />
            ) : (
              activeAlignment && (
                <>
                  <Grid
                    hoverMin={hoverMin}
                    onHover={setHoverMin}
                    columns={[
                      {
                        key: "__schedule",
                        header: <span className="font-semibold">Schedule</span>,
                        lane: <Lane segments={activeAlignment.segments} view={scheduleView} />,
                        emphasis: true,
                      },
                      ...activeAlignment.signalIds.map((id) => ({
                        key: id,
                        header: (
                          <span className="font-mono" title={id}>
                            {id}
                            {id === activeAlignment.referenceSignalId && (
                              <span className="ml-1 rounded bg-blue-100 px-1 text-[9px] font-semibold text-blue-700">
                                ref
                              </span>
                            )}
                          </span>
                        ),
                        lane: <Lane segments={activeAlignment.segments} view={signalView(id)} />,
                      })),
                    ]}
                  />
                  <Alignment alignment={activeAlignment} corridorId={corridorId} />
                </>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** How one signal looks inside one block. */
function stateView(
  signalId: string,
  times: string,
  seg: AlignedSegment,
  state: SignalPatternState,
  colourOf: ReadonlyMap<string, string>,
): CellView {
  const patternId = seg.pattern?.patternId ?? "";
  switch (state.kind) {
    case "coordinated": {
      const offset = state.offsetS == null ? "" : ` · +${state.offsetS}s`;
      return {
        style: { backgroundColor: colourOf.get(patternId) ?? "#475569", color: "#fff" },
        label: `φ${state.phase}`,
        sub: state.offsetS == null ? undefined : `+${state.offsetS}s`,
        badge: state.cycleMismatch ? (
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-amber-950">
            !
          </span>
        ) : undefined,
        title:
          `${signalId}, ${times}: coordinated in ${patternId} on phase ${state.phase}${offset}` +
          (state.cycleMismatch ? `. Its ring splits don't add up to the pattern's cycle.` : ""),
      };
    }
    case "free-pattern":
      return {
        style: FREE_STYLE,
        label: "free",
        title: `${signalId}, ${times}: ${patternId} is free for the whole corridor`,
      };
    case "free-signal":
      return {
        style: FREE_SIGNAL_STYLE,
        label: "free",
        title: `${signalId}, ${times}: runs free while ${patternId} is coordinated, so it does not line up with the rest of the corridor`,
      };
    case "missing":
      return {
        style: MISSING_STYLE,
        label: "no row",
        title: `${signalId}, ${times}: ${patternId} is coordinated but has no PatternSignals row for this signal`,
      };
    case "unknown-pattern":
      return {
        style: UNKNOWN_STYLE,
        label: "?",
        title: `${signalId}, ${times}: pattern is not in Patterns.txt`,
      };
  }
}

interface GridColumn {
  key: string;
  header: ReactNode;
  lane: ReactNode;
  emphasis?: boolean;
}

/**
 * Time axis plus lanes, with a guide line that follows the pointer. The guide is
 * what lines columns up by eye: point at a block edge in one column and read the
 * same clock time off every other.
 */
function Grid({
  columns,
  hoverMin,
  onHover,
}: {
  columns: readonly GridColumn[];
  hoverMin: number | null;
  onHover: (minutes: number | null) => void;
}) {
  const template = `${AXIS_WIDTH}px repeat(${columns.length}, minmax(${MIN_LANE_WIDTH}px, 1fr))`;
  const hours = Array.from({ length: 25 }, (_, h) => h);

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-x-0.5"
        style={{
          gridTemplateColumns: template,
          minWidth: AXIS_WIDTH + columns.length * MIN_LANE_WIDTH,
        }}
      >
        <div />
        {columns.map((c) => (
          <div
            key={`h-${c.key}`}
            className={`truncate px-1 pb-1 text-center text-[11px] text-grey-700 ${c.emphasis ? "border-r border-grey-200" : ""}`}
          >
            {c.header}
          </div>
        ))}

        {/* Time axis */}
        <div className="relative" style={{ height: BODY_HEIGHT }} aria-hidden>
          {hours.map((h) => (
            <div
              key={h}
              className={`absolute right-1 -translate-y-1/2 text-[10px] ${h % 6 === 0 ? "font-semibold text-grey-700" : "text-grey-400"}`}
              style={{ top: h * PX_PER_HOUR }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
          {hoverMin !== null && (
            <div
              className="absolute right-1 z-10 -translate-y-1/2 rounded bg-grey-800 px-1 text-[10px] font-semibold text-white"
              style={{ top: (hoverMin / 60) * PX_PER_HOUR }}
            >
              {formatClock(hoverMin)}
            </div>
          )}
        </div>

        {/* Lanes share one pointer surface so the guide spans all of them. */}
        <div
          className="relative"
          style={{ gridColumn: `2 / span ${columns.length}`, height: BODY_HEIGHT }}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const raw = ((e.clientY - box.top) / BODY_HEIGHT) * DAY_MINUTES;
            const snapped = Math.round(raw / HOVER_SNAP_MIN) * HOVER_SNAP_MIN;
            onHover(Math.min(Math.max(snapped, 0), DAY_MINUTES));
          }}
          onMouseLeave={() => onHover(null)}
        >
          <div
            className="grid h-full gap-x-0.5"
            style={{
              gridTemplateColumns: `repeat(${columns.length}, minmax(${MIN_LANE_WIDTH}px, 1fr))`,
            }}
          >
            {columns.map((c) => (
              <div key={`l-${c.key}`} className={c.emphasis ? "border-r border-grey-200" : ""}>
                {c.lane}
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0" style={HOUR_LINES} />
          {hoverMin !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 border-t border-grey-800"
              style={{ top: (hoverMin / 60) * PX_PER_HOUR }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DayHeader({ alignment }: { alignment: DayAlignment }) {
  const problems = alignment.segments.reduce((n, s) => n + s.notes.length, 0);
  const { day } = alignment;
  return (
    <span
      title={
        problems > 0
          ? `${day.label}: ${problems} thing${problems === 1 ? "" : "s"} to check. Use Compare signals to see which.`
          : day.label
      }
    >
      <span className="font-semibold">{day.short}</span>
      {day.kind === "special" && (
        <span className="ml-1 rounded bg-grey-100 px-1 text-[9px] text-grey-600">special</span>
      )}
      {problems > 0 && (
        <AlertTriangle
          aria-label={`${problems} thing${problems === 1 ? "" : "s"} to check`}
          className="ml-1 inline h-3 w-3 text-amber-600"
        />
      )}
    </span>
  );
}

function Legend({
  patterns,
  colourOf,
  corridorId,
  compare,
}: {
  patterns: readonly Pattern[];
  colourOf: ReadonlyMap<string, string>;
  corridorId: string;
  compare: boolean;
}) {
  const chip = (style: CSSProperties, text: string, key: string) => (
    <span key={key} className="flex items-center gap-1 text-[11px] text-grey-700">
      <span className="inline-block h-3 w-4 rounded-sm" style={style} />
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {patterns
        .filter((p) => colourOf.has(p.patternId))
        .map((p) =>
          chip(
            { backgroundColor: colourOf.get(p.patternId) },
            `${shortPattern(p.patternId, corridorId)} · ${p.cycleLengthS}s`,
            p.patternId,
          ),
        )}
      {chip(FREE_STYLE, "Free", "free")}
      {compare && chip(FREE_SIGNAL_STYLE, "Signal free in a coordinated pattern", "free-signal")}
      {compare && chip(MISSING_STYLE, "No PatternSignals row", "missing")}
      {compare && (
        <span className="flex items-center gap-1 text-[11px] text-grey-700">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-amber-950">
            !
          </span>
          Splits don&rsquo;t add up to the cycle
        </span>
      )}
    </div>
  );
}

/** The same findings as the grid, in words, so nothing depends on spotting a colour. */
function Alignment({ alignment, corridorId }: { alignment: DayAlignment; corridorId: string }) {
  const flagged = alignment.segments.filter((s) => s.notes.length > 0);
  const total = alignment.segments.length;

  return (
    <div className="rounded-lg border border-grey-200">
      <div className="flex items-center gap-2 border-b border-grey-200 bg-grey-50 px-3 py-1.5 text-xs font-medium text-grey-700">
        {flagged.length === 0 ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        )}
        {flagged.length === 0
          ? `All ${alignment.signalIds.length} signals line up in every ${alignment.day.label} block`
          : `${flagged.length} of ${total} ${alignment.day.label} blocks have signals that don't line up`}
      </div>
      {alignment.unplaceable.length > 0 && (
        <p className="border-b border-grey-100 px-3 py-1.5 text-xs text-red-700">
          Not drawn (unreadable times): {alignment.unplaceable.join(", ")}
        </p>
      )}
      {flagged.length > 0 && (
        <ul className="divide-y divide-grey-100">
          {flagged.map((seg) => (
            <li key={seg.startMin} className="px-3 py-1.5 text-xs">
              <span className="font-mono font-semibold text-grey-800">
                {range(seg.startMin, seg.endMin)}
              </span>
              <span className="ml-2 text-grey-500">
                {seg.block?.patternId
                  ? shortPattern(seg.block.patternId, corridorId)
                  : "no pattern"}
              </span>
              <ul className="mt-0.5 list-disc pl-5 text-grey-700">
                {seg.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
