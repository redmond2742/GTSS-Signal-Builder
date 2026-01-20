import React from "react";

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

// Get setback distance in diagram units
const getSetbackOffset = (purpose: string, setback?: number, scale: number = 1): number => {
  let offset = 0;

  if (setback !== undefined && setback > 0) {
    offset = setback * 2; // Scale for visibility
  } else {
    switch (purpose) {
      case "Stop Bar":
        offset = 0;
        break;
      case "Advanced Loop":
        offset = 120;
        break;
      case "Count Detector":
        offset = 160;
        break;
      case "Extension":
        offset = 80;
        break;
      case "Dilemma Zone":
        offset = 200;
        break;
      default:
        offset = 0;
    }
  }

  return offset * scale;
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
  const SETBACK_SCALE = hasAdvancedDetectors ? 0.8 : 0.7;

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
      if (phase.movementType === "Left Turn" || phase.movementType === "Left" || phase.movementType === "Flashing Yellow Arrow") {
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
    const isLeft = phase.movementType === "Left Turn" || phase.movementType === "Left" || phase.movementType === "Flashing Yellow Arrow";
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

    // Add lane arrows in the middle of each lane
    for (let laneIdx = 0; laneIdx < numLanes; laneIdx++) {
      const laneOffset = ((laneIdx + 0.5) - numLanes / 2) * LANE_WIDTH;
      const arrowDist = roadStartDist + ROAD_LENGTH * 0.5;
      const arrowX = CENTER_X + arrowDist * Math.cos(angleRad) + laneOffset * Math.cos(perpAngle);
      const arrowY = CENTER_Y + arrowDist * Math.sin(angleRad) + laneOffset * Math.sin(perpAngle);

      // Determine arrow direction based on lane type
      // Through arrows should point UP (toward center in local coords), which gets rotated by adjustedBearing
      // Left/Right arrows are relative to the through direction
      let arrowDirection: 'up' | 'left' | 'right' | 'up-left' | 'up-right' = 'up';

      if (laneIdx < config.rightLanes) {
        arrowDirection = 'right';
      } else if (laneIdx < config.rightLanes + config.throughLanes) {
        // Through lanes - arrow points UP which will be rotated toward center
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
          transform={`rotate(${adjustedBearing}, ${arrowX}, ${arrowY})`}
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

  // Render detector
  const renderDetector = (detector: DetectorData, index: number) => {
    const approach = getApproachForPhase(detector.phase);
    if (!approach || approach.compassBearing === null) return null;

    const color = getTechnologyColor(detector.technologyType);

    const adjustedBearing = (approach.compassBearing + 180) % 360;
    const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
    const perpAngle = angleRad + Math.PI / 2;

    const setbackOffset = getSetbackOffset(detector.purpose, detector.stopbarSetbackDist, SETBACK_SCALE);
    const detectorDist = INTERSECTION_RADIUS + setbackOffset + 10;

    const laneOffset = getLaneOffset(detector);

    const detX = CENTER_X + detectorDist * Math.cos(angleRad) + laneOffset * Math.cos(perpAngle);
    const detY = CENTER_Y + detectorDist * Math.sin(angleRad) + laneOffset * Math.sin(perpAngle);

    const detWidth = 24; // Increased from 20
    const detHeight = 16; // Increased from 12

    return (
      <g key={`det-${index}`}>
        <rect
          x={detX - detWidth / 2}
          y={detY - detHeight / 2}
          width={detWidth}
          height={detHeight}
          fill={color}
          stroke="#ffffff"
          strokeWidth="2"
          rx="2"
          transform={`rotate(${adjustedBearing}, ${detX}, ${detY})`}
        />
        <text
          x={detX}
          y={detY + 4}
          textAnchor="middle"
          fontSize="10"
          fontWeight="bold"
          fill="#ffffff"
        >
          {detector.channel}
        </text>
      </g>
    );
  };

  // Get unique technology types for legend
  const uniqueTechTypes = [...new Set(detectors.map(d => d.technologyType))];

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

        {/* Center intersection */}
        <circle cx={CENTER_X} cy={CENTER_Y} r={INTERSECTION_RADIUS} fill="#f9fafb" stroke="#d1d5db" strokeWidth="2" />

        {/* Render detectors */}
        {detectors.map((detector, idx) => renderDetector(detector, idx))}
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
