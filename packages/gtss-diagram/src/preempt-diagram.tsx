import {
  movementShape,
  phaseColors,
  type MovementShape,
  type PhaseDiagramApproach,
} from "./phase-diagram";

// A preempt channel at a glance: the intersection's legs, and an arrow for each
// movement the channel brings up. It uses the phase diagram's colors and reads
// movement types the same way, but draws only what small multiples need: no
// title, legend, lanes or crosswalks.

export interface PreemptDiagramPhase {
  phase: number;
  approachId: string | null;
  movementType: string;
}

export interface PreemptDiagramProps {
  /** The channel's movements. One with no approach bearing, or pedestrian-only, draws no arrow. */
  phases: PreemptDiagramPhase[];
  /** All of the signal's approaches: they draw the legs. */
  approaches: PhaseDiagramApproach[];
  /** Left-hand traffic: mirrors lanes and turns, as in PhaseDiagram. */
  isLht: boolean;
  /** Describes the chart to screen readers. */
  label: string;
  /** Rendered width and height in pixels. */
  size?: number;
}

const VIEW = 132;
const CENTER = VIEW / 2;
const LEG_LENGTH = 58;
const ROAD_WIDTH = 24;
const ROAD_COLOR = "#e5e7eb";
const TAIL = -46;
const LABEL_AT = -55;
// Phase numbers on one approach sit this far apart, however close their lanes are.
const LABEL_GAP = 11;
const FALLBACK_COLOR = "#64748b";
// A permissive left yields, so it is drawn grey, as in PhaseDiagram.
const PERMISSIVE_COLOR = "#9ca3af";
const STROKE = 3;
const HEAD_LENGTH = 7;
const HEAD_HALF_WIDTH = 3.75;

type Point = readonly [number, number];
/** A place on the approach: how far along the direction of travel, and how far to the driver's right. */
type At = (along: number, right: number) => Point;

/**
 * The frame every arrow is drawn in. Bearings are the way traffic heads, so an
 * arrow starts on the far side of the center from its heading and runs toward
 * it. Under LHT "right" flips, which mirrors lanes and turns together.
 */
const frameFor = (bearing: number, isLht: boolean): At => {
  const rad = (bearing * Math.PI) / 180;
  const side = isLht ? -1 : 1;
  const forward: Point = [Math.sin(rad), -Math.cos(rad)];
  const right: Point = [Math.cos(rad) * side, Math.sin(rad) * side];
  return (along, toRight) => [
    CENTER + forward[0] * along + right[0] * toRight,
    CENTER + forward[1] * along + right[1] * toRight,
  ];
};

const round = (n: number) => Math.round(n * 100) / 100;
const xy = ([x, y]: Point) => `${round(x)} ${round(y)}`;

/** A triangle whose tip is `tip`, pointing the way from `from` to it. */
const headPoints = (from: Point, tip: Point): string => {
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const baseX = tip[0] - ux * HEAD_LENGTH;
  const baseY = tip[1] - uy * HEAD_LENGTH;
  return [
    [tip[0], tip[1]],
    [baseX - uy * HEAD_HALF_WIDTH, baseY + ux * HEAD_HALF_WIDTH],
    [baseX + uy * HEAD_HALF_WIDTH, baseY - ux * HEAD_HALF_WIDTH],
  ]
    .map(([x, y]) => `${round(x)},${round(y)}`)
    .join(" ");
};

/** One line of an arrow: a path, and where its head goes. */
interface Stroke {
  d: string;
  from: Point;
  tip: Point;
  color: string;
}

/** The path stops short of the tip, so the line's end doesn't poke through the head. */
const shortOfTip = (from: Point, tip: Point): Point => {
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  return [tip[0] - (dx / length) * (HEAD_LENGTH - 1), tip[1] - (dy / length) * (HEAD_LENGTH - 1)];
};

const straight = (at: At, right: number, color: string): Stroke => {
  const from = at(TAIL, right);
  const tip = at(38, right);
  const end = shortOfTip(from, tip);
  return { d: `M ${xy(from)} L ${xy(end)}`, from, tip, color };
};

/** Toward the driver's left, across the far side of the center. */
const leftTurn = (at: At, right: number, branchFrom: number, color: string): Stroke => {
  const start = at(branchFrom, right);
  const corner = at(7, right);
  const out = at(7, right - 13);
  const from = at(7, -26);
  const tip = at(7, -40);
  const end = shortOfTip(from, tip);
  return {
    d: `M ${xy(start)} L ${xy(at(-6, right))} Q ${xy(corner)} ${xy(out)} L ${xy(end)}`,
    from,
    tip,
    color,
  };
};

/** Toward the driver's right, tight to the near corner. */
const rightTurn = (at: At, right: number, branchFrom: number, color: string): Stroke => {
  const start = at(branchFrom, right);
  const corner = at(-11, right);
  const out = at(-11, right + 11);
  const from = at(-11, 24);
  const tip = at(-11, 40);
  const end = shortOfTip(from, tip);
  return {
    d: `M ${xy(start)} L ${xy(at(-22, right))} Q ${xy(corner)} ${xy(out)} L ${xy(end)}`,
    from,
    tip,
    color,
  };
};

