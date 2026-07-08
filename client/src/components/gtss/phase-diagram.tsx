// Phase colors by phase number
export const phaseColors: Record<number, string> = {
  1: "#22c55e", // green
  2: "#3b82f6", // blue
  3: "#f97316", // orange
  4: "#8b5cf6", // purple
  5: "#ef4444", // red
  6: "#14b8a6", // teal
  7: "#eab308", // yellow
  8: "#ec4899", // pink
};

interface PhaseData {
  phase: number;
  approachId: string | null;
  movementType: string;
  // Integer pedestrian mode (0 = none); legacy booleans still accepted. This
  // compact diagram only draws a single crosswalk for any truthy value.
  isPedestrian: boolean | number | null;
}

interface ApproachData {
  approachId: string;
  compassBearing: number | null;
  /** FR — free right slip lane bypassing the signal:
   *   0 = none, 1 = FR, 2 = FR-P (with a pedestrian crossing).
   * Legacy booleans are coerced to 0/1. */
  freeRight?: boolean | number | null;
}

interface PhaseDiagramProps {
  phases: PhaseData[];
  approaches: ApproachData[];
  intersectionName?: string;
  svgRef?: React.RefObject<SVGSVGElement>;
  compact?: boolean;
}

export default function PhaseDiagram({ phases, approaches, intersectionName, svgRef, compact }: PhaseDiagramProps) {
  const getApproachBearing = (approachId: string | null): number | null => {
    if (!approachId) return null;
    const approach = approaches.find(a => a.approachId === approachId);
    return approach?.compassBearing ?? null;
  };

  const getMovementType = (movementType: string): 'straight' | 'left' | 'right' | 'uturn' | 'pedestrian' | 'leftThrough' | 'permissive' => {
    switch (movementType) {
      case 'Left Turn':
      case 'Flashing Yellow Arrow':
        return 'left';
      case 'Left Through Shared':
        return 'leftThrough';
      case 'Permissive Phase':
        return 'permissive';
      case 'Right Turn':
        return 'right';
      case 'U-Turn':
        return 'uturn';
      case 'Pedestrian':
        return 'pedestrian';
      default:
        return 'straight';
    }
  };

  const getPhaseOffset = (phase: PhaseData, index: number): number => {
    const sameApproachPhases = phases.filter(p => p.approachId === phase.approachId);
    const moveType = getMovementType(phase.movementType);

    let baseOffset = 0;
    if (moveType === 'left') baseOffset = 7;
    else if (moveType === 'right') baseOffset = -18;
    else if (moveType === 'straight') baseOffset = -7;
    else if (moveType === 'leftThrough') baseOffset = 0;
    else if (moveType === 'permissive') baseOffset = 0;

    const sameTypeCount = sameApproachPhases.filter(p => getMovementType(p.movementType) === moveType);
    const typeIndex = sameTypeCount.findIndex(p => p.phase === phase.phase);
    if (sameTypeCount.length > 1) {
      baseOffset += (typeIndex - (sameTypeCount.length - 1) / 2) * 8;
    }

    return baseOffset;
  };

  const renderPedestrianLine = (phase: PhaseData, index: number) => {
    const bearing = getApproachBearing(phase.approachId);
    if (bearing === null) return null;
    if (!phase.isPedestrian && phase.movementType !== 'Pedestrian') return null;

    const angleRad = (bearing - 90) * (Math.PI / 180);
    const perpAngle = angleRad + Math.PI / 2;

    const offsetDistance = 20;
    const centerX = 150 + offsetDistance * Math.cos(perpAngle);
    const centerY = 150 + offsetDistance * Math.sin(perpAngle);

    const lineHalfLength = 38;
    const x1 = centerX + lineHalfLength * Math.cos(angleRad);
    const y1 = centerY + lineHalfLength * Math.sin(angleRad);
    const x2 = centerX - lineHalfLength * Math.cos(angleRad);
    const y2 = centerY - lineHalfLength * Math.sin(angleRad);

    const color = phaseColors[phase.phase] || '#6b7280';

    return (
      <line
        key={`ped-${index}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth="2"
        strokeDasharray="4 3"
        opacity="0.6"
      />
    );
  };

  const renderArrow = (phase: PhaseData, index: number) => {
    const bearing = getApproachBearing(phase.approachId);
    if (bearing === null) return null;

    const moveType = getMovementType(phase.movementType);
    if (moveType === 'pedestrian') return null;

    const color = phaseColors[phase.phase] || '#6b7280';
    const strokeWidth = 3;

    const adjustedBearing = (bearing + 180) % 360;
    const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
    const perpAngle = angleRad + Math.PI / 2;

    const outerRadius = 105;
    const innerRadius = 48;

    const lateralOffset = getPhaseOffset(phase, index);
    const offsetX = lateralOffset * Math.cos(perpAngle);
    const offsetY = lateralOffset * Math.sin(perpAngle);

    const startX = 150 + outerRadius * Math.cos(angleRad) + offsetX;
    const startY = 150 + outerRadius * Math.sin(angleRad) + offsetY;
    const endX = 150 + innerRadius * Math.cos(angleRad) + offsetX;
    const endY = 150 + innerRadius * Math.sin(angleRad) + offsetY;

    if (moveType === 'left') {
      const bendPoint = 0.4;
      const bendX = startX + (endX - startX) * (1 - bendPoint);
      const bendY = startY + (endY - startY) * (1 - bendPoint);
      const tipLength = 22;
      const leftPerpAngle = angleRad + Math.PI / 2;
      const tipX = bendX + tipLength * Math.cos(leftPerpAngle);
      const tipY = bendY + tipLength * Math.sin(leftPerpAngle);

      return (
        <g key={index}>
          <line x1={startX} y1={startY} x2={bendX} y2={bendY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <line x1={bendX} y1={bendY} x2={tipX} y2={tipY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd={`url(#arrowhead-${phase.phase})`} />
        </g>
      );
    }

    if (moveType === 'right') {
      const bendPoint = 0.4;
      const bendX = startX + (endX - startX) * (1 - bendPoint);
      const bendY = startY + (endY - startY) * (1 - bendPoint);
      const tipLength = 22;
      const rightPerpAngle = angleRad - Math.PI / 2;
      const tipX = bendX + tipLength * Math.cos(rightPerpAngle);
      const tipY = bendY + tipLength * Math.sin(rightPerpAngle);

      return (
        <g key={index}>
          <line x1={startX} y1={startY} x2={bendX} y2={bendY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <line x1={bendX} y1={bendY} x2={tipX} y2={tipY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd={`url(#arrowhead-${phase.phase})`} />
        </g>
      );
    }

    if (moveType === 'uturn') {
      const leftPerpAngle = angleRad + Math.PI / 2;
      const backAngle = angleRad + Math.PI;
      const stemEndX = startX + (endX - startX) * 0.7;
      const stemEndY = startY + (endY - startY) * 0.7;
      const hookOffset = 12;
      const hookX = stemEndX + hookOffset * Math.cos(leftPerpAngle);
      const hookY = stemEndY + hookOffset * Math.sin(leftPerpAngle);
      const arrowLength = 16;
      const arrowStartX = hookX - 12 * Math.cos(backAngle);
      const arrowStartY = hookY - 12 * Math.sin(backAngle);
      const arrowEndX = arrowStartX + arrowLength * Math.cos(backAngle);
      const arrowEndY = arrowStartY + arrowLength * Math.sin(backAngle);

      return (
        <g key={index}>
          <line x1={startX} y1={startY} x2={stemEndX} y2={stemEndY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <line x1={stemEndX} y1={stemEndY} x2={arrowStartX} y2={arrowStartY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <line x1={arrowEndX} y1={arrowEndY} x2={arrowStartX} y2={arrowStartY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd={`url(#arrowhead-${phase.phase})`} />
        </g>
      );
    }

    if (moveType === 'leftThrough') {
      const leftPerpAngle = angleRad + Math.PI / 2;
      const splitX = startX + (endX - startX) * 0.65;
      const splitY = startY + (endY - startY) * 0.65;
      const leftTipLength = 20;
      const leftTipX = splitX + leftTipLength * Math.cos(leftPerpAngle);
      const leftTipY = splitY + leftTipLength * Math.sin(leftPerpAngle);

      return (
        <g key={index}>
          <line x1={startX} y1={startY} x2={splitX} y2={splitY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <line x1={splitX} y1={splitY} x2={endX} y2={endY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd={`url(#arrowhead-${phase.phase})`} />
          <line x1={splitX} y1={splitY} x2={leftTipX} y2={leftTipY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd={`url(#arrowhead-${phase.phase})`} />
        </g>
      );
    }

    if (moveType === 'permissive') {
      const leftPerpAngle = angleRad + Math.PI / 2;
      const splitX = startX + (endX - startX) * 0.65;
      const splitY = startY + (endY - startY) * 0.65;
      const leftTipLength = 20;
      const leftTipX = splitX + leftTipLength * Math.cos(leftPerpAngle);
      const leftTipY = splitY + leftTipLength * Math.sin(leftPerpAngle);

      return (
        <g key={index}>
          <line x1={splitX} y1={splitY} x2={leftTipX} y2={leftTipY} stroke="#9ca3af" strokeWidth={strokeWidth} strokeLinecap="round" markerEnd="url(#arrowhead-grey)" />
          <line x1={startX} y1={startY} x2={endX} y2={endY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd={`url(#arrowhead-${phase.phase})`} />
        </g>
      );
    }

    return (
      <line key={index} x1={startX} y1={startY} x2={endX} y2={endY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd={`url(#arrowhead-${phase.phase})`} />
    );
  };

  const renderLabel = (phase: PhaseData, index: number) => {
    const bearing = getApproachBearing(phase.approachId);
    if (bearing === null) return null;

    const adjustedBearing = (bearing + 180) % 360;
    const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
    const perpAngle = angleRad + Math.PI / 2;

    const lateralOffset = getPhaseOffset(phase, index);
    const offsetX = lateralOffset * Math.cos(perpAngle);
    const offsetY = lateralOffset * Math.sin(perpAngle);

    const labelRadius = 135;
    const labelX = 150 + labelRadius * Math.cos(angleRad) + offsetX;
    const labelY = 150 + labelRadius * Math.sin(angleRad) + offsetY;
    const color = phaseColors[phase.phase] || '#6b7280';

    return (
      <text key={`label-${index}`} x={labelX} y={labelY + 4} textAnchor="middle" fontSize="14" fontWeight="bold" fill={color}>
        {phase.phase}
      </text>
    );
  };

  return (
    <svg ref={svgRef} viewBox="-20 0 340 360" className="w-full h-full">
      <defs>
        {Object.entries(phaseColors).map(([phase, color]) => (
          <marker key={phase} id={`arrowhead-${phase}`} markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto">
            <polygon points="0 0, 6 2.5, 0 5" fill={color} />
          </marker>
        ))}
        <marker id="arrowhead-grey" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto">
          <polygon points="0 0, 6 2.5, 0 5" fill="#9ca3af" />
        </marker>
      </defs>

      {intersectionName && !compact && (
        <text x="150" y="18" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#374151">
          {intersectionName}
        </text>
      )}

      <g transform={intersectionName && !compact ? "translate(0, 20)" : ""}>
        <circle cx="150" cy="150" r="115" fill="none" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />
        <circle cx="150" cy="150" r="42" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="2" />

        <text x="150" y="22" textAnchor="middle" fontSize="11" fill="#9ca3af">N</text>
        <text x="280" y="154" textAnchor="middle" fontSize="11" fill="#9ca3af">E</text>
        <text x="150" y="288" textAnchor="middle" fontSize="11" fill="#9ca3af">S</text>
        <text x="20" y="154" textAnchor="middle" fontSize="11" fill="#9ca3af">W</text>

        {approaches.map((approach, idx) => {
          if (approach.compassBearing === null) return null;
          const adjustedBearing = (approach.compassBearing + 180) % 360;
          const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
          const outerX = 150 + 115 * Math.cos(angleRad);
          const outerY = 150 + 115 * Math.sin(angleRad);
          const innerX = 150 + 44 * Math.cos(angleRad);
          const innerY = 150 + 44 * Math.sin(angleRad);
          return (
            <line key={idx} x1={outerX} y1={outerY} x2={innerX} y2={innerY} stroke="#e5e7eb" strokeWidth="20" strokeLinecap="butt" />
          );
        })}

        {/* FR — free right slip lanes: a quarter-circle arc peeling off the
            approach leg to the right, joining the perpendicular exit leg.
            Mode 2 (FR-P) adds a pedestrian crosswalk across the arc's middle. */}
        {approaches.map((approach, idx) => {
          const frMode = typeof approach.freeRight === "number"
            ? approach.freeRight
            : (approach.freeRight ? 1 : 0);
          if (frMode === 0 || approach.compassBearing === null) return null;
          const adjustedBearing = (approach.compassBearing + 180) % 360;
          const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
          const rightRad = angleRad - Math.PI / 2;
          const midRad = angleRad - Math.PI / 4;
          const p = (r: number, a: number) => [150 + r * Math.cos(a), 150 + r * Math.sin(a)];
          const d = 98;        // peel-off / merge radius on each leg
          const R = d * 1.35;  // arc radius — slightly flatter than a tangent
                               // quarter circle so it clears the central island
          const [sx, sy] = p(d, angleRad);
          const [ex, ey] = p(d, rightRad);
          const path = `M ${sx} ${sy} A ${R} ${R} 0 0 1 ${ex} ${ey}`;
          const arcMid = (Math.SQRT2 * d + Math.sqrt(4 * R * R - 2 * d * d)) / 2 - R;
          const [lx, ly] = p(arcMid + 13, midRad);
          const [cwx1, cwy1] = p(arcMid - 7, midRad);
          const [cwx2, cwy2] = p(arcMid + 7, midRad);
          return (
            <g key={`fr-${idx}`}>
              <path d={path} fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="butt" />
              <path d={path} fill="none" stroke="#9ca3af" strokeWidth="1.25" strokeDasharray="3 3" markerEnd="url(#arrowhead-grey)" />
              {frMode === 2 && (
                <line
                  x1={cwx1} y1={cwy1} x2={cwx2} y2={cwy2}
                  stroke="#6b7280"
                  strokeWidth="2"
                  strokeDasharray="2 1.5"
                  opacity="0.85"
                />
              )}
              <text x={lx} y={ly + 3} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#9ca3af">
                {frMode === 2 ? "FR-P" : "FR"}
              </text>
            </g>
          );
        })}

        {phases.filter(p => p.isPedestrian || p.movementType === 'Pedestrian').map((phase, idx) => renderPedestrianLine(phase, idx))}
        {phases.map((phase, idx) => renderArrow(phase, idx))}
        {phases.map((phase, idx) => renderLabel(phase, idx))}
      </g>
    </svg>
  );
}
