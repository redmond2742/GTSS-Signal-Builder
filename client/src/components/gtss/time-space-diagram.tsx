import {
  approachMetres,
  simplifyPolyline,
  simulateTrajectories,
  type CorridorSignal,
  type PatternSignal,
  type Split,
  type TrajectoryMode,
} from "gtss";
import type { Signal } from "gtss/schema";
import {
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

export interface TimeSpaceStop {
  signalId: string;
  sequence: number;
  /** Metres from the first signal in the corridor. */
  distanceM: number;
  /** Seconds after the system reference when the coordinated green starts. */
  offsetS: number;
  /** Coordinated-phase green duration, in seconds. */
  greenS: number;
  coordinatedPhase: number | null;
  /** Runs free in this pattern: no cycle, so no band to draw. */
  free: boolean;
}

interface TimeSpaceDiagramProps {
  stops: readonly TimeSpaceStop[];
  cycleLengthS: number;
  showTrajectories: boolean;
  /**
   * How vehicles are drawn. "stop-at-red" simulates them slowing, queueing and
   * moving off; "green-wave" draws only free-flow lines between signals reached
   * on green.
   */
  trajectoryMode: TrajectoryMode;
  /** Free-flow travel speed in metres per second. */
  speedMps: number;
  isMetric: boolean;
  /** Draw the band for this signal in the highlight colour. */
  highlightedSignalId?: string | null;
  /** Allow dragging a signal's green sideways to change its offset. */
  editable?: boolean;
  /**
   * An offset was changed by dragging (once, on release) or with the arrow keys
   * (on each press, flagged `coalesce` so a run of presses undoes as one step).
   */
  onOffsetChange?: (signalId: string, offsetS: number, options: { coalesce: boolean }) => void;
}

const WIDTH = 800;
const HEIGHT = 352;
/** Room on the left for each signal's id, offset and distance. */
const PAD_LEFT = 118;
const PAD_RIGHT = 14;
/** Room above the first row for the column headers. */
const PAD_TOP = 26;
const PAD_BOTTOM = 34;
/** Vehicle paths: through (never stopped) and stopped at least once. */
const THROUGH_COLOUR = "#1d4ed8";
const STOPPED_COLOUR = "#ea580c";
/** Paths are simplified to within this many pixels before drawing. */
const SIMPLIFY_PX = 0.4;
/** Arrow-key nudge, in seconds, and with Shift held. */
const KEY_STEP_S = 1;
const KEY_STEP_BIG_S = 5;
/** Tallest and shortest the drag target on a signal's row may be, in drawing units. */
const HIT_MAX = 22;
const HIT_MIN = 12;
/** What is being dragged, and where it is now. */
interface DragState {
  signalId: string;
  /** The offset when the drag began. */
  originOffset: number;
  /** Where the pointer was, in diagram seconds, when it began. */
  startT: number;
  /** The offset the drag has reached so far. */
  offsetS: number;
}
/** Never fewer than two cycles, so a band that wraps is still readable. */
const MIN_CYCLES = 2;
/** Beyond this the bands get too narrow to read. */
const MAX_CYCLES = 6;

const METRES_PER_FOOT = 0.3048;

/** Great-circle distance between two points, in metres. */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Build the per-signal geometry a time-space diagram needs.
 *
 * Distance comes from the signals' coordinates walked in corridor sequence
 * order; the green band comes from the coordinated phase's split, which is why
 * Splits and PatternSignals both have to be in hand.
 */
export function buildStops(
  corridorSignals: readonly CorridorSignal[],
  signals: readonly Signal[],
  patternSignals: readonly PatternSignal[],
  splits: readonly Split[],
): TimeSpaceStop[] {
  const byId = new Map(signals.map((s) => [s.signalId, s]));
  const ordered = [...corridorSignals].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  let cumulative = 0;
  let prev: Signal | null = null;
  const stops: TimeSpaceStop[] = [];

  ordered.forEach((cs, index) => {
    const signal = byId.get(cs.signalId);
    if (!signal || signal.latitude == null || signal.longitude == null) return;

    if (prev) {
      cumulative += haversineMetres(
        prev.latitude,
        prev.longitude,
        signal.latitude,
        signal.longitude,
      );
    }
    prev = signal;

    const ps = patternSignals.find((p) => p.signalId === cs.signalId);
    const coordinatedPhase = ps?.coordinatedPhase ?? null;
    const green =
      coordinatedPhase == null
        ? 0
        : (splits.find((s) => s.signalId === cs.signalId && s.phaseId === coordinatedPhase)
            ?.splitS ?? 0);

    stops.push({
      signalId: cs.signalId,
      sequence: cs.sequence ?? index + 1,
      distanceM: cumulative,
      offsetS: ps?.offsetS ?? 0,
      greenS: green,
      coordinatedPhase,
      // A blank coordinated phase is how the files say "this signal runs free".
      free: coordinatedPhase == null,
    });
  });

  return stops;
}

/** "+76s", "-5s": offsets are signed, so say which way. */
const formatOffset = (offsetS: number) => `${offsetS >= 0 ? "+" : "\u2212"}${Math.abs(offsetS)}s`;

interface TrajectoriesProps {
  stops: readonly TimeSpaceStop[];
  cycleS: number;
  speedMps: number;
  mode: TrajectoryMode;
  totalTime: number;
  plotW: number;
  plotH: number;
  minDist: number;
  maxDist: number;
  clipId: string;
}

/**
 * The vehicle paths. A component of their own because the simulation is the one
 * expensive thing here: it re-runs only when the timing, speed or mode change,
 * not on every hover over the signal list.
 */
function Trajectories({
  stops,
  cycleS,
  speedMps,
  mode,
  totalTime,
  plotW,
  plotH,
  minDist,
  maxDist,
  clipId,
}: TrajectoriesProps) {
  const paths = useMemo(() => {
    const lines = simulateTrajectories(stops, {
      cycleS,
      speedMps,
      fromS: 0,
      toS: totalTime,
      mode,
    });
    const xOf = (t: number) => PAD_LEFT + (t / totalTime) * plotW;
    const yOf = (d: number) => PAD_TOP + plotH - ((d - minDist) / (maxDist - minDist)) * plotH;
    return lines.map((line) => {
      const px = simplifyPolyline(
        line.points.map(([t, x]) => [xOf(t), yOf(x)] as [number, number]),
        SIMPLIFY_PX,
      );
      return {
        stopped: line.stopped,
        d: px.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(""),
      };
    });
  }, [stops, cycleS, speedMps, mode, totalTime, plotW, plotH, minDist, maxDist]);

  // Vehicles that stopped go underneath, so the ones that made it through stay readable.
  const ordered = [...paths].sort((a, b) => Number(b.stopped) - Number(a.stopped));

  return (
    <g
      clipPath={`url(#${clipId})`}
      fill="none"
      strokeLinejoin="round"
      // Drawn over the bars; the drag targets underneath must still get the pointer.
      pointerEvents="none"
    >
      {ordered.map((path, i) => (
        <path
          key={i}
          d={path.d}
          stroke={path.stopped ? STOPPED_COLOUR : THROUGH_COLOUR}
          strokeWidth={1}
          opacity={path.stopped ? 0.5 : 0.7}
        />
      ))}
    </g>
  );
}

/**
 * Distance against time, with each signal's coordinated green drawn where the
 * offset puts it. The point is the progression band: if the greens line up
 * along a vehicle's path, a platoon clears the corridor without stopping, and
 * if one is out of step vehicles stop and queue at it.
 *
 * Each signal's offset is written on the left beside its id, because the offset
 * is what you are adjusting and the green bars are where it lands.
 */
export default function TimeSpaceDiagram({
  stops,
  cycleLengthS,
  showTrajectories,
  trajectoryMode,
  speedMps,
  isMetric,
  highlightedSignalId,
  editable = false,
  onOffsetChange,
}: TimeSpaceDiagramProps) {
  const clipId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // While dragging, the bar follows the pointer using a copy of the stops with
  // the one offset replaced. Nothing is written until release.
  const liveStops = useMemo(
    () =>
      drag
        ? stops.map((s) => (s.signalId === drag.signalId ? { ...s, offsetS: drag.offsetS } : s))
        : stops,
    [stops, drag],
  );
  // The bars track the pointer every frame; the vehicle simulation is the heavy
  // part and may trail by a frame or two rather than make the drag stutter.
  const deferredStops = useDeferredValue(liveStops);
  const cycle = cycleLengthS;
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  if (stops.length === 0 || cycle <= 0) {
    return (
      <p className="p-4 text-xs text-grey-500">
        {stops.length === 0
          ? "No corridor signals with coordinates to plot."
          : "This pattern runs free (cycle 0), so there is no coordinated band to draw."}
      </p>
    );
  }

  const maxDist = Math.max(...stops.map((s) => s.distanceM), 1);
  const travelTime = maxDist / Math.max(speedMps, 0.1);

  // Room below the first signal, where its queue forms. Always reserved, so the
  // rows don't shift when the paths are switched on and off.
  const minDist = -approachMetres(maxDist);

  // Widen the window until a whole traversal fits, or a vehicle leaves the
  // right edge before reaching the far signal and the band it is supposed to
  // demonstrate can't be read. A long corridor at a short cycle needs several.
  const cyclesShown = Math.min(MAX_CYCLES, Math.max(MIN_CYCLES, Math.ceil(travelTime / cycle) + 1));
  const totalTime = cycle * cyclesShown;

  const xOf = (t: number) => PAD_LEFT + (t / totalTime) * plotW;
  // Distance increases upward, matching how a corridor is normally drawn.
  const yOf = (d: number) => PAD_TOP + plotH - ((d - minDist) / (maxDist - minDist)) * plotH;

  const distanceLabel = (m: number) =>
    isMetric ? `${Math.round(m)} m` : `${Math.round(m / METRES_PER_FOOT)} ft`;

  // Green repeats every cycle; draw each repetition that lands in view.
  const greenSpans = (stop: TimeSpaceStop): [number, number][] => {
    if (stop.free || stop.greenS <= 0) return [];
    const spans: [number, number][] = [];
    const start = ((stop.offsetS % cycle) + cycle) % cycle;
    for (let k = -1; k <= cyclesShown; k++) {
      const from = start + k * cycle;
      const to = from + Math.min(stop.greenS, cycle);
      if (to > 0 && from < totalTime) spans.push([Math.max(from, 0), Math.min(to, totalTime)]);
    }
    return spans;
  };

  /** Diagram seconds under a pointer position. */
  const timeAt = (clientX: number): number | null => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    const unit = ((clientX - box.left) / box.width) * WIDTH;
    return ((unit - PAD_LEFT) / plotW) * totalTime;
  };

  /** Whole seconds, folded into one cycle: green repeats, so 130s in a 114s cycle is 16s. */
  const wrap = (seconds: number) => {
    const whole = Math.round(seconds);
    return ((whole % cycle) + cycle) % cycle;
  };

  const beginDrag = (e: PointerEvent<SVGRectElement>, stop: TimeSpaceStop) => {
    if (e.button !== 0 || !onOffsetChange) return;
    const startT = timeAt(e.clientX);
    if (startT === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    setDrag({ signalId: stop.signalId, originOffset: stop.offsetS, startT, offsetS: stop.offsetS });
  };

  const moveDrag = (e: PointerEvent<SVGRectElement>, stop: TimeSpaceStop) => {
    if (!drag || drag.signalId !== stop.signalId) return;
    const t = timeAt(e.clientX);
    if (t === null) return;
    const moved = Math.round(drag.originOffset + (t - drag.startT));
    // No movement yet: leave the offset exactly as it was, even if it was outside
    // the cycle, rather than quietly "tidying" it on a click.
    const next = moved === Math.round(drag.originOffset) ? drag.originOffset : wrap(moved);
    if (next !== drag.offsetS) setDrag({ ...drag, offsetS: next });
  };

  const endDrag = (e: PointerEvent<SVGRectElement>, stop: TimeSpaceStop) => {
    if (!drag || drag.signalId !== stop.signalId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (drag.offsetS !== drag.originOffset) {
      onOffsetChange?.(stop.signalId, drag.offsetS, { coalesce: false });
    }
    setDrag(null);
  };

  const keyNudge = (e: KeyboardEvent<SVGRectElement>, stop: TimeSpaceStop) => {
    if (e.key === "Escape" && drag) {
      e.preventDefault();
      setDrag(null); // abandon the drag; nothing was written
      return;
    }
    const direction =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : 0;
    if (direction === 0 || drag) return;
    e.preventDefault();
    const step = e.shiftKey ? KEY_STEP_BIG_S : KEY_STEP_S;
    onOffsetChange?.(stop.signalId, wrap(stop.offsetS + direction * step), { coalesce: true });
  };

  // Drag targets can't be taller than the gap between rows or they would overlap.
  const rowYs = liveStops.map((s) => yOf(s.distanceM)).sort((a, b) => a - b);
  const smallestGap = rowYs.reduce(
    (least, y, i) => (i === 0 ? least : Math.min(least, y - rowYs[i - 1])),
    HIT_MAX,
  );
  const hitHeight = Math.max(HIT_MIN, Math.min(HIT_MAX, smallestGap));

  return (
    <div className="overflow-x-auto p-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full select-none"
        role="img"
        aria-label={`Time-space diagram over ${cyclesShown} cycles of ${cycle} seconds`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD_LEFT} y={PAD_TOP - 4} width={plotW} height={plotH + 8} />
          </clipPath>
        </defs>

        {/* Column headers for the left-hand labels. */}
        <text x={4} y={14} fontSize={8} fontWeight={600} fill="#9ca3af">
          SIGNAL
        </text>
        <text x={PAD_LEFT - 8} y={14} textAnchor="end" fontSize={8} fontWeight={600} fill="#9ca3af">
          OFFSET
        </text>

        {/* Cycle boundaries */}
        {Array.from({ length: cyclesShown + 1 }, (_, k) => k * cycle).map((t) => (
          <g key={`c-${t}`}>
            <line
              x1={xOf(t)}
              y1={PAD_TOP}
              x2={xOf(t)}
              y2={PAD_TOP + plotH}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
            <text x={xOf(t)} y={HEIGHT - 16} textAnchor="middle" fontSize={10} fill="#6b7280">
              {t}s
            </text>
          </g>
        ))}
        <text
          x={PAD_LEFT + plotW / 2}
          y={HEIGHT - 3}
          textAnchor="middle"
          fontSize={10}
          fill="#9ca3af"
        >
          time →
        </text>

        {showTrajectories && (
          <text x={PAD_LEFT + 4} y={PAD_TOP + plotH - 4} fontSize={8} fill="#9ca3af">
            approach to first signal
          </text>
        )}

        {/* One row per signal: red the whole cycle, green laid over it. */}
        {liveStops.map((stop) => {
          const y = yOf(stop.distanceM);
          const highlighted = highlightedSignalId === stop.signalId;
          const dragged = drag?.signalId === stop.signalId;
          return (
            <g key={stop.signalId}>
              <text x={4} y={y + 3} fontSize={10} fill={highlighted ? "#be185d" : "#374151"}>
                {stop.signalId}
              </text>
              <text
                x={PAD_LEFT - 8}
                y={y + 3}
                textAnchor="end"
                fontSize={10}
                fontWeight={600}
                fill={stop.free ? "#9ca3af" : dragged ? "#ea580c" : "#1d4ed8"}
              >
                {stop.free ? "free" : formatOffset(stop.offsetS)}
              </text>
              <text x={4} y={y + 13} fontSize={8} fill={dragged ? "#ea580c" : "#9ca3af"}>
                {dragged && drag
                  ? `was ${formatOffset(drag.originOffset)}`
                  : distanceLabel(stop.distanceM)}
              </text>

              {stop.free ? (
                <>
                  <line
                    x1={PAD_LEFT}
                    y1={y}
                    x2={PAD_LEFT + plotW}
                    y2={y}
                    stroke="#d1d5db"
                    strokeWidth={5}
                    strokeDasharray="4 4"
                  />
                  <text x={PAD_LEFT + 4} y={y - 6} fontSize={8} fill="#9ca3af">
                    free
                  </text>
                </>
              ) : (
                <>
                  <line
                    x1={PAD_LEFT}
                    y1={y}
                    x2={PAD_LEFT + plotW}
                    y2={y}
                    stroke="#ef4444"
                    strokeWidth={7}
                    opacity={0.75}
                  />
                  {greenSpans(stop).map(([from, to], i) => (
                    <line
                      key={i}
                      x1={xOf(from)}
                      y1={y}
                      x2={xOf(to)}
                      y2={y}
                      stroke={highlighted || dragged ? "#ec4899" : "#22c55e"}
                      strokeWidth={7}
                    />
                  ))}
                  {/* Where the green was before the drag, so you can see how far it has moved. */}
                  {dragged &&
                    drag &&
                    greenSpans({ ...stop, offsetS: drag.originOffset }).map(([from, to], i) => (
                      <rect
                        key={`ghost-${i}`}
                        x={xOf(from)}
                        y={y - 5}
                        width={Math.max(xOf(to) - xOf(from), 0)}
                        height={10}
                        rx={2}
                        fill="none"
                        stroke="#16a34a"
                        strokeWidth={1}
                        strokeDasharray="3 2"
                      />
                    ))}
                </>
              )}
            </g>
          );
        })}

        {/* Vehicle paths: slope is speed, flat is stopped. Drawn over the bars. */}
        {showTrajectories && (
          <Trajectories
            stops={deferredStops}
            cycleS={cycle}
            speedMps={speedMps}
            mode={trajectoryMode}
            totalTime={totalTime}
            plotW={plotW}
            plotH={plotH}
            minDist={minDist}
            maxDist={maxDist}
            clipId={clipId}
          />
        )}

        {/* Drag targets, one per coordinated signal, above everything else. Each is a
            slider so the keyboard can do what the pointer can. */}
        {editable &&
          liveStops
            .filter((stop) => !stop.free)
            .map((stop) => {
              const y = yOf(stop.distanceM);
              return (
                <rect
                  key={`hit-${stop.signalId}`}
                  x={PAD_LEFT}
                  y={y - hitHeight / 2}
                  width={plotW}
                  height={hitHeight}
                  fill="transparent"
                  className="outline-none focus-visible:stroke-blue-600 focus-visible:stroke-2"
                  style={{
                    cursor: drag?.signalId === stop.signalId ? "grabbing" : "grab",
                    touchAction: "none",
                  }}
                  tabIndex={0}
                  role="slider"
                  aria-label={`${stop.signalId} offset`}
                  aria-orientation="horizontal"
                  aria-valuemin={0}
                  aria-valuemax={Math.max(cycle - 1, 0)}
                  aria-valuenow={stop.offsetS}
                  aria-valuetext={`${stop.offsetS} seconds`}
                  onPointerDown={(e) => beginDrag(e, stop)}
                  onPointerMove={(e) => moveDrag(e, stop)}
                  onPointerUp={(e) => endDrag(e, stop)}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(e) => keyNudge(e, stop)}
                />
              );
            })}
      </svg>

      {showTrajectories && (
        <p className="px-1 pt-1 text-[11px] text-grey-500">
          {trajectoryMode === "stop-at-red" ? (
            <>
              <span style={{ color: THROUGH_COLOUR }}>Blue</span> vehicles pass every signal without
              stopping; <span style={{ color: STOPPED_COLOUR }}>orange</span> ones stop at least
              once. Vehicles slow for a red, queue behind the one in front and move off at green;
              flat stretches are stopped. Signals running free are not obeyed.
            </>
          ) : (
            <>
              Free-flow paths, drawn only between signals they reach on green. A path that would
              meet a red is not drawn across it.
            </>
          )}
        </p>
      )}
    </div>
  );
}
