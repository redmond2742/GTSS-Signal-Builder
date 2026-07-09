import React from "react";
import { freeRightPedMarkings } from "./free-right-markings";

interface DetectorData {
  channel: string;
  phase: number;
  lane: string;
  purpose: string;
  technologyType: string;
  stopbarSetbackDist?: number;
}

interface PhaseData {
  phase: number;
  approachId: string | null;
  movementType: string;
  numOfLanes: number;
}

interface ApproachData {
  approachId: string;
  compassBearing: number | null;
  /** FR — free right slip lane bypassing the signal:
   *   0 = none, 1 = FR, 2 = FR-P, 3 = FR-P-I.
   * Legacy booleans are coerced to 0/1. */
  freeRight?: boolean | number | null;
  /** Number of free-right lanes (widens the drawn slip lane). */
  freeRightLanes?: number | null;
}

interface SignalData {
  signalId: string;
  primaryStreet?: string;
  secondaryStreet?: string;
}

interface DetectorDiagramProps {
  detectors: DetectorData[];
  phases: PhaseData[];
  approaches: ApproachData[];
  signal?: SignalData;
  svgRef?: React.RefObject<SVGSVGElement>;
}

// Technology type colors
const technologyColors: Record<string, string> = {
  "Inductance Loop": "#3b82f6", // blue
  "Video": "#8b5cf6", // purple
  "Radar": "#f97316", // orange
  "Microwave": "#14b8a6", // teal
  "Magnetic": "#ef4444", // red
};

const getTechnologyColor = (techType: string): string => {
  return technologyColors[techType] || "#6b7280";
};

// Check if detector is advanced (not at stop bar)
const isAdvancedDetector = (purpose: string, setback?: number): boolean => {
  if (setback !== undefined && setback > 20) return true;
  return ["Advanced Loop", "Count Detector", "Extension", "Dilemma Zone"].includes(purpose);
};

// Effective setback in feet, used to ORDER advanced detectors along the road
// (and as the label when it comes from a real stopbar_setback_dist). Purposes
// without an explicit distance get a typical ordering value.
const effectiveSetback = (d: { purpose: string; stopbarSetbackDist?: number }): number => {
  if (d.stopbarSetbackDist !== undefined && d.stopbarSetbackDist > 0) return d.stopbarSetbackDist;
  switch (d.purpose) {
    case "Extension": return 80;
    case "Advanced Loop": return 120;
    case "Count Detector": return 160;
    case "Dilemma Zone": return 200;
    default: return 0;
  }
};

// Lane width in diagram units
const LANE_WIDTH = 28;