const uTurn = (at: At, right: number, color: string): Stroke => {
  const from = at(-24, right - 8);
  const tip = at(TAIL + 4, right - 8);
  const end = shortOfTip(from, tip);
  return {
    d: `M ${xy(at(TAIL, right))} L ${xy(at(-14, right))} C ${xy(at(-4, right))} ${xy(at(-4, right - 8))} ${xy(at(-14, right - 8))} L ${xy(end)}`,
    from,
    tip,
    color,
  };
};

/** Lanes across the approach, measured to the driver's right of its centerline. */
const LANE: Record<Exclude<MovementShape, "pedestrian">, number> = {
  left: 2,
  uturn: 3,
  straight: 8,
  right: 10,
  leftThrough: 5,
  throughRight: 8,
  permissive: 6,
};

const strokesFor = (shape: MovementShape, at: At, right: number, color: string): Stroke[] => {
  switch (shape) {
    case "left":
      return [leftTurn(at, right, TAIL, color)];
    case "right":
      return [rightTurn(at, right, TAIL, color)];
    case "uturn":
      return [uTurn(at, right, color)];
    case "leftThrough":
      return [straight(at, right, color), leftTurn(at, right, -14, color)];
    case "throughRight":
      return [straight(at, right, color), rightTurn(at, right, -28, color)];
    case "permissive":
      return [leftTurn(at, right, -14, PERMISSIVE_COLOR), straight(at, right, color)];
    case "pedestrian":
      return [];
    default:
      return [straight(at, right, color)];
  }
};

export const PreemptDiagram = ({
  phases,
  approaches,
  isLht,
  label,
  size = VIEW,
}: PreemptDiagramProps) => {
  const bearingOf = (approachId: string | null) =>
    approaches.find((a) => a.approachId === approachId)?.compassBearing ?? null;

  const legs = approaches.filter((a) => a.compassBearing != null);
  const drawn = phases.filter(
    (p) => bearingOf(p.approachId) !== null && movementShape(p.movementType) !== "pedestrian",
  );

  // Movements sharing an approach and a lane sit side by side, not on top of each other.
  const laneFor = (p: PreemptDiagramPhase, shape: Exclude<MovementShape, "pedestrian">) => {
    const sameLane = drawn.filter(
      (q) => q.approachId === p.approachId && movementShape(q.movementType) === shape,
    );
    const nudge = (sameLane.indexOf(p) - (sameLane.length - 1) / 2) * 5;
    return LANE[shape] + nudge;
  };
  const laneOf = (p: PreemptDiagramPhase) =>
    laneFor(p, movementShape(p.movementType) as Exclude<MovementShape, "pedestrian">);

  // A movement's number goes at its tail. Lanes are too close for two numbers to
  // sit side by side, so those on one approach spread out around their lanes.
  const labelRightOf = (p: PreemptDiagramPhase) => {
    const sameApproach = drawn
      .filter((q) => q.approachId === p.approachId)
      .sort((a, b) => laneOf(a) - laneOf(b));
    const middle = sameApproach.reduce((sum, q) => sum + laneOf(q), 0) / sameApproach.length;
    return middle + (sameApproach.indexOf(p) - (sameApproach.length - 1) / 2) * LABEL_GAP;
  };

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className="h-auto max-w-full"
    >
      {legs.map((a) => {
        // A leg runs out from the center the way its traffic comes from.
        const end = frameFor(a.compassBearing as number, isLht)(-LEG_LENGTH, 0);
        return (
          <line
            key={a.approachId}
            x1={CENTER}
            y1={CENTER}
            x2={round(end[0])}
            y2={round(end[1])}
            stroke={ROAD_COLOR}
            strokeWidth={ROAD_WIDTH}
          />
        );
      })}
      <circle cx={CENTER} cy={CENTER} r={ROAD_WIDTH * 0.75} fill={ROAD_COLOR} />

      {drawn.map((p, index) => {
        const shape = movementShape(p.movementType) as Exclude<MovementShape, "pedestrian">;
        const at = frameFor(bearingOf(p.approachId) as number, isLht);
        const lane = laneFor(p, shape);
        const color = phaseColors[p.phase] ?? FALLBACK_COLOR;
        const [lx, ly] = at(LABEL_AT, labelRightOf(p));
        return (
          <g key={`${p.phase}-${p.approachId}-${index}`}>
            {strokesFor(shape, at, lane, color).map((s, i) => (
              <g key={i}>
                <path
                  d={s.d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polygon points={headPoints(s.from, s.tip)} fill={s.color} />
              </g>
            ))}
            <text
              x={round(lx)}
              y={round(ly)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight={700}
              fill={color}
              stroke="#ffffff"
              strokeWidth={2.5}
              paintOrder="stroke"
            >
              {p.phase}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export default PreemptDiagram;
