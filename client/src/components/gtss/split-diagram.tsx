import { groupLength, type SplitPlan, type SplitValues } from "gtss";
import { phaseColors } from "gtss-diagram";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

interface SplitDiagramProps {
  plan: SplitPlan;
  values: SplitValues;
  cycleS: number;
  coordinatedPhase: number | null;
  /** Phases below their minimum, drawn with a warning outline. */
  belowMinimum?: ReadonlySet<number>;
  /** Drag a phase's right edge, or use the arrow keys on it, to change its split. */
  onChange?: (phaseId: number, seconds: number) => void;
}

const WIDTH = 760;
const LABEL_W = 34;
const RIGHT_W = 92;
const TOP = 20;
const ROW_H = 36;
const BAR_H = 24;
const HANDLE_W = 10;
const KEY_STEP = 1;
const KEY_STEP_BIG = 5;

interface Drag {
  phaseId: number;
  startX: number;
  startValue: number;
  /** Seconds per drawing unit, fixed for the drag so the bars don't rescale under the pointer. */
  secondsPerUnit: number;
}

/**
 * A ring-barrier diagram drawn to time. Every ring crosses each barrier at the
 * same moment, so each barrier group is as wide as its busiest ring and a
 * shorter ring shows the time it waits there, hatched. That is the picture a
 * split has to make: the bars end on the cycle line, and nothing waits.
 */
