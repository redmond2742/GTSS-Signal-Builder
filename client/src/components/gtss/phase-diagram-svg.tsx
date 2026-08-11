import * as React from "react";
import { freeRightPedMarkings } from "./free-right-markings";

// Phase colors by phase number — shared across the bulk phase modal,
// the signal-details persistent diagram, and the map polyline overlay.
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

// Input types are permissive so callers can pass either the in-memory
// PendingPhase from a bulk-edit form or the looser Phase row from storage.
export interface PhaseDiagramPhase {
  phase: number;
  approachId: string | null;
  movementType: string;
  /** Pedestrian crossing mode:
   *   0 = none, 1 = on assigned approach, 2 = on opposite approach,
   *   3 = diagonal, 4 = diagonal shifted 90°.
   * Legacy boolean values are coerced to 0/1 in callers. */
  isPedestrian?: boolean | number | null;
}

export interface PhaseDiagramApproach {
  approachId: string;
  compassBearing: number | null;
  streetName?: string;
  /** FR — free right slip lane that branches off to the right before the
   * intersection, bypassing the signal:
   *   0 = none, 1 = FR, 2 = FR-P, 3 = FR-P-I.
   * Legacy booleans are coerced to 0/1. */
  freeRight?: boolean | number | null;
  /** Number of free-right lanes (widens the drawn slip lane). */
  freeRightLanes?: number | null;
}

export interface PhaseDiagramProps {
  phases: PhaseDiagramPhase[];
  approaches: PhaseDiagramApproach[];
  intersectionName?: string;
  /** Signal/intersection ID shown large in the center of the diagram. */
  intersectionId?: string;
  svgRef?: React.RefObject<SVGSVGElement>;
}

// Fallback palette used only for streets that don't have any phase assigned
// yet (so the legend still shows distinct colors before phases exist).
const STREET_PALETTE = ["#0ea5e9", "#f59e0b", "#16a34a", "#db2777", "#7c3aed", "#0d9488"];

// --- Header text wrapping -------------------------------------------------
// SVG doesn't wrap text, so long titles / street lists would run past the
// canvas edge and get clipped. We measure with an approximation (no layout
// engine is available while building the element tree) and break the header
// onto as many lines as it needs; the diagram below shifts down to match.
const HEADER_MAX_WIDTH = 320; // viewBox is 340 wide — leave a small margin
const TITLE_FONT = 14;
const TITLE_LINE_H = 16;
const STREET_FONT = 12;
const STREET_LINE_H = 14;

// Average glyph advance for the bold sans-serif used in the header.
const estTextWidth = (text: string, fontSize: number) => text.length * fontSize * 0.58;

