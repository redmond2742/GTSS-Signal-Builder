import * as React from "react";

// Pedestrian markings drawn across a free-right slip lane, shared by every
// intersection diagram so FR-P and FR-P-I look identical everywhere.
//
//   frMode 2 (FR-P)   → a single dashed crosswalk across the lane.
//   frMode 3 (FR-P-I) → an "improved" traffic-calmed crossing: a ladder-style
//                       (continental) crosswalk plus a shark's-teeth yield
//                       line just upstream of it (facing approaching drivers).
//
// Geometry is expressed in a local frame at the point where the crossing sits
// on the lane (the arc midpoint): `midRad` is the radial angle from the
// diagram center outward, so the lane runs perpendicular to it. Offsets are
// given as (across, up) where `across` runs along the radial (spanning the
// lane width) and `up` runs upstream toward the approaching traffic.

export interface FreeRightMarkingOpts {
  keyPrefix: string;
  cx: number;
  cy: number;
  /** Radial angle (diagram center → crossing point), in radians. */
  midRad: number;
  /** Half the lane width (plus a little margin) the crossing should span. */
  halfWidth: number;
  /** Size multiplier for the FR-P-I ladder/teeth (default 1). */
  scale?: number;
  color?: string;
}

export function freeRightPedMarkings(
  frMode: number,
  opts: FreeRightMarkingOpts,
): React.ReactElement | null {
  if (frMode !== 2 && frMode !== 3) return null;

  const { keyPrefix, cx, cy, midRad, halfWidth, scale = 1, color = "#6b7280" } = opts;

  // Local unit vectors. `across` = radial (spans the lane); `up` = upstream,
  // toward the approach leg (the +angle side of the corner bisector).
  const ax = Math.cos(midRad);
  const ay = Math.sin(midRad);
  const ux = -Math.sin(midRad);
  const uy = Math.cos(midRad);
  const pt = (across: number, up: number): [number, number] => [
    cx + across * ax + up * ux,
    cy + across * ay + up * uy,
  ];

  const hw = halfWidth;

  if (frMode === 2) {
    // FR-P: one dashed line straight across the lane.
    const [x1, y1] = pt(-hw, 0);
    const [x2, y2] = pt(hw, 0);
    return (
      <line
        key={keyPrefix}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={2 * scale}
        strokeDasharray={`${2 * scale} ${1.5 * scale}`}
        opacity="0.85"
      />
    );
  }

  // FR-P-I: ladder crosswalk (two rails across the lane + longitudinal rungs)
  // and a shark's-teeth yield line upstream of it.
  const depth = 9 * scale;      // crosswalk band length along travel
  const halfDepth = depth / 2;
  const rungHalf = hw * 0.85;   // rungs stop just inside the lane edges
  const rungCount = 4;

  const rails = [halfDepth, -halfDepth].map((up, i) => {
    const [x1, y1] = pt(-hw, up);
    const [x2, y2] = pt(hw, up);
    return (
      <line
        key={`${keyPrefix}-rail-${i}`}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={1.4 * scale}
        opacity="0.9"
      />
    );
  });

  const rungs = Array.from({ length: rungCount }, (_, i) => {
    const across = -rungHalf + (2 * rungHalf * i) / (rungCount - 1);
    const [x1, y1] = pt(across, halfDepth);
    const [x2, y2] = pt(across, -halfDepth);
    return (
      <line
        key={`${keyPrefix}-rung-${i}`}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={2.4 * scale}
        strokeLinecap="butt"
        opacity="0.9"
      />
    );
  });

  // Shark's teeth: a row of small triangles just upstream of the crosswalk,
  // apexes pointing upstream toward the approaching driver (a yield line).
  const toothBase = halfDepth + 3.5 * scale; // base sits this far upstream
  const toothH = 4 * scale;
  const toothHalf = 2 * scale;
  const teethCount = 4;
  const teeth = Array.from({ length: teethCount }, (_, i) => {
    const nc = -rungHalf + (2 * rungHalf * i) / (teethCount - 1);
    const [bx1, by1] = pt(nc - toothHalf, toothBase);
    const [bx2, by2] = pt(nc + toothHalf, toothBase);
    const [apx, apy] = pt(nc, toothBase + toothH);
    return (
      <polygon
        key={`${keyPrefix}-tooth-${i}`}
        points={`${bx1},${by1} ${bx2},${by2} ${apx},${apy}`}
        fill={color}
        opacity="0.85"
      />
    );
  });

  return (
    <g key={keyPrefix}>
      {rails}
      {rungs}
      {teeth}
    </g>
  );
}