export default function DetectorDiagram({ detectors, phases, approaches, signal, svgRef }: DetectorDiagramProps) {
  // Determine if we have any advanced detectors - if not, zoom in more
  const hasAdvancedDetectors = detectors.some(d => isAdvancedDetector(d.purpose, d.stopbarSetbackDist));

  // Dynamic sizing - maximize use of canvas space with larger intersection
  const CENTER_X = 200;
  const CENTER_Y = 200;
  const INTERSECTION_RADIUS = 75; // Larger intersection for better spacing
  const ROAD_LENGTH = hasAdvancedDetectors ? 110 : 105; // Extended to use more canvas space

  // Get approach for a phase
  const getApproachForPhase = (phaseNum: number): ApproachData | null => {
    const phase = phases.find(p => p.phase === phaseNum);
    if (!phase?.approachId) return null;
    return approaches.find(a => a.approachId === phase.approachId) || null;
  };

  // Get phases for an approach, grouped by movement type
  const getPhasesForApproach = (approachId: string) => {
    return phases.filter(p => p.approachId === approachId);
  };

  // Calculate total lanes for an approach (through + turn lanes)
  const getLaneConfigForApproach = (approachId: string): { totalLanes: number; throughLanes: number; leftLanes: number; rightLanes: number } => {
    const approachPhases = getPhasesForApproach(approachId);

    let throughLanes = 0;
    let leftLanes = 0;
    let rightLanes = 0;

    approachPhases.forEach(phase => {
      const lanes = phase.numOfLanes || 1;
      if (phase.movementType === "Left Turn" || phase.movementType === "Left" || phase.movementType === "Left Protected-Permissive" || phase.movementType === "Flashing Yellow Arrow") {
        leftLanes = Math.max(leftLanes, lanes);
      } else if (phase.movementType === "Right Turn" || phase.movementType === "Right") {
        rightLanes = Math.max(rightLanes, lanes);
      } else {
        throughLanes = Math.max(throughLanes, lanes);
      }
    });

    // Ensure minimum of 1 lane if any phases exist
    if (approachPhases.length > 0 && throughLanes === 0 && leftLanes === 0 && rightLanes === 0) {
      throughLanes = 1;
    }

    return {
      totalLanes: leftLanes + throughLanes + rightLanes,
      throughLanes,
      leftLanes,
      rightLanes
    };
  };

  // Get lane offset for a detector based on phase movement type and lane number
  const getLaneOffset = (detector: DetectorData): number => {
    const phase = phases.find(p => p.phase === detector.phase);
    if (!phase?.approachId) return 0;

    const config = getLaneConfigForApproach(phase.approachId);
    const laneNum = parseInt(detector.lane) || 1;

    // Determine which lane group this detector belongs to
    const isLeft = phase.movementType === "Left Turn" || phase.movementType === "Left" || phase.movementType === "Left Protected-Permissive" || phase.movementType === "Flashing Yellow Arrow";
    const isRight = phase.movementType === "Right Turn" || phase.movementType === "Right";

    let lanePosition: number;

    if (isLeft) {
      // Left turn lanes are on the left side (positive offset looking from intersection)
      lanePosition = config.throughLanes + config.rightLanes + laneNum;
    } else if (isRight) {
      // Right turn lanes are on the right side (negative offset)
      lanePosition = laneNum;
    } else {
      // Through lanes in the middle
      lanePosition = config.rightLanes + laneNum;
    }

    // Center the lanes around 0
    const totalLanes = config.totalLanes || 1;
    const offset = (lanePosition - (totalLanes + 1) / 2) * LANE_WIDTH;

    return offset;
  };

  // Helper to create arrow path for lane arrows with tails
  const createArrowPath = (x: number, y: number, size: number, direction: 'up' | 'left' | 'right' | 'up-left' | 'up-right'): string => {
    const half = size / 2;
    const tip = size * 0.8;
    const tail = size * 0.6;

    switch (direction) {
      case 'up':
        // Tail line from bottom to tip, then two arrowhead lines
        return `M ${x} ${y + tail} L ${x} ${y - tip} M ${x - half} ${y - tip + half} L ${x} ${y - tip} L ${x + half} ${y - tip + half}`;
      case 'left':
        // Tail line from right to tip, then two arrowhead lines
        return `M ${x + tail} ${y} L ${x - tip} ${y} M ${x - tip + half} ${y - half} L ${x - tip} ${y} L ${x - tip + half} ${y + half}`;
      case 'right':
        // Tail line from left to tip, then two arrowhead lines
        return `M ${x - tail} ${y} L ${x + tip} ${y} M ${x + tip - half} ${y - half} L ${x + tip} ${y} L ${x + tip - half} ${y + half}`;
      case 'up-left':
        // Diagonal tail and arrowhead
        return `M ${x + tail/1.4} ${y + tail/1.4} L ${x - tip/1.4} ${y - tip/1.4} M ${x - tip/2} ${y - tip/2 + half} L ${x - tip/1.4} ${y - tip/1.4} L ${x - tip/2 + half} ${y - tip/2}`;
      case 'up-right':
        // Diagonal tail and arrowhead
        return `M ${x - tail/1.4} ${y + tail/1.4} L ${x + tip/1.4} ${y - tip/1.4} M ${x + tip/2 - half} ${y - tip/2} L ${x + tip/1.4} ${y - tip/1.4} L ${x + tip/2} ${y - tip/2 + half}`;
    }
  };

  // Render approach road with lanes and arrows
  const renderApproachRoad = (approach: ApproachData, idx: number) => {
    if (approach.compassBearing === null) return null;

    const config = getLaneConfigForApproach(approach.approachId);
    const approachPhases = getPhasesForApproach(approach.approachId);
    const numLanes = Math.max(config.totalLanes, 1);
    const roadWidth = numLanes * LANE_WIDTH;

    const adjustedBearing = (approach.compassBearing + 180) % 360;
    const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
    const perpAngle = angleRad + Math.PI / 2;

    const roadStartDist = INTERSECTION_RADIUS;
    const roadEndDist = roadStartDist + ROAD_LENGTH;

    const startX = CENTER_X + roadStartDist * Math.cos(angleRad);
    const startY = CENTER_Y + roadStartDist * Math.sin(angleRad);
    const endX = CENTER_X + roadEndDist * Math.cos(angleRad);
    const endY = CENTER_Y + roadEndDist * Math.sin(angleRad);

    const halfWidth = roadWidth / 2;
    const corners = [
      { x: startX + halfWidth * Math.cos(perpAngle), y: startY + halfWidth * Math.sin(perpAngle) },
      { x: startX - halfWidth * Math.cos(perpAngle), y: startY - halfWidth * Math.sin(perpAngle) },
      { x: endX - halfWidth * Math.cos(perpAngle), y: endY - halfWidth * Math.sin(perpAngle) },
      { x: endX + halfWidth * Math.cos(perpAngle), y: endY + halfWidth * Math.sin(perpAngle) },
    ];

    const pathD = `M ${corners[0].x} ${corners[0].y} L ${corners[1].x} ${corners[1].y} L ${corners[2].x} ${corners[2].y} L ${corners[3].x} ${corners[3].y} Z`;

    // Lane divider lines
    const laneDividers = [];
    const laneArrows = [];

    for (let i = 1; i < numLanes; i++) {
      const laneOffset = (i - numLanes / 2) * LANE_WIDTH;
      const divStartX = startX + laneOffset * Math.cos(perpAngle);
      const divStartY = startY + laneOffset * Math.sin(perpAngle);
      const divEndX = endX + laneOffset * Math.cos(perpAngle);
      const divEndY = endY + laneOffset * Math.sin(perpAngle);

      // Check if this is a divider between movement types (solid line)
      const isBetweenTypes = (i === config.rightLanes && config.rightLanes > 0) ||
                             (i === config.rightLanes + config.throughLanes && config.leftLanes > 0);

      laneDividers.push(
        <line
          key={`lane-${idx}-${i}`}
          x1={divStartX}
          y1={divStartY}
          x2={divEndX}
          y2={divEndY}
          stroke={isBetweenTypes ? "#9ca3af" : "#d1d5db"}
          strokeWidth={isBetweenTypes ? "2" : "1"}
          strokeDasharray={isBetweenTypes ? "none" : "8 6"}
        />
      );
    }

    // Add lane arrows in each lane, close to the stop bar so they read as
    // pavement markings and stay clear of the advanced-detector band.
    for (let laneIdx = 0; laneIdx < numLanes; laneIdx++) {
      const laneOffset = ((laneIdx + 0.5) - numLanes / 2) * LANE_WIDTH;
      const arrowDist = roadStartDist + ROAD_LENGTH * 0.3;
      const arrowX = CENTER_X + arrowDist * Math.cos(angleRad) + laneOffset * Math.cos(perpAngle);
      const arrowY = CENTER_Y + arrowDist * Math.sin(angleRad) + laneOffset * Math.sin(perpAngle);

      // Arrow direction relative to the DRIVER heading toward the
      // intersection: 'up' = straight ahead, 'left'/'right' = turns. The
      // local-space arrow is rotated by the approach's compass bearing (the
      // direction of travel), so arrows always follow the flow of traffic.
      let arrowDirection: 'up' | 'left' | 'right' | 'up-left' | 'up-right' = 'up';

      if (laneIdx < config.rightLanes) {
        arrowDirection = 'right';
      } else if (laneIdx < config.rightLanes + config.throughLanes) {
        arrowDirection = 'up';
      } else {
        arrowDirection = 'left';
      }

      const arrowPath = createArrowPath(arrowX, arrowY, 10, arrowDirection);

      laneArrows.push(
        <path
          key={`arrow-${idx}-${laneIdx}`}
          d={arrowPath}
          stroke="#9ca3af"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          transform={`rotate(${approach.compassBearing}, ${arrowX}, ${arrowY})`}
        />
      );
    }

    const stopBarX = startX;
    const stopBarY = startY;
    const stopBarHalfLen = roadWidth / 2 - 2;

    return (
      <g key={`road-${idx}`}>
        <path d={pathD} fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1" />
        {laneDividers}
        {laneArrows}
        <line
          x1={stopBarX + stopBarHalfLen * Math.cos(perpAngle)}
          y1={stopBarY + stopBarHalfLen * Math.sin(perpAngle)}
          x2={stopBarX - stopBarHalfLen * Math.cos(perpAngle)}
          y2={stopBarY - stopBarHalfLen * Math.sin(perpAngle)}
          stroke="#ffffff"
          strokeWidth="3"
        />
      </g>
    );
  };

  // ---- Detector placement ------------------------------------------------
  // Stop-bar detectors sit just behind the stop bar. Advanced detectors are
  // SCALED TO FIT the drawn road: their real setbacks only order them within
  // a fixed band, and the actual distance is shown as a text label instead.
  interface PlacedDetector {
    det: DetectorData;
    index: number;
    x: number;
    y: number;
    dist: number;        // longitudinal distance from the diagram center
    laneOffset: number;  // lateral offset within the road
    adjustedBearing: number;
    angleRad: number;
    perpAngle: number;
    approachId: string;
    labeled: boolean;    // whether the channel number is drawn
  }

  // Per-approach map of effective setback value → longitudinal slot distance.
  const advancedSlots = new Map<string, Map<number, number>>();
  approaches.forEach(a => {
    const vals = Array.from(new Set(
      detectors
        .filter(d => {
          const ap = getApproachForPhase(d.phase);
          return ap?.approachId === a.approachId && isAdvancedDetector(d.purpose, d.stopbarSetbackDist);
        })
        .map(effectiveSetback)
    )).sort((x, y) => x - y);
    if (vals.length === 0) return;
    const maxVal = vals[vals.length - 1];
    const bandStart = INTERSECTION_RADIUS + 52;
    const bandEnd = INTERSECTION_RADIUS + ROAD_LENGTH - 14;
    const slotMap = new Map<number, number>();
    vals.forEach(v => slotMap.set(v, bandStart + (bandEnd - bandStart) * (v / maxVal)));
    advancedSlots.set(a.approachId, slotMap);
  });

  const placedDetectors: PlacedDetector[] = [];
  detectors.forEach((det, index) => {
    const approach = getApproachForPhase(det.phase);
    if (!approach || approach.compassBearing === null) return;

    const adjustedBearing = (approach.compassBearing + 180) % 360;
    const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
    const perpAngle = angleRad + Math.PI / 2;
    const advanced = isAdvancedDetector(det.purpose, det.stopbarSetbackDist);

    let dist: number;
    if (advanced) {
      dist = advancedSlots.get(approach.approachId)?.get(effectiveSetback(det))
        ?? INTERSECTION_RADIUS + ROAD_LENGTH - 14;
    } else {
      // Stop-bar detectors: right behind the stop bar, nudged slightly by any
      // small (≤20 ft) setback.
      dist = INTERSECTION_RADIUS + 12 + Math.min(det.stopbarSetbackDist ?? 0, 20) * 0.9;
    }

    const laneOffset = getLaneOffset(det);
    placedDetectors.push({
      det,
      index,
      x: CENTER_X + dist * Math.cos(angleRad) + laneOffset * Math.cos(perpAngle),
      y: CENTER_Y + dist * Math.sin(angleRad) + laneOffset * Math.sin(perpAngle),
      dist,
      laneOffset,
      adjustedBearing,
      angleRad,
      perpAngle,
      approachId: approach.approachId,
      labeled: true,
    });
  });

  // Group detectors that share an approach and longitudinal slot (i.e. a row
  // across adjacent lanes). If their channel numbers run sequentially across
  // the row, only label the first and last — the reader fills in the rest.
  const rowGroups = new Map<string, PlacedDetector[]>();
  placedDetectors.forEach(pd => {
    const key = `${pd.approachId}|${pd.dist.toFixed(1)}`;
    const group = rowGroups.get(key);
    if (group) group.push(pd);
    else rowGroups.set(key, [pd]);
  });
  rowGroups.forEach(group => {
    if (group.length < 3) return;
    const sorted = [...group].sort((a, b) => a.laneOffset - b.laneOffset);
    const chans = sorted.map(pd => parseInt(pd.det.channel, 10));
    if (!chans.every(n => Number.isFinite(n))) return;
    const step = chans[1] - chans[0];
    const sequential =
      Math.abs(step) === 1 &&
      chans.every((c, i) => i === 0 || c - chans[i - 1] === step) &&
      sorted.every((pd, i) => i === 0 || Math.abs(pd.laneOffset - sorted[i - 1].laneOffset - LANE_WIDTH) < 0.01);
    if (sequential) {
      sorted.forEach((pd, i) => {
        pd.labeled = i === 0 || i === sorted.length - 1;
      });
    }
  });

  // One distance label per advanced row that has a real measured setback,
  // placed off the road edge beside the row.
  const distanceLabels: React.ReactElement[] = [];
  rowGroups.forEach((group, key) => {
    const sample = group[0];
    if (!isAdvancedDetector(sample.det.purpose, sample.det.stopbarSetbackDist)) return;
    const measured = group
      .map(pd => pd.det.stopbarSetbackDist)
      .find(s => s !== undefined && s > 0);
    if (measured === undefined) return;
    const config = getLaneConfigForApproach(sample.approachId);
    const roadHalf = (Math.max(config.totalLanes, 1) * LANE_WIDTH) / 2;
    const lx = CENTER_X + sample.dist * Math.cos(sample.angleRad) + (roadHalf + 20) * Math.cos(sample.perpAngle);
    const ly = CENTER_Y + sample.dist * Math.sin(sample.angleRad) + (roadHalf + 20) * Math.sin(sample.perpAngle);
    distanceLabels.push(
      <text
        key={`dist-${key}`}
        x={lx}
        y={ly + 3}
        textAnchor="middle"
        fontSize="9"
        fill="#6b7280"
      >
        {measured} ft
      </text>
    );
  });

  const renderPlacedDetector = (pd: PlacedDetector) => {
    const color = getTechnologyColor(pd.det.technologyType);
    const detWidth = 24;
    const detHeight = 16;

    return (
      <g key={`det-${pd.index}`}>
        <rect
          x={pd.x - detWidth / 2}
          y={pd.y - detHeight / 2}
          width={detWidth}
          height={detHeight}
          fill={color}
          stroke="#ffffff"
          strokeWidth="2"
          rx="2"
          transform={`rotate(${pd.adjustedBearing}, ${pd.x}, ${pd.y})`}
        />
        {pd.labeled && (
          <text
            x={pd.x}
            y={pd.y + 4}
            textAnchor="middle"
            fontSize="10"
            fontWeight="bold"
            fill="#ffffff"
          >
            {pd.det.channel}
          </text>
        )}
      </g>
    );
  };

  // Get unique technology types for legend
  const uniqueTechTypes = Array.from(new Set(detectors.map(d => d.technologyType)));

  const viewBoxSize = hasAdvancedDetectors ? 400 : 400;

  // Build title from signal data
  const buildTitle = () => {
    if (!signal) return '';
    if (signal.primaryStreet && signal.secondaryStreet) {
      return `${signal.signalId}. ${signal.primaryStreet} & ${signal.secondaryStreet}`;
    } else if (signal.primaryStreet) {
      return `${signal.signalId}. ${signal.primaryStreet}`;
    }
    return `Signal ${signal.signalId}`;
  };

  const title = buildTitle();

  return (
    <svg ref={svgRef} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize + 40}`} className="w-full h-full">
      {/* Title */}
      {title && (
        <text x={CENTER_X} y="12" textAnchor="middle" fontSize="12" fill="#374151" fontWeight="600">
          {title}
        </text>
      )}

      <g>
        {/* Compass directions */}
        <text x={CENTER_X} y="28" textAnchor="middle" fontSize="11" fill="#9ca3af" fontWeight="500">N</text>
        <text x={viewBoxSize - 15} y={CENTER_Y + 4} textAnchor="middle" fontSize="11" fill="#9ca3af" fontWeight="500">E</text>
        <text x={CENTER_X} y={viewBoxSize - 8} textAnchor="middle" fontSize="11" fill="#9ca3af" fontWeight="500">S</text>
        <text x="15" y={CENTER_Y + 4} textAnchor="middle" fontSize="11" fill="#9ca3af" fontWeight="500">W</text>

        {/* Approach roads */}
        {approaches.map((approach, idx) => renderApproachRoad(approach, idx))}

        {/* FR — free right slip lanes: an arc peeling off the approach road
            to the right, departing onto the neighboring approach's actual
            road (sweep angle follows the real compass bearings). Mode 2 (FR-P)
            adds a crosswalk; mode 3 (FR-P-I) adds a traffic-calmed ladder
            crosswalk with a shark's-teeth yield line. */}
        {approaches.map((approach, idx) => {
          const frMode = typeof approach.freeRight === "number"
            ? approach.freeRight
            : (approach.freeRight ? 1 : 0);
          if (frMode === 0 || approach.compassBearing === null) return null;
          const adjustedBearing = (approach.compassBearing + 180) % 360;
          const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
          // Sweep = clockwise gap to the nearest other approach on the right
          // side (10°–170°); falls back to 90° when there is none.
          const rightGaps = approaches
            .filter(o => o !== approach && o.compassBearing !== null)
            .map(o => {
              const oRad = ((((o.compassBearing as number) + 180) % 360) - 90) * (Math.PI / 180);
              const gap = (angleRad - oRad) % (2 * Math.PI);
              return gap < 0 ? gap + 2 * Math.PI : gap;
            })
            .filter(gap => gap > 0.17 && gap < Math.PI - 0.17);
          const sweep = rightGaps.length > 0 ? Math.min(...rightGaps) : Math.PI / 2;
          const exitRad = angleRad - sweep;
          const midRad = angleRad - sweep / 2;
          const p = (r: number, a: number) => [CENTER_X + r * Math.cos(a), CENTER_Y + r * Math.sin(a)];
          const d = INTERSECTION_RADIUS + ROAD_LENGTH * 0.75; // peel-off / merge radius
          const h = sweep / 2;
          // Preferred arc: 2× the tangent fillet radius (flat, matching this
          // diagram's larger scale), pushed out to a minimum clearance so
          // wide corners never clip the central intersection circle.
          const flatR = 2 * d * Math.tan(h);
          const flatMid =
            d * Math.cos(h) +
            Math.sqrt(Math.max(flatR * flatR - (d * Math.sin(h)) ** 2, 0)) -
            flatR;
          const clear = Math.max(INTERSECTION_RADIUS + 14, flatMid);
          const sag = d * Math.cos(h) - clear; // signed: + bows toward center
          const [sx, sy] = p(d, angleRad);
          const [ex, ey] = p(d, exitRad);
          // Circle through both endpoints and the bisector point at `clear`.
          const path =
            Math.abs(sag) < 0.5
              ? `M ${sx} ${sy} L ${ex} ${ey}`
              : (() => {
                  const R = ((d * Math.sin(h)) ** 2 + sag * sag) / (2 * Math.abs(sag));
                  return `M ${sx} ${sy} A ${R} ${R} 0 0 ${sag > 0 ? 1 : 0} ${ex} ${ey}`;
                })();
          const [mcx, mcy] = p(clear, midRad);
          const frLanes = Math.max(1, approach.freeRightLanes ?? 1);
          const roadWidth = 14 + (frLanes - 1) * 8;
          return (
            <g key={`fr-${idx}`}>
              <path d={path} fill="none" stroke="#e5e7eb" strokeWidth={roadWidth} strokeLinecap="butt" />
              <path d={path} fill="none" stroke="#9ca3af" strokeWidth="1.25" strokeDasharray="4 4" />
              {freeRightPedMarkings(frMode, {
                keyPrefix: `fr-mark-${idx}`,
                cx: mcx, cy: mcy, midRad, halfWidth: roadWidth / 2 + 2, scale: 1.35,
              })}
            </g>
          );
        })}

        {/* Center intersection */}
        <circle cx={CENTER_X} cy={CENTER_Y} r={INTERSECTION_RADIUS} fill="#f9fafb" stroke="#d1d5db" strokeWidth="2" />

        {/* Render detectors (advanced detectors scaled to fit the road) */}
        {placedDetectors.map(pd => renderPlacedDetector(pd))}
        {/* Distances from advanced detector rows to the stop bar */}
        {distanceLabels}
      </g>

      {/* Legend - Technology Types */}
      {uniqueTechTypes.length > 0 && (
        <g transform={`translate(15, ${viewBoxSize + 15})`}>
          <text x="0" y="0" fontSize="10" fill="#6b7280" fontWeight="500">Technology:</text>
          {uniqueTechTypes.map((tech, idx) => (
            <g key={tech} transform={`translate(${70 + idx * 95}, -4)`}>
              <rect x="0" y="-8" width="14" height="10" fill={getTechnologyColor(tech)} rx="2" stroke="#fff" strokeWidth="1" />
              <text x="18" y="0" fontSize="9" fill="#6b7280">{tech}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
