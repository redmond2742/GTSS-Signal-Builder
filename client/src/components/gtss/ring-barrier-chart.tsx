import type { PhaseSequenceEntry, Split } from "gtss";
import { phaseColors } from "gtss-diagram";

interface RingBarrierChartProps {
  /** Splits for ONE pattern and ONE signal. */
  splits: readonly Split[];
  /** That signal's ring/barrier structure (per-signal, not per-pattern). */
  phaseSequence: readonly PhaseSequenceEntry[];
  /** The pattern's cycle length. 0 or null means free — no bar is drawn. */
  cycleLengthS: number | null;
  signalId: string;
  patternId: string;
}

interface Segment {
  phaseId: number;
  seconds: number;
  barrierId: string | null;
  position: number;
}

const CHART_WIDTH = 560;
const LABEL_WIDTH = 46;
const ROW_HEIGHT = 30;
const BAR_HEIGHT = 20;

/**
 * A signal's green splits laid out along one cycle, grouped by ring.
 *
 * The reason this exists: a ring's splits should sum to the pattern's cycle
 * length, and in converted timing sheets they frequently don't — the source
 * split table was built at a different native cycle. In a flat table that is
 * invisible; here the bar overruns the cycle marker and the Σ readout says so.
 */
export default function RingBarrierChart({
  splits,
  phaseSequence,
  cycleLengthS,
  signalId,
  patternId,
}: RingBarrierChartProps) {
  const cycle = cycleLengthS ?? 0;

  // Ring and ordering come from PhaseSequence; seconds come from Splits.
  const structure = new Map<number, { ring: number; position: number; barrierId: string | null }>();
  phaseSequence.forEach((seq) => {
    if (seq.phaseId == null || seq.ring == null) return;
    structure.set(seq.phaseId, {
      ring: seq.ring,
      position: seq.position ?? 0,
      barrierId: seq.barrierId,
    });
  });

  const rings = new Map<number, Segment[]>();
  const unplaced: number[] = [];
  splits.forEach((split) => {
    if (split.phaseId == null || split.splitS == null) return;
    const meta = structure.get(split.phaseId);
    if (!meta) {
      unplaced.push(split.phaseId);
      return;
    }
    const list = rings.get(meta.ring) ?? [];
    list.push({
      phaseId: split.phaseId,
      seconds: split.splitS,
      barrierId: meta.barrierId,
      position: meta.position,
    });
    rings.set(meta.ring, list);
  });

  const ringEntries = Array.from(rings.entries()).sort((a, b) => a[0] - b[0]);
  ringEntries.forEach(([, segs]) => segs.sort((a, b) => a.position - b.position));

  if (ringEntries.length === 0) {
    return (
      <p className="p-3 text-xs text-grey-500">
        {splits.length === 0
          ? `No splits recorded for ${signalId} in ${patternId}.`
          : `No PhaseSequence rows for ${signalId}, so its splits can't be placed in a ring.`}
      </p>
    );
  }

  // Scale to whichever is longer — the cycle or the longest ring — so an
  // overrun is visible rather than clipped at the edge.
  const ringTotals = ringEntries.map(([, segs]) => segs.reduce((n, s) => n + s.seconds, 0));
  const span = Math.max(cycle, ...ringTotals, 1);
  const chartArea = CHART_WIDTH - LABEL_WIDTH - 50;
  const scale = chartArea / span;

  const height = ringEntries.length * ROW_HEIGHT + 34;
  const cycleX = LABEL_WIDTH + cycle * scale;

  return (
    <div className="overflow-x-auto p-2">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Ring and barrier splits for signal ${signalId} in pattern ${patternId}`}
      >
        {ringEntries.map(([ring, segs], rowIndex) => {
          const y = rowIndex * ROW_HEIGHT + 6;
          const total = ringTotals[rowIndex];
          const matches = cycle > 0 && total === cycle;
          let x = LABEL_WIDTH;

          return (
            <g key={ring}>
              <text x={0} y={y + BAR_HEIGHT / 2 + 4} fontSize={11} fill="#6b7280">
                R{ring}
              </text>

              {segs.map((seg, i) => {
                const w = Math.max(seg.seconds * scale, 0);
                const segX = x;
                x += w;
                const prev = segs[i - 1];
                // A barrier is where the concurrency group changes.
                const barrierHere = prev && prev.barrierId !== seg.barrierId;
                return (
                  <g key={`${seg.phaseId}-${i}`}>
                    {barrierHere && (
                      <line
                        x1={segX}
                        y1={y - 3}
                        x2={segX}
                        y2={y + BAR_HEIGHT + 3}
                        stroke="#374151"
                        strokeWidth={2}
                      />
                    )}
                    <rect
                      x={segX}
                      y={y}
                      width={w}
                      height={BAR_HEIGHT}
                      fill={phaseColors[seg.phaseId] ?? "#9ca3af"}
                      stroke="#ffffff"
                      strokeWidth={1}
                      rx={2}
                    />
                    {w > 26 && (
                      <text
                        x={segX + w / 2}
                        y={y + BAR_HEIGHT / 2 + 4}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#ffffff"
                        fontWeight={600}
                      >
                        φ{seg.phaseId} {seg.seconds}
                      </text>
                    )}
                  </g>
                );
              })}

              <text
                x={LABEL_WIDTH + chartArea + 6}
                y={y + BAR_HEIGHT / 2 + 4}
                fontSize={10}
                fontWeight={600}
                fill={matches ? "#15803d" : "#b45309"}
              >
                {total}s{cycle > 0 && !matches ? ` ≠ ${cycle}` : matches ? " ✓" : ""}
              </text>
            </g>
          );
        })}

        {/* Where the cycle actually ends. A ring that overruns it crosses this line. */}
        {cycle > 0 && (
          <>
            <line
              x1={cycleX}
              y1={2}
              x2={cycleX}
              y2={ringEntries.length * ROW_HEIGHT + 6}
              stroke="#dc2626"
              strokeDasharray="3 3"
              strokeWidth={1.5}
            />
            <text
              x={cycleX}
              y={ringEntries.length * ROW_HEIGHT + 20}
              textAnchor="middle"
              fontSize={10}
              fill="#dc2626"
            >
              cycle {cycle}s
            </text>
          </>
        )}
      </svg>

      {unplaced.length > 0 && (
        <p className="mt-1 text-[11px] text-amber-700">
          Phase{unplaced.length === 1 ? "" : "s"} {Array.from(new Set(unplaced)).join(", ")} not
          shown — no PhaseSequence row, so the ring is unknown.
        </p>
      )}
    </div>
  );
}