export default function SplitDiagram({
  plan,
  values,
  cycleS,
  coordinatedPhase,
  belowMinimum,
  onChange,
}: SplitDiagramProps) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // While dragging, the scale stays where it was when the drag began.
  const [frozenSpan, setFrozenSpan] = useState<number | null>(null);

  const rings = Array.from(new Set(plan.phases.map((p) => p.ring))).sort((a, b) => a - b);
  const lengths = plan.groups.map((g) => groupLength(values, g));
  const used = lengths.reduce((a, b) => a + b, 0);
  const span = frozenSpan ?? Math.max(cycleS, used, 1);
  const plotW = WIDTH - LABEL_W - RIGHT_W;
  const scale = plotW / span;
  const height = TOP + rings.length * ROW_H + 26;
  const v = (phaseId: number) => Math.max(0, values[phaseId] ?? 0);

  const groupX: number[] = [];
  lengths.reduce((x, len, i) => {
    groupX[i] = x;
    return x + len * scale;
  }, LABEL_W);

  const unitsAt = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    return box && box.width > 0 ? ((clientX - box.left) / box.width) * WIDTH : null;
  };

  const begin = (e: PointerEvent<SVGRectElement>, phaseId: number) => {
    if (!onChange || e.button !== 0) return;
    const x = unitsAt(e.clientX);
    if (x === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    setFrozenSpan(span);
    setDrag({ phaseId, startX: x, startValue: v(phaseId), secondsPerUnit: span / plotW });
  };
  const move = (e: PointerEvent<SVGRectElement>) => {
    if (!drag || !onChange) return;
    const x = unitsAt(e.clientX);
    if (x === null) return;
    // At least a second: a phase dragged to nothing would lose its handle.
    const next = Math.max(1, Math.round(drag.startValue + (x - drag.startX) * drag.secondsPerUnit));
    if (next !== v(drag.phaseId)) onChange(drag.phaseId, next);
  };
  const end = (e: PointerEvent<SVGRectElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDrag(null);
    setFrozenSpan(null);
  };
  const key = (e: KeyboardEvent<SVGRectElement>, phaseId: number) => {
    if (!onChange) return;
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : 0;
    if (dir === 0) return;
    e.preventDefault();
    onChange(phaseId, Math.max(0, v(phaseId) + dir * (e.shiftKey ? KEY_STEP_BIG : KEY_STEP)));
  };

  const cycleX = LABEL_W + cycleS * scale;
  const ringTotal = (ring: number) =>
    plan.phases.filter((p) => p.ring === ring).reduce((n, p) => n + v(p.phaseId), 0);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="w-full select-none"
      role="group"
      aria-label={`Splits for ${plan.signalId}, drawn to time`}
    >
      <defs>
        <pattern
          id={`${id}-wait`}
          width={5}
          height={5}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width={5} height={5} fill="#f3f4f6" />
          <line x1={0} y1={0} x2={0} y2={5} stroke="#d1d5db" strokeWidth={2} />
        </pattern>
      </defs>

      {/* Past the cycle: anything drawn here doesn't fit. */}
      {used > cycleS && cycleS > 0 && (
        <rect
          x={cycleX}
          y={TOP - 4}
          width={(used - cycleS) * scale}
          height={rings.length * ROW_H + 2}
          fill="#fee2e2"
        />
      )}

      {/* Barrier names over each group. */}
      {plan.groups.map((g, gi) => (
        <text
          key={`b-${g.barrierId}`}
          x={groupX[gi] + (lengths[gi] * scale) / 2}
          y={12}
          textAnchor="middle"
          fontSize={9}
          fill="#6b7280"
        >
          {g.barrierId ? `Barrier ${g.barrierId}` : ""} · {lengths[gi]}s
        </text>
      ))}

      {rings.map((ring, ri) => {
        const y = TOP + ri * ROW_H;
        const total = ringTotal(ring);
        // Every ring ends where the last barrier group does; the difference is
        // time it spends waiting at barriers for the other ring.
        const waits = used - total;
        const fits = cycleS > 0 && total === cycleS && waits === 0;
        return (
          <g key={ring}>
            <text x={2} y={y + BAR_H / 2 + 4} fontSize={11} fill="#6b7280">
              R{ring}
            </text>
            {plan.groups.map((g, gi) => {
              const phases = g.rings.find((r) => r.ring === ring)?.phases ?? [];
              let x = groupX[gi];
              const blocks = phases.map((p) => {
                const w = v(p.phaseId) * scale;
                const at = x;
                x += w;
                return { p, at, w };
              });
              const waitW = groupX[gi] + lengths[gi] * scale - x;
              return (
                <g key={g.barrierId}>
                  {blocks.map(({ p, at, w }) =>
                    w <= 0 ? null : (
                      <g key={p.phaseId}>
                        <rect
                          x={at}
                          y={y}
                          width={w}
                          height={BAR_H}
                          rx={2}
                          fill={phaseColors[p.phaseId] ?? "#9ca3af"}
                          stroke={belowMinimum?.has(p.phaseId) ? "#dc2626" : "#ffffff"}
                          strokeWidth={belowMinimum?.has(p.phaseId) ? 2 : 1}
                        >
                          <title>
                            {`φ${p.phaseId}: ${v(p.phaseId)}s${p.phaseId === coordinatedPhase ? " (coordinated)" : ""}${p.minimumS != null ? `, minimum ${p.minimumS}s` : ""}`}
                          </title>
                        </rect>
                        {p.phaseId === coordinatedPhase && (
                          <rect
                            x={at + 1}
                            y={y + BAR_H - 4}
                            width={Math.max(0, w - 2)}
                            height={3}
                            fill="#111827"
                            opacity={0.55}
                          />
                        )}
                        {w > 30 && (
                          <text
                            x={at + w / 2}
                            y={y + BAR_H / 2 + 4}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={600}
                            fill="#ffffff"
                            pointerEvents="none"
                          >
                            φ{p.phaseId} {v(p.phaseId)}
                          </text>
                        )}
                      </g>
                    ),
                  )}
                  {waitW > 0.5 && (
                    <rect x={x} y={y} width={waitW} height={BAR_H} fill={`url(#${id}-wait)`}>
                      <title>{`R${ring} waits ${Math.round(waitW / scale)}s at barrier ${g.barrierId || "(none)"}`}</title>
                    </rect>
                  )}
                </g>
              );
            })}
            <text
              x={WIDTH - RIGHT_W + 8}
              y={y + BAR_H / 2 + 4}
              fontSize={10}
              fontWeight={600}
              fill={fits ? "#15803d" : "#b45309"}
            >
              {waits > 0
                ? `${total}s +${waits}s wait`
                : `${total}s${cycleS > 0 ? (fits ? " ✓" : ` ≠ ${cycleS}`) : ""}`}
            </text>
          </g>
        );
      })}

      {/* Barriers: the same line through every ring. */}
      {groupX.slice(1).map((x, i) => (
        <line
          key={`bar-${i}`}
          x1={x}
          y1={TOP - 6}
          x2={x}
          y2={TOP + rings.length * ROW_H - 6}
          stroke="#111827"
          strokeWidth={2.5}
        />
      ))}

      {cycleS > 0 && (
        <g>
          <line
            x1={cycleX}
            y1={TOP - 6}
            x2={cycleX}
            y2={TOP + rings.length * ROW_H - 4}
            stroke="#dc2626"
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
          <text
            x={cycleX}
            y={TOP + rings.length * ROW_H + 10}
            textAnchor="middle"
            fontSize={10}
            fill="#dc2626"
          >
            cycle {cycleS}s
          </text>
        </g>
      )}

      {/* Drag handles on each phase's right edge, above everything else. */}
      {onChange &&
        rings.flatMap((ring, ri) => {
          const y = TOP + ri * ROW_H;
          return plan.groups.flatMap((g, gi) => {
            const phases = g.rings.find((r) => r.ring === ring)?.phases ?? [];
            let x = groupX[gi];
            return phases.flatMap((p) => {
              x += v(p.phaseId) * scale;
              if (v(p.phaseId) <= 0) return [];
              return [
                <rect
                  key={`h-${p.phaseId}`}
                  x={x - HANDLE_W / 2}
                  y={y - 2}
                  width={HANDLE_W}
                  height={BAR_H + 4}
                  fill="transparent"
                  className="outline-none focus-visible:stroke-blue-600 focus-visible:stroke-2"
                  style={{ cursor: "ew-resize", touchAction: "none" }}
                  tabIndex={0}
                  role="slider"
                  aria-label={`φ${p.phaseId} split`}
                  aria-valuemin={0}
                  aria-valuenow={v(p.phaseId)}
                  aria-valuetext={`${v(p.phaseId)} seconds`}
                  onPointerDown={(e) => begin(e, p.phaseId)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  onKeyDown={(e) => key(e, p.phaseId)}
                >
                  <title>{`Drag to change φ${p.phaseId}'s split; arrow keys for 1s, Shift for 5s`}</title>
                </rect>,
              ];
            });
          });
        })}
    </svg>
  );
}
