import type { SequenceDiagram } from "gtss";
import { phaseColors } from "gtss-diagram";

interface PhaseSequenceDiagramProps {
  diagram: SequenceDiagram;
}

const LABEL_W = 34;
const SLOT_W = 54;
const BOX_H = 32;
const ROW_H = 38;
const BARRIER_GAP = 14;
const HEADER_H = 22;
const BARRIER_STROKE = "#334155";
/** Phases above 8 have no assigned colour; neutral rather than implying a meaning. */
const FALLBACK = "#64748b";

/** Dark text on pale fills (phase 7 is yellow), white on the rest. */
const textOn = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // Perceived brightness (ITU-R BT.601).
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1f2937" : "#ffffff";
};

/**
 * One sequence as a ring-barrier diagram.
 *
 * Rings are rows, read left to right in running order. The heavy vertical lines
 * are barriers: every ring has to reach one before any ring crosses it, which is
 * what makes the phases between two barriers a concurrency group. Each box shows
 * its phase, with its position in the ring in the corner.
 *
 * This is structure only. How long each phase runs is the Splits chart's job.
 */
export default function PhaseSequenceDiagram({ diagram }: PhaseSequenceDiagramProps) {
  const { columns, rings, signalId, sequenceId } = diagram;

  if (rings.length === 0) {
    return <p className="p-3 text-xs text-grey-500">No drawable rows in {sequenceId}.</p>;
  }

  // x where each barrier band starts, leaving a gutter before it for the barrier line.
  const bandX: number[] = [];
  let x = LABEL_W + BARRIER_GAP;
  columns.forEach((col) => {
    bandX.push(x);
    x += col.slots * SLOT_W + BARRIER_GAP;
  });
  const width = x;
  const height = HEADER_H + rings.length * ROW_H + 4;
  const barrierXs = [
    LABEL_W + BARRIER_GAP / 2,
    ...columns.map((col, i) => bandX[i] + col.slots * SLOT_W + BARRIER_GAP / 2),
  ];

  const description = rings
    .map(
      (r) =>
        `ring ${r.ring}: ` +
        r.groups
          .map((g) => g.map((c) => `phase ${c.phaseId}`).join(", ") || "none")
          .join(", then barrier, "),
    )
    .join("; ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      // Natural size, so a phase box is the same size on every signal. Stretching
      // to the container made a two-slot signal's boxes twice the size of a
      // three-slot one's; this only shrinks when the container is narrower.
      width={width}
      height={height}
      className="h-auto max-w-full"
      role="img"
      aria-label={`Ring-barrier diagram for signal ${signalId}, sequence ${sequenceId}. ${description}.`}
    >
      {/* Barrier labels, centred over their band. */}
      {columns.map((col, i) => (
        <text
          key={`bl-${i}`}
          x={bandX[i] + (col.slots * SLOT_W) / 2}
          y={13}
          textAnchor="middle"
          fontSize={10}
          fontWeight={600}
          fill="#64748b"
        >
          Barrier {col.barrierId ?? "—"}
        </text>
      ))}

      {rings.map((ring, rowIndex) => {
        const y = HEADER_H + rowIndex * ROW_H + (ROW_H - BOX_H) / 2;
        return (
          <g key={ring.ring}>
            <text x={2} y={y + BOX_H / 2 + 4} fontSize={11} fontWeight={600} fill="#475569">
              R{ring.ring}
            </text>

            {columns.map((col, i) =>
              // Every slot is drawn: the phase if the ring has one there, a dashed
              // placeholder if not, so a short ring reads as short rather than ragged.
              Array.from({ length: col.slots }, (_, slot) => {
                const cell = ring.groups[i][slot];
                const bx = bandX[i] + slot * SLOT_W + 1.5;
                const bw = SLOT_W - 3;
                if (!cell) {
                  return (
                    <rect
                      key={`e-${i}-${slot}`}
                      x={bx}
                      y={y}
                      width={bw}
                      height={BOX_H}
                      rx={3}
                      fill="none"
                      stroke="#cbd5e1"
                      strokeDasharray="3 3"
                    />
                  );
                }
                const fill = phaseColors[cell.phaseId] ?? FALLBACK;
                const ink = textOn(fill);
                return (
                  <g key={`c-${cell.phaseId}-${cell.position}`}>
                    <title>
                      {`Phase ${cell.phaseId}: ring ${cell.ring}, position ${cell.position}, barrier ${cell.barrierId ?? "none"}`}
                    </title>
                    <rect x={bx} y={y} width={bw} height={BOX_H} rx={3} fill={fill} />
                    <text x={bx + 4} y={y + 10} fontSize={8} fill={ink} opacity={0.8}>
                      #{cell.position}
                    </text>
                    <text
                      x={bx + bw / 2}
                      y={y + BOX_H / 2 + 5}
                      textAnchor="middle"
                      fontSize={13}
                      fontWeight={700}
                      fill={ink}
                    >
                      {`φ${cell.phaseId}`}
                    </text>
                  </g>
                );
              }),
            )}
          </g>
        );
      })}

      {/* Barriers: both ends and between every band. */}
      {barrierXs.map((bx, i) => (
        <line
          key={`b-${i}`}
          x1={bx}
          y1={HEADER_H - 4}
          x2={bx}
          y2={height - 2}
          stroke={BARRIER_STROKE}
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
