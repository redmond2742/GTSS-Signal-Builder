import type { CorridorSignal, PatternSignal, Split } from "gtss";
import type { Signal } from "gtss/schema";

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
  /** Travel speed in metres per second. */
  speedMps: number;
  isMetric: boolean;
  /** Draw the band for this signal in the highlight colour. */
  highlightedSignalId?: string | null;
}

const WIDTH = 760;
const HEIGHT = 340;
const PAD_LEFT = 74;
const PAD_RIGHT = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 34;
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

/**
 * Distance against time, with each signal's coordinated green drawn where the
 * offset puts it. The point is the progression band: if the greens line up
 * along a vehicle's path, a platoon clears the corridor without stopping, and
 * if one is out of step it shows as a red block straddling the trajectory.
 */
export default function TimeSpaceDiagram({
  stops,
  cycleLengthS,
  showTrajectories,
  speedMps,
  isMetric,
  highlightedSignalId,
}: TimeSpaceDiagramProps) {
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

  // Widen the window until a whole traversal fits, or a trajectory leaves the
  // right edge before reaching the far signal and the band it is supposed to
  // demonstrate can't be read. A long corridor at a short cycle needs several.
  const cyclesShown = Math.min(MAX_CYCLES, Math.max(MIN_CYCLES, Math.ceil(travelTime / cycle) + 1));
  const totalTime = cycle * cyclesShown;

  const xOf = (t: number) => PAD_LEFT + (t / totalTime) * plotW;
  // Distance increases upward, matching how a corridor is normally drawn.
  const yOf = (d: number) => PAD_TOP + plotH - (d / maxDist) * plotH;

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

  // Trajectories are anchored to the first coordinated signal's green: one at
  // each edge of it, plus the middle. If the corridor is in step they stay on
  // green all the way up; if not, one of them crosses a red block.
  const anchor = stops.find((s) => !s.free && s.greenS > 0);
  const trajectories: number[] = [];
  if (anchor && showTrajectories) {
    const start = ((anchor.offsetS % cycle) + cycle) % cycle;
    for (let k = 0; k <= cyclesShown; k++) {
      const base = start + k * cycle;
      trajectories.push(base, base + anchor.greenS / 2, base + anchor.greenS);
    }
  }

  return (
    <div className="overflow-x-auto p-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Time-space diagram over ${cyclesShown} cycles of ${cycle} seconds`}
      >
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

        {/* One row per signal: red the whole cycle, green laid over it. */}
        {stops.map((stop) => {
          const y = yOf(stop.distanceM);
          const highlighted = highlightedSignalId === stop.signalId;
          return (
            <g key={stop.signalId}>
              <text x={4} y={y + 3} fontSize={10} fill={highlighted ? "#be185d" : "#374151"}>
                {stop.signalId}
              </text>
              <text x={4} y={y + 13} fontSize={8} fill="#9ca3af">
                {distanceLabel(stop.distanceM)}
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
                      stroke={highlighted ? "#ec4899" : "#22c55e"}
                      strokeWidth={7}
                    />
                  ))}
                </>
              )}
            </g>
          );
        })}

        {/* Vehicle paths: slope is speed, so a steeper line is a slower vehicle. */}
        {showTrajectories &&
          trajectories.map((t0, i) => {
            const x1 = xOf(t0);
            const x2 = xOf(t0 + travelTime);
            if (x1 > PAD_LEFT + plotW) return null;
            return (
              <line
                key={`traj-${i}`}
                x1={x1}
                y1={yOf(0)}
                x2={x2}
                y2={yOf(maxDist)}
                stroke="#1d4ed8"
                strokeWidth={1.25}
                opacity={0.75}
                strokeDasharray={i % 3 === 1 ? undefined : "3 3"}
              />
            );
          })}
      </svg>
    </div>
  );
}