// Break a plain string onto lines at word boundaries.
const wrapWords = (text: string, fontSize: number, maxWidth: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  words.forEach(word => {
    const candidate = current ? `${current} ${word}` : word;
    if (current && estTextWidth(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines;
};

// Pack the street names (each keeps its own color) into lines separated by
// " · ", stacking onto a new line rather than overflowing.
const packStreets = (names: string[], fontSize: number, maxWidth: number): string[][] => {
  if (names.length === 0) return [];
  const separatorWidth = estTextWidth(" · ", fontSize);
  const lines: string[][] = [];
  let current: string[] = [];
  let currentWidth = 0;
  names.forEach(name => {
    const width = estTextWidth(name, fontSize);
    const added = current.length > 0 ? separatorWidth + width : width;
    if (current.length > 0 && currentWidth + added > maxWidth) {
      lines.push(current);
      current = [name];
      currentWidth = width;
    } else {
      current.push(name);
      currentWidth += added;
    }
  });
  if (current.length > 0) lines.push(current);
  return lines;
};

export const PhaseDiagram = ({ phases, approaches, intersectionName, intersectionId, svgRef }: PhaseDiagramProps) => {
  // Unique street names (in approach order).
  const uniqueStreets = Array.from(
    new Set(approaches.map(a => (a.streetName || "").trim()).filter(Boolean))
  );

  // Color each street to match the phase(s) running on it. A street can carry
  // several phases, so we pick a representative: prefer a through movement,
  // otherwise the lowest phase number. Streets with no phases yet fall back to
  // the neutral palette so the legend still distinguishes them.
  const colorForStreet = (street: string, fallbackIndex: number): string => {
    const approachIds = approaches
      .filter(a => (a.streetName || "").trim() === street)
      .map(a => a.approachId);
    // Only vehicle phases name a street — pedestrian-only phases are excluded
    // so a crosswalk-only phase can't drive the street's color/legend entry.
    const streetPhases = phases.filter(
      p =>
        p.approachId != null &&
        approachIds.includes(p.approachId) &&
        p.movementType !== "Pedestrian",
    );
    if (streetPhases.length > 0) {
      const through = streetPhases.filter(
        p => p.movementType === "Through" || p.movementType === "Through-Right",
      );
      const pool = through.length > 0 ? through : streetPhases;
      const rep = pool.reduce((min, p) => (p.phase < min.phase ? p : min), pool[0]);
      return phaseColors[rep.phase] || STREET_PALETTE[fallbackIndex % STREET_PALETTE.length];
    }
    return STREET_PALETTE[fallbackIndex % STREET_PALETTE.length];
  };

  const getApproachBearing = (approachId: string | null): number | null => {
    if (!approachId) return null;
    const approach = approaches.find(a => a.approachId === approachId);
    return approach?.compassBearing ?? null;
  };

  const getMovementType = (movementType: string): 'straight' | 'left' | 'right' | 'uturn' | 'pedestrian' | 'leftThrough' | 'permissive' => {
    switch (movementType) {
      case 'Left Turn':
      case 'Left Protected-Permissive':
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

  // Count phases by approach and movement type to calculate offsets
  // With 180° bearing adjustment, perpAngle points LEFT, so positive = left
  const getPhaseOffset = (phase: PhaseDiagramPhase): number => {
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

  // Radius of the central intersection circle. Diagonal pedestrian crossings
  // (modes 4, 5, 6) are sized so the line endpoints fall on this circle.
  const CENTER_RADIUS = 42;

  // Coerce legacy boolean to the integer scheme.
  const pedMode = (phase: PhaseDiagramPhase): number => {
    if (typeof phase.isPedestrian === "number") return phase.isPedestrian;
    return phase.isPedestrian ? 1 : 0;
  };

  // Build a single perpendicular crosswalk dash for a given bearing. Shared by
  // modes 1 (assigned), 2 (both — emits twice), and 3 (opposite).
  const crosswalkDashAt = (bearing: number, color: string, key: string) => {
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
    return (
      <line
        key={key}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth="2"
        strokeDasharray="4 3"
        opacity="0.7"
      />
    );
  };

  const renderPedestrianLine = (phase: PhaseDiagramPhase, index: number) => {
    // Pedestrian crossing rendering driven by the integer mode. Applies to
    // both vehicle phases (as a pedestrian indicator) AND to Pedestrian-only
    // phases (movementType === 'Pedestrian') — the integer is the single
    // source of truth for what gets drawn.
    //   0 = none
    //   1 = crosswalk on the assigned approach
    //   2 = two crosswalks (assigned + 180° opposite)
    //   3 = single crosswalk on the 180° opposite approach
    //   4 = single diagonal crosswalk ("\")
    //   5 = single diagonal crosswalk ("/" — 90° rotated from mode 4)
    //   6 = both diagonals shown simultaneously (full scramble "X")
    //   7 = all four crosswalks AND both diagonals (full all-directions scramble)
    const mode = pedMode(phase);
    if (mode === 0) return null;
    const bearing = getApproachBearing(phase.approachId);
    if (bearing === null) return null;
    const color = phaseColors[phase.phase] || '#6b7280';

    if (mode === 1) {
      return crosswalkDashAt(bearing, color, `ped-${index}-near`);
    }
    if (mode === 2) {
      // Two crosswalks: one on the assigned approach, one on the opposite.
      return (
        <g key={`ped-${index}`}>
          {crosswalkDashAt(bearing, color, `ped-${index}-near`)}
          {crosswalkDashAt((bearing + 180) % 360, color, `ped-${index}-far`)}
        </g>
      );
    }
    if (mode === 3) {
      // Single crosswalk on the opposite approach only.
      return crosswalkDashAt((bearing + 180) % 360, color, `ped-${index}-far`);
    }

    // Modes 4, 5, 6 — diagonal pedestrian crossings through the central
    // intersection circle. Mode 4 is "\" (top-left to bottom-right);
    // mode 5 is "/" (top-right to bottom-left, 90° rotation of mode 4);
    // mode 6 draws BOTH diagonals at the same time forming an "X".
    const d = CENTER_RADIUS / Math.SQRT2;
    const diagonal = (dir: 1 | -1, key: string) => (
      <line
        key={key}
        x1={150 - d * dir} y1={150 - d}
        x2={150 + d * dir} y2={150 + d}
        stroke={color}
        strokeWidth="2"
        strokeDasharray="5 4"
        opacity="0.7"
      />
    );

    if (mode === 6) {
      return (
        <g key={`ped-${index}`}>
          {diagonal(1, `ped-${index}-d1`)}
          {diagonal(-1, `ped-${index}-d2`)}
        </g>
      );
    }

    if (mode === 7) {
      // Full all-directions scramble: every parallel crosswalk + both diagonals.
      return (
        <g key={`ped-${index}`}>
          {crosswalkDashAt(bearing, color, `ped-${index}-n`)}
          {crosswalkDashAt((bearing + 90) % 360, color, `ped-${index}-e`)}
          {crosswalkDashAt((bearing + 180) % 360, color, `ped-${index}-s`)}
          {crosswalkDashAt((bearing + 270) % 360, color, `ped-${index}-w`)}
          {diagonal(1, `ped-${index}-d1`)}
          {diagonal(-1, `ped-${index}-d2`)}
        </g>
      );
    }

    const dir = mode === 4 ? 1 : -1;
    return diagonal(dir, `ped-${index}`);
  };

  const renderArrow = (phase: PhaseDiagramPhase, index: number) => {
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
    const lateralOffset = getPhaseOffset(phase);
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

      // LPP — protected-permissive left: the whole arrow shaft is dashed.
      const isLpp = phase.movementType === 'Left Protected-Permissive';
      // FYA — flashing yellow arrow: the turning segment is drawn in yellow
      // with a yellow head, dashed so it reads as flashing on and off.
      const isFya = phase.movementType === 'Flashing Yellow Arrow';

      return (
        <g key={index}>
          <line
            x1={startX} y1={startY} x2={bendX} y2={bendY}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={isLpp ? '6 5' : undefined}
          />
          <line
            x1={bendX} y1={bendY} x2={tipX} y2={tipY}
            stroke={isFya ? '#eab308' : color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={isLpp ? '6 5' : isFya ? '4 4' : undefined}
            markerEnd={isFya ? 'url(#arrowhead-fya)' : `url(#arrowhead-${phase.phase})`}
          />
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
      const throughTipX = endX;
      const throughTipY = endY;
      const leftTipLength = 20;
      const leftTipX = splitX + leftTipLength * Math.cos(leftPerpAngle);
      const leftTipY = splitY + leftTipLength * Math.sin(leftPerpAngle);

      return (
        <g key={index}>
          <line x1={startX} y1={startY} x2={splitX} y2={splitY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <line x1={splitX} y1={splitY} x2={throughTipX} y2={throughTipY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd={`url(#arrowhead-${phase.phase})`} />
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

    // Straight (Through, Through-Right)
    return (
      <line key={index} x1={startX} y1={startY} x2={endX} y2={endY} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" markerEnd={`url(#arrowhead-${phase.phase})`} />
    );
  };

  const renderLabel = (phase: PhaseDiagramPhase, index: number) => {
    const bearing = getApproachBearing(phase.approachId);
    if (bearing === null) return null;

    const adjustedBearing = (bearing + 180) % 360;
    const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
    const perpAngle = angleRad + Math.PI / 2;
    const lateralOffset = getPhaseOffset(phase);
    const offsetX = lateralOffset * Math.cos(perpAngle);
    const offsetY = lateralOffset * Math.sin(perpAngle);
    const labelRadius = 135;
    const labelX = 150 + labelRadius * Math.cos(angleRad) + offsetX;
    const labelY = 150 + labelRadius * Math.sin(angleRad) + offsetY;
    const color = phaseColors[phase.phase] || '#6b7280';

    return (
      <text
        key={`label-${index}`}
        x={labelX}
        y={labelY + 4}
        textAnchor="middle"
        fontSize="14"
        fontWeight="bold"
        fill={color}
      >
        {phase.phase}
      </text>
    );
  };

  // Header layout. Extra title / street lines push the intersection drawing
  // down and grow the canvas, so nothing is clipped and the diagram keeps its
  // original position when everything fits on one line.
  const titleLines = intersectionName ? wrapWords(intersectionName, TITLE_FONT, HEADER_MAX_WIDTH) : [];
  const streetLines = packStreets(uniqueStreets, STREET_FONT, HEADER_MAX_WIDTH);
  const titleExtra = Math.max(0, titleLines.length - 1) * TITLE_LINE_H;
  const streetExtra = Math.max(0, streetLines.length - 1) * STREET_LINE_H;
  const streetTop = 35 + titleExtra;
  const diagramTop = 42 + titleExtra + streetExtra;
  const canvasHeight = 384 + titleExtra + streetExtra;

  return (
    <svg ref={svgRef} viewBox={`-20 0 340 ${canvasHeight}`} className="w-full h-full">
      <defs>
        {Object.entries(phaseColors).map(([phase, color]) => (
          <marker
            key={phase}
            id={`arrowhead-${phase}`}
            markerWidth="6"
            markerHeight="5"
            refX="5"
            refY="2.5"
            orient="auto"
          >
            <polygon points="0 0, 6 2.5, 0 5" fill={color} />
          </marker>
        ))}
        <marker
          id="arrowhead-grey"
          markerWidth="6"
          markerHeight="5"
          refX="5"
          refY="2.5"
          orient="auto"
        >
          <polygon points="0 0, 6 2.5, 0 5" fill="#9ca3af" />
        </marker>
        {/* Yellow head for Flashing Yellow Arrow left turns */}
        <marker
          id="arrowhead-fya"
          markerWidth="6"
          markerHeight="5"
          refX="5"
          refY="2.5"
          orient="auto"
        >
          <polygon points="0 0, 6 2.5, 0 5" fill="#eab308" />
        </marker>
      </defs>

      {titleLines.map((line, i) => (
        <text
          key={`title-${i}`}
          x="150"
          y={16 + i * TITLE_LINE_H}
          textAnchor="middle"
          fontSize={TITLE_FONT}
          fontWeight="bold"
          fill="#374151"
        >
          {line}
        </text>
      ))}

      {/* Street names colored to match the phase(s) running on each street,
          stacked onto extra lines when they don't fit. Rendered into the SVG
          so the colors are captured on image download. */}
      {streetLines.map((lineNames, lineIdx) => (
        <text
          key={`streets-${lineIdx}`}
          x="150"
          y={streetTop + lineIdx * STREET_LINE_H}
          textAnchor="middle"
          fontSize={STREET_FONT}
          fontWeight="700"
        >
          {lineNames.map((name, i) => (
            <React.Fragment key={`street-${lineIdx}-${i}`}>
              {i > 0 && <tspan fill="#9ca3af"> · </tspan>}
              <tspan fill={colorForStreet(name, uniqueStreets.indexOf(name))}>{name}</tspan>
            </React.Fragment>
          ))}
        </text>
      ))}

      <g transform={`translate(0, ${diagramTop})`}>
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

        {/* FR — free right slip lanes. An arc that peels off the approach leg
            and sweeps right, departing onto the neighboring approach's actual
            leg (so the sweep angle follows the real compass bearings rather
            than assuming a perpendicular street). Mode 2 (FR-P) adds a
            pedestrian crosswalk across the arc's middle; mode 3 (FR-P-I) adds a
            traffic-calmed ladder crosswalk with a shark's-teeth yield line. */}
        {approaches.map((approach, idx) => {
          const frMode = typeof approach.freeRight === "number"
            ? approach.freeRight
            : (approach.freeRight ? 1 : 0);
          if (frMode === 0 || approach.compassBearing === null) return null;
          const adjustedBearing = (approach.compassBearing + 180) % 360;
          const angleRad = (adjustedBearing - 90) * (Math.PI / 180);
          // angleRad points from center to the outer end of the leg; traffic
          // flows inward, so right-turn exit legs sit clockwise of the leg.
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
          const exitRad = angleRad - sweep;    // departure (exit leg) direction
          const midRad = angleRad - sweep / 2; // bisector of the corner
          const p = (r: number, a: number) => [150 + r * Math.cos(a), 150 + r * Math.sin(a)];
          const d = 98;         // peel-off / merge radius on each leg
          const h = sweep / 2;
          // Preferred arc: 1.35× the tangent fillet radius for the corner
          // angle. Its closest approach to the center is pushed out to a
          // minimum clearance so wide corners never clip the central island.
          const flatR = 1.35 * d * Math.tan(h);
          const flatMid =
            d * Math.cos(h) +
            Math.sqrt(Math.max(flatR * flatR - (d * Math.sin(h)) ** 2, 0)) -
            flatR;
          const clear = Math.max(50, flatMid); // island 42 + roadbed + margin
          const sag = d * Math.cos(h) - clear; // signed: + bows toward center
          const [sx, sy] = p(d, angleRad);     // peel-off point on the approach leg
          const [ex, ey] = p(d, exitRad);      // merge point on the exit leg
          // Circle through both endpoints and the bisector point at `clear`.
          const path =
            Math.abs(sag) < 0.5
              ? `M ${sx} ${sy} L ${ex} ${ey}`
              : (() => {
                  const R = ((d * Math.sin(h)) ** 2 + sag * sag) / (2 * Math.abs(sag));
                  return `M ${sx} ${sy} A ${R} ${R} 0 0 ${sag > 0 ? 1 : 0} ${ex} ${ey}`;
                })();
          const [mcx, mcy] = p(clear, midRad); // crossing point at the arc midpoint
          // Roadbed widens with the number of free-right lanes.
          const frLanes = Math.max(1, approach.freeRightLanes ?? 1);
          const roadWidth = 10 + (frLanes - 1) * 6;
          return (
            <g key={`fr-${idx}`}>
              <path d={path} fill="none" stroke="#e5e7eb" strokeWidth={roadWidth} strokeLinecap="butt" />
              <path d={path} fill="none" stroke="#9ca3af" strokeWidth="1.25" strokeDasharray="3 3" />
              {freeRightPedMarkings(frMode, {
                keyPrefix: `fr-mark-${idx}`,
                cx: mcx, cy: mcy, midRad, halfWidth: roadWidth / 2 + 2, scale: 1,
              })}
            </g>
          );
        })}

        {/* Pedestrian crossings (integer-mode driven, including Pedestrian-only phases) */}
        {phases.map((phase, idx) => renderPedestrianLine(phase, idx))}
        {phases.map((phase, idx) => renderArrow(phase, idx))}

        {/* Intersection ID, scaled to sit within the central crosswalk box */}
        {intersectionId && (() => {
          const maxWidth = 70; // stay within the central circle / crosswalk lines
          const fontSize = Math.max(10, Math.min(38, maxWidth / (intersectionId.length * 0.62)));
          return (
            <text
              x={150}
              y={150 + fontSize * 0.34}
              textAnchor="middle"
              fontSize={fontSize}
              fontWeight="bold"
              fill="#6b7280"
            >
              {intersectionId}
            </text>
          );
        })()}

        {/* Outer phase-number labels (skip pedestrian-only — the scramble has its own) */}
        {phases
          .filter(p => p.movementType !== 'Pedestrian')
          .map((phase, idx) => renderLabel(phase, idx))}
      </g>
    </svg>
  );
};

export default PhaseDiagram;
