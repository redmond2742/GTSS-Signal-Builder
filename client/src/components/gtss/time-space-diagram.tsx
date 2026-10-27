import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  approachMetres,
  approachSpeedFor,
  cumulativeTravel,
  directionBearing,
  intersectionStreetNames,
  leftPhaseFor,
  nemaSameDirectionLeft,
  OFFSET_REFERENCES,
  offsetReferenceFor,
  opposingPhaseNumber,
  opposingWindow,
  phaseWindow,
  progressionBand,
  progressionPhases,
  resolveCorridorSpeeds,
  reverseDirection,
  simplifyPolyline,
  simulateTrajectories,
  sortBySequence,
  splitStartShift,
  throughPhaseFor,
  type CorridorSignal,
  type OffsetReference,
  type OffsetReferenceSource,
  type OpposingWindow,
  type Pattern,
  type PatternSignal,
  type PhaseSequenceEntry,
  type PhaseWindow,
  type ProgressionBand,
  type SpeedSource,
  type Split,
  type TrajectoryDirection,
  type TrajectoryMode,
} from "gtss";
import type { Approach, BasicTiming, Phase, Signal } from "gtss/schema";
import {
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/**
 * A phase that also lets a direction's traffic through the signal, as marked in
 * PhaseSequence.txt's progression column: a left turn the route takes, or any
 * other phase (an overlap) the movement continues on.
 */
export type ProgressionWindow = PhaseWindow & { kind: "left turn" | "overlap" };

/** What the return direction gets at a signal, beyond its green window. */
export type OpposingStop = OpposingWindow & {
  /** Other phases the return direction progresses on here. */
  extraGreens: ProgressionWindow[];
  /** Speed arriving here from the signal after this one, m/s. */
  approachSpeedMps: number;
  speedSource: SpeedSource;
  /** That direction's protected left turn, where it can be placed. */
  leftTurn: PhaseWindow | null;
};

export interface TimeSpaceStop {
  signalId: string;
  sequence: number;
  /** "Main St / 1st Ave", for the label. Empty if GTSS has no names. */
  streets: string;
  /** Metres from the first signal in the corridor. */
  distanceM: number;
  /**
   * Seconds after the system reference when the coordinated phase's split starts:
   * where its green is drawn from. Equal to the stored offset when offsets are
   * measured to begin of green.
   */
  offsetS: number;
  /**
   * Split start minus the stored offset: 0 for begin of green, minus the green
   * time for begin of yellow. The stored offset is `offsetS - startShiftS`.
   */
  startShiftS: number;
  /** What this signal's stored offset is measured to, and where that was found. */
  offsetReference: OffsetReference;
  offsetReferenceSource: OffsetReferenceSource;
  /** The coordinated phase's yellow plus all-red from GTSS timings; 0 if unknown. */
  clearanceS: number;
  /** Coordinated-phase green duration, in seconds. */
  greenS: number;
  coordinatedPhase: number | null;
  /** Runs free in this pattern: no cycle, so no band to draw. */
  free: boolean;
  /** Speed arriving here from the signal before this one, m/s. */
  approachSpeedMps: number;
  speedSource: SpeedSource;
  /** The same direction's protected left turn, where it can be placed. */
  leftTurn: PhaseWindow | null;
  /** Other phases this direction's traffic progresses on here. Vehicles and the band use them. */
  extraGreens: ProgressionWindow[];
  /**
   * The green the opposite direction gets: its opposing through phase, worked out
   * from the ring-barrier structure where the data allows, else assumed equal to
   * the coordinated one (`basis` says which).
   */
  opposing?: OpposingStop;
}

interface TimeSpaceDiagramProps {
  stops: readonly TimeSpaceStop[];
  cycleLengthS: number;
  showTrajectories: boolean;
  /** Also draw traffic running the other way, against each signal's opposing green. */
  showOpposite: boolean;
  /**
   * How vehicles are drawn. "stop-at-red" simulates them slowing, queueing and
   * moving off; "green-wave" draws only free-flow lines between signals reached
   * on green.
   */
  trajectoryMode: TrajectoryMode;
  /** Speed used where GTSS has no posted speed for a stretch, m/s. */
  defaultSpeedMps: number;
  isMetric: boolean;
  /** The corridor's direction ("SB") and its reverse ("NB"), for labels. */
  directions?: { forward: string | null; opposite: string | null };
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

const WIDTH = 860;
const HEIGHT = 372;
/** Room on the left for each signal's id, offset, street names and distance. */
const PAD_LEFT = 156;
const PAD_RIGHT = 14;
/** Room above the first row for the column headers. */
const PAD_TOP = 26;
const PAD_BOTTOM = 34;
/** Vehicle paths: through (never stopped) and stopped at least once. */
const THROUGH_COLOUR = "#1d4ed8";
const STOPPED_COLOUR = "#ea580c";
/** Traffic running the other way: a lighter blue, so it reads apart from the outbound lines. */
const OPPOSITE_COLOUR = "#0ea5e9";
/** Paths are simplified to within this many pixels before drawing. */
const SIMPLIFY_PX = 0.4;
/** Arrow-key nudge, in seconds, and with Shift held. */
const KEY_STEP_S = 1;
const KEY_STEP_BIG_S = 5;
/** Tallest and shortest the drag target on a signal's row may be, in drawing units. */
const HIT_MAX = 22;
const HIT_MIN = 12;
/** Street names longer than this are cut short; the full text is in the tooltip. */
const STREETS_MAX_CHARS = 28;
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
const MPS_PER_MPH = 0.44704;
const MPS_PER_KMH = 1 / 3.6;

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

export interface BuildStopsInput {
  corridorSignals: readonly CorridorSignal[];
  signals: readonly Signal[];
  /** PatternSignals for the pattern being drawn. */
  patternSignals: readonly PatternSignal[];
  /** Splits for the pattern being drawn. */
  splits: readonly Split[];
  /** For the opposite direction's green and the left turns. */
  phaseSequence?: readonly PhaseSequenceEntry[];
  /** The pattern being drawn, for its offset reference. */
  pattern?: Pattern;
  /** GTSS timings: the coordinated phase's yellow and all-red place a begin-of-yellow offset. */
  basicTimings?: readonly BasicTiming[];
  /** GTSS phases and approaches, for speeds, left turns and street names. */
  phases?: readonly Phase[];
  approaches?: readonly Approach[];
  /** Used for a stretch with no posted speed in either direction, m/s. */
  defaultSpeedMps: number;
  /** Whether a signal's posted speeds are km/h rather than mph. */
  isMetricFor?: (signalId: string) => boolean;
}

/**
 * Build the per-signal geometry a time-space diagram needs.
 *
 * Distance comes from the signals' coordinates walked in corridor sequence order;
 * the green band from the coordinated phase's split; speeds from the posted speed
 * on the approach each direction's through phase serves; left turns and the
 * return direction's green from the ring-barrier structure.
 */
export function buildStops(input: BuildStopsInput): TimeSpaceStop[] {
  const gtss = { phases: input.phases ?? [], approaches: input.approaches ?? [] };
  const phaseSequence = input.phaseSequence ?? [];
  const isMetricFor = input.isMetricFor ?? (() => false);
  const byId = new Map(input.signals.map((s) => [s.signalId, s]));

  let cumulative = 0;
  let prev: Signal | null = null;
  const drafts: {
    base: Omit<TimeSpaceStop, "approachSpeedMps" | "speedSource" | "opposing">;
    opposing:
      | (OpposingWindow & { leftTurn: PhaseWindow | null; extraGreens: ProgressionWindow[] })
      | undefined;
    raw: { forward: number | null; opposite: number | null };
  }[] = [];

  sortBySequence(input.corridorSignals).forEach((cs, index) => {
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

    const signalId = cs.signalId;
    const ps = input.patternSignals.find((p) => p.signalId === signalId);
    const coordinatedPhase = ps?.coordinatedPhase ?? null;
    const greenS =
      coordinatedPhase == null
        ? 0
        : (input.splits.find((s) => s.signalId === signalId && s.phaseId === coordinatedPhase)
            ?.splitS ?? 0);
    // Draw from the start of the split, whichever point the stored offset names.
    const reference = offsetReferenceFor(ps, input.pattern);
    const clearance = input.basicTimings?.find(
      (t) => t.signalId === signalId && t.phase === coordinatedPhase,
    );
    const clearanceS = (clearance?.yellow ?? 0) + (clearance?.allRed ?? 0);
    const startShiftS =
      coordinatedPhase == null ? 0 : splitStartShift(reference.reference, greenS, clearanceS);
    const offsetS = (ps?.offsetS ?? 0) + startShiftS;

    const timing =
      ps && coordinatedPhase !== null
        ? {
            patternId: ps.patternId,
            signalId,
            coordinatedPhase,
            offsetS,
            greenS,
            patternSignals: input.patternSignals,
            phaseSequence,
            splits: input.splits,
          }
        : null;
    const opposing = timing ? opposingWindow(timing) : undefined;

    // The phase each direction's traffic runs on here: the coordinated phase and
    // its opposite, or for a signal running free, the through phase on the
    // approach heading each way.
    const bearing = directionBearing(cs.direction);
    const outPhase =
      coordinatedPhase ?? (bearing === null ? null : throughPhaseFor(signalId, bearing, gtss));
    const backPhase =
      (coordinatedPhase === null ? null : opposingPhaseNumber(coordinatedPhase)) ??
      (bearing === null ? null : throughPhaseFor(signalId, (bearing + 180) % 360, gtss));

    const toMps = (posted: number | null) =>
      posted === null ? null : posted * (isMetricFor(signalId) ? MPS_PER_KMH : MPS_PER_MPH);

    // The left that runs with a through phase: from GTSS's approach links where
    // it has them, else the standard dual-ring pairing.
    const leftWindow = (through: number | null) => {
      if (!timing || through === null) return null;
      const left = leftPhaseFor(signalId, through, gtss) ?? nemaSameDirectionLeft(through);
      return left === null ? null : phaseWindow(timing, left);
    };

    const streets = intersectionStreetNames(signal, gtss.approaches).join(" / ");

    // Phases marked as carrying each direction through, besides its own green.
    const kindOf = (phase: number): ProgressionWindow["kind"] =>
      /left/i.test(
        gtss.phases.find((p) => p.signalId === signalId && p.phase === phase)?.movementType ?? "",
      )
        ? "left turn"
        : "overlap";
    const progressionFor = (direction: string | null, own: number | null): ProgressionWindow[] =>
      !timing
        ? []
        : progressionPhases(phaseSequence, signalId, direction)
            .filter((phase) => phase !== own)
            .flatMap((phase) => {
              const w =
                phase === coordinatedPhase
                  ? { phase, offsetS, greenS }
                  : phaseWindow(timing, phase, { acrossBarriers: true });
              return w ? [{ ...w, kind: kindOf(phase) }] : [];
            });

    drafts.push({
      base: {
        signalId,
        sequence: cs.sequence ?? index + 1,
        streets,
        distanceM: cumulative,
        offsetS,
        startShiftS,
        offsetReference: reference.reference,
        offsetReferenceSource: reference.source,
        clearanceS,
        greenS,
        coordinatedPhase,
        // A blank coordinated phase is how the files say "this signal runs free".
        free: coordinatedPhase == null,
        leftTurn: leftWindow(coordinatedPhase),
        extraGreens: progressionFor(cs.direction, coordinatedPhase),
      },
      opposing: opposing && {
        ...opposing,
        leftTurn: leftWindow(backPhase),
        extraGreens: progressionFor(
          reverseDirection(cs.direction),
          opposing.partnerPhase ?? backPhase,
        ),
      },
      raw: {
        forward: outPhase === null ? null : toMps(approachSpeedFor(signalId, outPhase, gtss)),
        opposite: backPhase === null ? null : toMps(approachSpeedFor(signalId, backPhase, gtss)),
      },
    });
  });

  const speeds = resolveCorridorSpeeds(
    drafts.map((d) => d.raw),
    input.defaultSpeedMps,
  );
  return drafts.map((d, i) => ({
    ...d.base,
    approachSpeedMps: speeds.forward[i].mps,
    speedSource: speeds.forward[i].source,
    opposing: d.opposing && {
      ...d.opposing,
      approachSpeedMps: speeds.opposite[i].mps,
      speedSource: speeds.opposite[i].source,
    },
  }));
}

/** "+76s", "-5s": offsets are signed, so say which way. */
const formatOffset = (offsetS: number) =>
  `${offsetS >= 0 ? "+" : "−"}${Math.abs(Math.round(offsetS * 10) / 10)}s`;

const OFFSET_LABEL = Object.fromEntries(OFFSET_REFERENCES.map((r) => [r.value, r.label])) as Record<
  OffsetReference,
  string
>;

/** Short forms for the column header. */
const REFERENCE_SHORT: Record<OffsetReference, string> = {
  BegGreen: "BEG GRN",
  BegYellow: "BEG YEL",
};

const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

interface TrajectoriesProps {
  stops: readonly TimeSpaceStop[];
  cycleS: number;
  speedMps: number;
  mode: TrajectoryMode;
  /** Also run traffic the other way. */
  showOpposite: boolean;
  totalTime: number;
  plotW: number;
  plotH: number;
  /** The distances at the bottom and top edges of the plot. */
  minDist: number;
  topDist: number;
  clipId: string;
}

/** How a path is drawn, bottom to top: inbound first, so outbound stays readable over it. */
const LAYERS = [
  { direction: "opposite", stopped: true },
  { direction: "opposite", stopped: false },
  { direction: "forward", stopped: true },
  { direction: "forward", stopped: false },
] as const;

const styleOf = (direction: TrajectoryDirection, stopped: boolean) =>
  direction === "opposite"
    ? { colour: OPPOSITE_COLOUR, opacity: stopped ? 0.45 : 0.8 }
    : { colour: stopped ? STOPPED_COLOUR : THROUGH_COLOUR, opacity: stopped ? 0.5 : 0.7 };

/**
 * The vehicle paths. A component of their own because the simulation is the one
 * expensive thing here: it re-runs only when the timing, speeds or mode change,
 * not on every hover over the signal list.
 */
function Trajectories({
  stops,
  cycleS,
  speedMps,
  mode,
  showOpposite,
  totalTime,
  plotW,
  plotH,
  minDist,
  topDist,
  clipId,
}: TrajectoriesProps) {
  const paths = useMemo(() => {
    const xOf = (t: number) => PAD_LEFT + (t / totalTime) * plotW;
    const yOf = (d: number) => PAD_TOP + plotH - ((d - minDist) / (topDist - minDist)) * plotH;

    const draw = (direction: TrajectoryDirection) =>
      simulateTrajectories(stops, {
        cycleS,
        speedMps,
        fromS: 0,
        toS: totalTime,
        mode,
        direction,
      }).map((line) => {
        const px = simplifyPolyline(
          line.points.map(([t, x]) => [xOf(t), yOf(x)] as [number, number]),
          SIMPLIFY_PX,
        );
        return {
          direction,
          stopped: line.stopped,
          d: px
            .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
            .join(""),
        };
      });

    return [...draw("forward"), ...(showOpposite ? draw("opposite") : [])];
  }, [stops, cycleS, speedMps, mode, showOpposite, totalTime, plotW, plotH, minDist, topDist]);

  return (
    <g
      clipPath={`url(#${clipId})`}
      fill="none"
      strokeLinejoin="round"
      // Drawn over the bars; the drag targets underneath must still get the pointer.
      pointerEvents="none"
    >
      {LAYERS.flatMap((layer) => {
        const { colour, opacity } = styleOf(layer.direction, layer.stopped);
        return paths
          .filter((p) => p.direction === layer.direction && p.stopped === layer.stopped)
          .map((path, i) => (
            <path
              key={`${layer.direction}-${layer.stopped}-${i}`}
              d={path.d}
              stroke={colour}
              strokeWidth={1}
              opacity={opacity}
            />
          ));
      })}
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
  showOpposite,
  trajectoryMode,
  defaultSpeedMps,
  isMetric,
  directions,
  highlightedSignalId,
  editable = false,
  onOffsetChange,
}: TimeSpaceDiagramProps) {
  const clipId = useId();
  const hatchId = `${clipId}-hatch`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // "none", "all", or "i" for the stretch from stop i to stop i+1.
  const [bandKey, setBandKey] = useState("all");

  // While dragging, the bar follows the pointer using a copy of the stops with
  // the one offset replaced. Nothing is written until release.
  const liveStops = useMemo(
    () =>
      drag
        ? stops.map((s) => {
            if (s.signalId !== drag.signalId) return s;
            const shift = drag.offsetS - s.offsetS;
            const moved = (w: PhaseWindow | null) => w && { ...w, offsetS: w.offsetS + shift };
            const movedAll = (ws: ProgressionWindow[]) =>
              ws.map((w) => ({ ...w, offsetS: w.offsetS + shift }));
            return {
              ...s,
              offsetS: drag.offsetS,
              leftTurn: moved(s.leftTurn),
              extraGreens: movedAll(s.extraGreens),
              // Everything else at the signal keeps its place relative to the
              // coordinated green: the timing plan moves as one.
              opposing: s.opposing && {
                ...s.opposing,
                offsetS: s.opposing.offsetS + shift,
                leftTurn: moved(s.opposing.leftTurn),
                extraGreens: movedAll(s.opposing.extraGreens),
              },
            };
          })
        : stops,
    [stops, drag],
  );
  // The bars track the pointer every frame; the vehicle simulation is the heavy
  // part and may trail by a frame or two rather than make the drag stutter.
  const deferredStops = useDeferredValue(liveStops);
  const cycle = cycleLengthS;
  // One header for the column when every coordinated signal agrees.
  const coordinatedRefs = new Set(stops.filter((s) => !s.free).map((s) => s.offsetReference));
  const sharedReference: OffsetReference | null =
    coordinatedRefs.size === 1
      ? Array.from(coordinatedRefs)[0]
      : coordinatedRefs.size === 0
        ? "BegGreen"
        : null;
  const referenceLabel = (stop: TimeSpaceStop) =>
    `${OFFSET_LABEL[stop.offsetReference].toLowerCase()}${
      stop.offsetReferenceSource === "default" ? " (assumed: the files don't say)" : ""
    }`;
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  // Bandwidth for the chosen stretch, both ways. Worked out from the live stops so
  // it follows a drag as it happens.
  const pairs = stops.length - 1;
  const bandFrom =
    bandKey === "none" ? -1 : bandKey === "all" || Number(bandKey) >= pairs ? 0 : Number(bandKey);
  const bandTo =
    bandKey === "none"
      ? -1
      : bandKey === "all" || Number(bandKey) >= pairs
        ? stops.length - 1
        : Number(bandKey) + 1;
  const bands = useMemo(() => {
    if (bandFrom < 0 || cycle <= 0 || liveStops.length === 0) return null;
    const of = (direction: TrajectoryDirection) =>
      progressionBand(liveStops, {
        cycleS: cycle,
        speedMps: defaultSpeedMps,
        direction,
        fromIndex: bandFrom,
        toIndex: bandTo,
      });
    return { forward: of("forward"), opposite: showOpposite ? of("opposite") : null };
  }, [liveStops, cycle, defaultSpeedMps, showOpposite, bandFrom, bandTo]);

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
  const travel = cumulativeTravel(liveStops, defaultSpeedMps);
  const travelTime = travel[travel.length - 1] ?? 0;

  // Room below the first signal, where outbound traffic queues, and above the last,
  // where the return direction does. Always reserved, so the rows don't shift when
  // the paths are switched on and off.
  const approach = approachMetres(maxDist);
  const minDist = -approach;
  const topDist = maxDist + approach;

  // Widen the window until a whole traversal fits, or a vehicle leaves the
  // right edge before reaching the far signal and the band it is supposed to
  // demonstrate can't be read. A long corridor at a short cycle needs several.
  const cyclesShown = Math.min(MAX_CYCLES, Math.max(MIN_CYCLES, Math.ceil(travelTime / cycle) + 1));
  const totalTime = cycle * cyclesShown;

  const xOf = (t: number) => PAD_LEFT + (t / totalTime) * plotW;
  // Distance increases upward, matching how a corridor is normally drawn.
  const yOf = (d: number) => PAD_TOP + plotH - ((d - minDist) / (topDist - minDist)) * plotH;

  const distanceLabel = (m: number) =>
    isMetric ? `${Math.round(m)} m` : `${Math.round(m / METRES_PER_FOOT)} ft`;
  const speedUnit = isMetric ? "km/h" : "mph";
  const showSpeed = (mps: number) => Math.round(mps / (isMetric ? MPS_PER_KMH : MPS_PER_MPH));

  // A window repeats every cycle; draw each repetition that lands in view.
  const spansOf = (offsetS: number, greenS: number): [number, number][] => {
    if (greenS <= 0) return [];
    const spans: [number, number][] = [];
    const start = ((offsetS % cycle) + cycle) % cycle;
    for (let k = -1; k <= cyclesShown; k++) {
      const from = start + k * cycle;
      const to = from + Math.min(greenS, cycle);
      if (to > 0 && from < totalTime) spans.push([Math.max(from, 0), Math.min(to, totalTime)]);
    }
    return spans;
  };
  const greenSpans = (stop: TimeSpaceStop) => (stop.free ? [] : spansOf(stop.offsetS, stop.greenS));

  // Signals whose opposing green could not be worked out from the data.
  const assumedAt = stops
    .filter((s) => !s.free && s.opposing?.basis === "assumed")
    .map((s) => s.signalId);
  // Stretches whose speed GTSS didn't give, in either direction.
  const defaultedSpeeds = stops.some(
    (s, i) =>
      (i > 0 && s.speedSource === "default") ||
      (showOpposite && i < stops.length - 1 && s.opposing?.speedSource === "default"),
  );
  const hasLeftTurns = stops.some((s) => s.leftTurn || s.opposing?.leftTurn);

  /** Diagram seconds under a pointer position. */
  const timeAt = (clientX: number): number | null => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    const unit = ((clientX - box.left) / box.width) * WIDTH;
    return ((unit - PAD_LEFT) / plotW) * totalTime;
  };

  /** The offset as the file has it, from where the bar is drawn. */
  const stored = (stop: TimeSpaceStop) => stop.offsetS - stop.startShiftS;

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
      // The bar is the split; the file holds the offset its reference names.
      onOffsetChange?.(stop.signalId, wrap(drag.offsetS - stop.startShiftS), { coalesce: false });
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
    onOffsetChange?.(stop.signalId, wrap(stored(stop) + direction * step), { coalesce: true });
  };

  // Drag targets can't be taller than the gap between rows or they would overlap.
  const rowYs = liveStops.map((s) => yOf(s.distanceM)).sort((a, b) => a - b);
  const smallestGap = rowYs.reduce(
    (least, y, i) => (i === 0 ? least : Math.min(least, y - rowYs[i - 1])),
    HIT_MAX,
  );
  const hitHeight = Math.max(HIT_MIN, Math.min(HIT_MAX, smallestGap));

  /** A progression band as polygons: one per cycle in view. */
  const bandPolygons = (band: ProgressionBand | null) => {
    if (!band || band.widthS <= 0 || band.path.length < 2) return [];
    const polys: string[] = [];
    for (let k = -cyclesShown; k <= cyclesShown + 1; k++) {
      const depart = band.departS + k * cycle;
      const lower = band.path.map((p) => `${xOf(depart + p.afterS)},${yOf(p.distanceM)}`);
      const upper = band.path
        .map((p) => `${xOf(depart + band.widthS + p.afterS)},${yOf(p.distanceM)}`)
        .reverse();
      polys.push([...lower, ...upper].join(" "));
    }
    return polys;
  };

  const forwardName = directions?.forward ?? "Outbound";
  const oppositeName = directions?.opposite ?? "Return";
  const bandValue = (band: ProgressionBand | null | undefined) =>
    band === null || band === undefined ? "n/a" : `${Math.round(band.widthS)} s`;

  return (
    <div className="overflow-x-auto p-2">
      {/* Bandwidth: the widest green that lines up through the chosen stretch. */}
      <div className="flex flex-wrap items-center gap-2 px-1 pb-1 text-xs text-grey-600">
        <span>Bandwidth</span>
        <Select value={bandKey} onValueChange={setBandKey}>
          <SelectTrigger className="h-7 w-56 text-xs" aria-label="Bandwidth between signals">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs">
              Off
            </SelectItem>
            <SelectItem value="all" className="text-xs">
              Whole corridor ({stops[0].signalId} &rarr; {stops[stops.length - 1].signalId})
            </SelectItem>
            {stops.slice(0, -1).map((s, i) => (
              <SelectItem key={s.signalId} value={String(i)} className="text-xs">
                {s.signalId} &rarr; {stops[i + 1].signalId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {bands && (
          <span aria-live="polite" className="flex flex-wrap items-center gap-3">
            <span className="font-semibold" style={{ color: THROUGH_COLOUR }}>
              {forwardName} {bandValue(bands.forward)}
            </span>
            {showOpposite && (
              <span className="font-semibold" style={{ color: OPPOSITE_COLOUR }}>
                {oppositeName} {bandValue(bands.opposite)}
              </span>
            )}
            <span className="text-grey-400">of a {cycle}s cycle</span>
          </span>
        )}
      </div>

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
          {/* 45° hash marks for left-turn phases. */}
          <pattern
            id={hatchId}
            width={4}
            height={4}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1={0} y1={0} x2={0} y2={4} stroke="#1f2937" strokeWidth={1.4} opacity={0.75} />
          </pattern>
        </defs>

        {/* Column headers for the left-hand labels. */}
        <text x={4} y={14} fontSize={8} fontWeight={600} fill="#9ca3af">
          SIGNAL
        </text>
        <text x={PAD_LEFT - 8} y={14} textAnchor="end" fontSize={8} fontWeight={600} fill="#9ca3af">
          <title>
            {sharedReference
              ? `Offsets are measured to ${OFFSET_LABEL[sharedReference].toLowerCase()} of the coordinated phase`
              : "Signals measure their offsets to different points; hover an offset to see which"}
          </title>
          OFFSET · {sharedReference ? REFERENCE_SHORT[sharedReference] : "MIXED"}
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

        {/* Progression bands, under everything that sits on the rows. */}
        <g clipPath={`url(#${clipId})`} pointerEvents="none">
          {bandPolygons(bands?.forward ?? null).map((points, i) => (
            <polygon
              key={`bf-${i}`}
              points={points}
              fill={THROUGH_COLOUR}
              fillOpacity={0.1}
              stroke={THROUGH_COLOUR}
              strokeOpacity={0.5}
              strokeDasharray="4 3"
            />
          ))}
          {showOpposite &&
            bandPolygons(bands?.opposite ?? null).map((points, i) => (
              <polygon
                key={`bo-${i}`}
                points={points}
                fill={OPPOSITE_COLOUR}
                fillOpacity={0.12}
                stroke={OPPOSITE_COLOUR}
                strokeOpacity={0.6}
                strokeDasharray="4 3"
              />
            ))}
        </g>

        {/* One row per signal: red the whole cycle, green laid over it. */}
        {liveStops.map((stop) => {
          const y = yOf(stop.distanceM);
          const highlighted = highlightedSignalId === stop.signalId;
          const dragged = drag?.signalId === stop.signalId;
          return (
            <g key={stop.signalId}>
              <text x={4} y={y + 2} fontSize={10} fill={highlighted ? "#be185d" : "#374151"}>
                {stop.signalId}
              </text>
              <text
                x={PAD_LEFT - 8}
                y={y + 2}
                textAnchor="end"
                fontSize={10}
                fontWeight={600}
                fill={stop.free ? "#9ca3af" : dragged ? "#ea580c" : "#1d4ed8"}
              >
                <title>
                  {stop.free
                    ? `${stop.signalId} runs free`
                    : `Offset ${formatOffset(stored(stop))}, measured to ${referenceLabel(stop)}`}
                </title>
                {stop.free ? "free" : formatOffset(stored(stop))}
              </text>
              {stop.streets && (
                <text x={4} y={y + 11} fontSize={7} fill="#6b7280">
                  <title>{stop.streets}</title>
                  {truncate(stop.streets, STREETS_MAX_CHARS)}
                </text>
              )}
              <text
                x={PAD_LEFT - 8}
                y={y + 11}
                textAnchor="end"
                fontSize={7}
                fill={dragged ? "#ea580c" : "#9ca3af"}
              >
                {dragged && drag
                  ? `was ${formatOffset(drag.originOffset - stop.startShiftS)}`
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
                  {/* Other phases this direction progresses on: dashed green. */}
                  {stop.extraGreens.flatMap((w) =>
                    spansOf(w.offsetS, w.greenS).map(([from, to], i) => (
                      <line
                        key={`pg-${w.phase}-${i}`}
                        x1={xOf(from)}
                        y1={y}
                        x2={xOf(to)}
                        y2={y}
                        stroke="#15803d"
                        strokeWidth={7}
                        strokeDasharray="5 2"
                      >
                        <title>{`${stop.signalId}: traffic also goes through on φ${w.phase} (${w.kind}), ${w.greenS}s`}</title>
                      </line>
                    )),
                  )}
                  {/* A tick where the offset is measured to: the start of green, or of yellow. */}
                  {Array.from({ length: cyclesShown + 1 }, (_, k) => {
                    const at = (((stored(stop) % cycle) + cycle) % cycle) + k * cycle;
                    return at > totalTime ? null : (
                      <line
                        key={`ref-${k}`}
                        x1={xOf(at)}
                        y1={y - 8}
                        x2={xOf(at)}
                        y2={y - 4}
                        stroke="#1f2937"
                        strokeWidth={1.5}
                      >
                        <title>{`Offset point: ${referenceLabel(stop)}`}</title>
                      </line>
                    );
                  })}
                  {/* The same direction's left turn, hatched. Over green it runs
                      alongside the through movement; over red, while it waits. */}
                  {stop.leftTurn &&
                    spansOf(stop.leftTurn.offsetS, stop.leftTurn.greenS).map(([from, to], i) => (
                      <rect
                        key={`lt-${i}`}
                        x={xOf(from)}
                        y={y - 3.5}
                        width={Math.max(xOf(to) - xOf(from), 0)}
                        height={7}
                        fill={`url(#${hatchId})`}
                      >
                        <title>{`${stop.signalId}: left turn, phase ${stop.leftTurn?.phase}`}</title>
                      </rect>
                    ))}
                  {/* Where the green was before the drag, so you can see how far it has moved. */}
                  {dragged &&
                    drag &&
                    spansOf(drag.originOffset, stop.greenS).map(([from, to], i) => (
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
                  {/* The opposite direction's green, as a thin strip under the bar. */}
                  {showTrajectories && showOpposite && stop.opposing && (
                    <g>
                      <title>
                        {stop.opposing.basis === "ring-barrier"
                          ? `${stop.signalId}, returning traffic: phase ${stop.opposing.partnerPhase} is green from ${stop.opposing.offsetS}s for ${stop.opposing.greenS}s`
                          : `${stop.signalId}, returning traffic: no opposing phase data, so drawn with the same green as the coordinated phase`}
                      </title>
                      <line
                        x1={PAD_LEFT}
                        y1={y + 6.5}
                        x2={PAD_LEFT + plotW}
                        y2={y + 6.5}
                        stroke="#fca5a5"
                        strokeWidth={4}
                        strokeDasharray={stop.opposing.basis === "assumed" ? "2 2" : undefined}
                      />
                      {spansOf(stop.opposing.offsetS, stop.opposing.greenS).map(([from, to], i) => (
                        <line
                          key={`opp-${i}`}
                          x1={xOf(from)}
                          y1={y + 6.5}
                          x2={xOf(to)}
                          y2={y + 6.5}
                          stroke="#4ade80"
                          strokeWidth={4}
                          strokeDasharray={stop.opposing?.basis === "assumed" ? "2 2" : undefined}
                        />
                      ))}
                      {stop.opposing.extraGreens.flatMap((w) =>
                        spansOf(w.offsetS, w.greenS).map(([from, to], i) => (
                          <line
                            key={`opg-${w.phase}-${i}`}
                            x1={xOf(from)}
                            y1={y + 6.5}
                            x2={xOf(to)}
                            y2={y + 6.5}
                            stroke="#15803d"
                            strokeWidth={4}
                            strokeDasharray="4 2"
                          >
                            <title>{`${stop.signalId}, returning traffic: also goes through on φ${w.phase} (${w.kind}), ${w.greenS}s`}</title>
                          </line>
                        )),
                      )}
                      {stop.opposing.leftTurn &&
                        spansOf(stop.opposing.leftTurn.offsetS, stop.opposing.leftTurn.greenS).map(
                          ([from, to], i) => (
                            <rect
                              key={`olt-${i}`}
                              x={xOf(from)}
                              y={y + 4.5}
                              width={Math.max(xOf(to) - xOf(from), 0)}
                              height={4}
                              fill={`url(#${hatchId})`}
                            />
                          ),
                        )}
                    </g>
                  )}
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
            speedMps={defaultSpeedMps}
            mode={trajectoryMode}
            showOpposite={showOpposite}
            totalTime={totalTime}
            plotW={plotW}
            plotH={plotH}
            minDist={minDist}
            topDist={topDist}
            clipId={clipId}
          />
        )}

        {/* Each stretch's speed, at the right edge between its two signals.
            A * marks a speed GTSS doesn't have, so the default stands in. */}
        <g fontSize={7} fill="#6b7280" stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
          {liveStops.slice(1).map((stop, i) => {
            const before = liveStops[i];
            const y = (yOf(before.distanceM) + yOf(stop.distanceM)) / 2 + 2.5;
            const out = `${showSpeed(stop.approachSpeedMps)}${stop.speedSource === "default" ? "*" : ""}`;
            const back = before.opposing
              ? `${showSpeed(before.opposing.approachSpeedMps)}${before.opposing.speedSource === "default" ? "*" : ""}`
              : null;
            const label =
              showOpposite && back !== null && back !== out
                ? `↑${out} ↓${back} ${speedUnit}`
                : `${out} ${speedUnit}`;
            return (
              <text key={`spd-${stop.signalId}`} x={PAD_LEFT + plotW - 3} y={y} textAnchor="end">
                <title>
                  {`${before.signalId} → ${stop.signalId}: ${showSpeed(stop.approachSpeedMps)} ${speedUnit} (${stop.speedSource})` +
                    (before.opposing
                      ? `; ${stop.signalId} → ${before.signalId}: ${showSpeed(before.opposing.approachSpeedMps)} ${speedUnit} (${before.opposing.speedSource})`
                      : "")}
                </title>
                {label}
              </text>
            );
          })}
        </g>

        {/* Where each direction's queue forms. Above the paths, with a halo, so they stay readable. */}
        {showTrajectories && (
          <g fontSize={8} fill="#6b7280" stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
            <text x={PAD_LEFT + 4} y={PAD_TOP + plotH - 4}>
              approach to first signal
            </text>
            {showOpposite && (
              <text x={PAD_LEFT + 4} y={PAD_TOP + 10}>
                approach to last signal, returning
              </text>
            )}
          </g>
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
                  aria-valuenow={stored(stop)}
                  aria-valuetext={`${stored(stop)} seconds, measured to ${referenceLabel(stop)}`}
                  onPointerDown={(e) => beginDrag(e, stop)}
                  onPointerMove={(e) => moveDrag(e, stop)}
                  onPointerUp={(e) => endDrag(e, stop)}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(e) => keyNudge(e, stop)}
                />
              );
            })}
      </svg>

      <div className="space-y-1 px-1 pt-1 text-[11px] text-grey-500">
        {showTrajectories && (
          <p>
            {trajectoryMode === "stop-at-red" ? (
              <>
                Rising paths run first signal to last:{" "}
                <span style={{ color: THROUGH_COLOUR }}>blue</span> vehicles pass every signal
                without stopping, <span style={{ color: STOPPED_COLOUR }}>orange</span> ones stop at
                least once. Vehicles slow for a red, queue behind the one in front and move off at
                green; flat stretches are stopped. Signals running free are not obeyed.
              </>
            ) : (
              <>
                Free-flow paths, drawn only between signals they reach on green. A path that would
                meet a red is not drawn across it.
              </>
            )}
          </p>
        )}
        {showTrajectories && showOpposite && (
          <p>
            Falling paths in <span style={{ color: OPPOSITE_COLOUR }}>sky blue</span> run last
            signal to first
            {trajectoryMode === "stop-at-red" ? ", paler where the vehicle stops" : ""}. They follow
            each signal&rsquo;s opposing through phase, the thin strip under its bar
            {assumedAt.length > 0 ? (
              <>
                {" "}
                &mdash; except at {assumedAt.join(", ")}, where there is no ring-barrier data for it
                and the coordinated green is used instead (dotted strip)
              </>
            ) : null}
            .
          </p>
        )}
        {hasLeftTurns && (
          <p>
            Hatched: each direction&rsquo;s protected left turn. Where it overlaps the green it runs
            alongside the through movement; over red, it runs while the through waits.
          </p>
        )}
        {stops.some(
          (s) => s.extraGreens.length > 0 || (s.opposing?.extraGreens.length ?? 0) > 0,
        ) && (
          <p>
            Dashed green: a left turn or overlap marked below as carrying the corridor&rsquo;s
            traffic through. Vehicles go through on it, and the bandwidth counts it.
          </p>
        )}
        <p>
          Speeds are each approach&rsquo;s posted speed in GTSS, shown at the right of each stretch
          {defaultedSpeeds
            ? `; * marks a stretch with none set in either direction, where ${showSpeed(defaultSpeedMps)} ${speedUnit} is used`
            : ""}
          .
        </p>
      </div>
    </div>
  );
}
