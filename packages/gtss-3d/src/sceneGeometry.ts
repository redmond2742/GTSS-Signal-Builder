import type { IntersectionLayout, SlipLane } from "./layout";
import { intersectLines, legPoint, type Corner, type Leg } from "./legLayout";
import type { Vec2 } from "./types";

const CURVE_SAMPLES = 16;
const SLIP_SAMPLES = 40;

export function quadraticBezier(p0: Vec2, c: Vec2, p1: Vec2, samples: number): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    points.push({ x: a * p0.x + b * c.x + d * p1.x, z: a * p0.z + b * c.z + d * p1.z });
  }
  return points;
}

const dot = (p: Vec2, v: Vec2) => p.x * v.x + p.z * v.z;

/** Curb return between leg a (+t curb at distance sA) and leg b (-t curb at sB), from a to b. */
function curbReturn(a: Leg, b: Leg, corner: Corner, sA: number, sB: number): Vec2[] {
  const from = legPoint(a, a.roadT1, sA);
  const to = legPoint(b, b.roadT0, sB);
  if (!corner.curbVertex || corner.theta >= 175) return [from, to];
  return [
    from,
    ...quadraticBezier(
      legPoint(a, a.roadT1, corner.filletA),
      corner.curbVertex,
      legPoint(b, b.roadT0, corner.filletB),
      CURVE_SAMPLES,
    ),
    to,
  ];
}

/** Outline of the paved area between the leg mouths, clockwise from above. */
export function coreOutline(layout: IntersectionLayout): Vec2[] {
  const { legs, corners } = layout;
  const points: Vec2[] = [];
  corners.forEach((corner) => {
    const a = legs[corner.a];
    const b = legs[corner.b];
    points.push(legPoint(a, a.roadT0, a.mouth));
    points.push(...curbReturn(a, b, corner, a.mouth, b.mouth));
  });
  const close = (p: Vec2, q: Vec2) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-4;
  const unique = points.filter((p, i) => i === 0 || !close(p, points[i - 1]));
  if (unique.length > 1 && close(unique[0], unique[unique.length - 1])) unique.pop();
  return unique;
}

const dedupe = (points: Vec2[]) =>
  points.filter(
    (p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) > 1e-4,
  );

/** Raised sidewalk area filling a corner between two legs' sidewalks; null when not applicable. */
export function cornerPadOutline(layout: IntersectionLayout, corner: Corner): Vec2[] | null {
  const a = layout.legs[corner.a];
  const b = layout.legs[corner.b];
  const hasA = a.t1 > a.roadT1 + 0.1;
  const hasB = b.roadT0 > b.t0 + 0.1;
  if (!hasA && !hasB) return null;
  const sA = layout.plans[corner.a].sidewalkStartPos;
  const sB = layout.plans[corner.b].sidewalkStartNeg;
  const slip = layout.slips.find((s) => s.cornerIndex === corner.index);
  if (slip && corner.curbVertex) {
    // Sidewalk sweeping around the outside of the slip lane.
    const outer = quadraticBezier(
      legPoint(a, a.t1, sA),
      corner.outerVertex ?? corner.curbVertex,
      legPoint(b, b.t0, sB),
      CURVE_SAMPLES * 2,
    );
    const curb = quadraticBezier(
      legPoint(a, a.roadT1, sA),
      corner.curbVertex,
      legPoint(b, b.roadT0, sB),
      CURVE_SAMPLES * 2,
    );
    return [...outer, ...curb.reverse()];
  }
  if (corner.theta < 175 && corner.curbVertex) {
    const outline = [legPoint(a, a.t1, sA)];
    if (corner.outerVertex) outline.push(corner.outerVertex);
    outline.push(legPoint(b, b.t0, sB));
    outline.push(...curbReturn(a, b, corner, sA, sB).reverse());
    return dedupe(outline);
  }
  if (corner.theta <= 185) {
    return [
      legPoint(a, a.roadT1, sA),
      legPoint(a, a.t1, sA),
      legPoint(b, b.t0, sB),
      legPoint(b, b.roadT0, sB),
    ];
  }
  return null;
}

export interface SlipGeometry {
  slip: SlipLane;
  /** Edge samples ordered from the entry (approach leg) to the exit leg. */
  inner: Vec2[];
  outer: Vec2[];
  /** Raised or painted island between the core curb return and the slip lane, if any. */
  island: Vec2[] | null;
}

export function slipGeometry(layout: IntersectionLayout, slip: SlipLane): SlipGeometry | null {
  const corner = layout.corners[slip.cornerIndex];
  if (!corner?.curbVertex) return null;
  const a = layout.legs[corner.a];
  const b = layout.legs[corner.b];
  const w = slip.width;
  const outer = quadraticBezier(
    legPoint(a, a.roadT1, a.mouth + slip.reach),
    corner.curbVertex,
    legPoint(b, b.roadT0, b.mouth + slip.reach),
    SLIP_SAMPLES,
  );
  const innerVertex =
    intersectLines(legPoint(a, a.roadT1 - w, 0), a.u, legPoint(b, b.roadT0 + w, 0), b.u)?.point ??
    corner.curbVertex;
  const inner = quadraticBezier(
    legPoint(a, a.roadT1 - w, a.mouth + slip.reach),
    innerVertex,
    legPoint(b, b.roadT0 + w, b.mouth + slip.reach),
    SLIP_SAMPLES,
  );

  const outsideA = (p: Vec2) => dot(p, a.r) - a.roadT1;
  const outsideB = (p: Vec2) => b.roadT0 - dot(p, b.r);
  const kept: number[] = [];
  inner.forEach((p, i) => {
    if (outsideA(p) > 0 && outsideB(p) > 0) kept.push(i);
  });
  let island: Vec2[] | null = null;
  if (kept.length >= 2) {
    const first = kept[0];
    const last = kept[kept.length - 1];
    const lerp = (p: Vec2, q: Vec2, fp: number, fq: number) => {
      const t = fp / (fp - fq);
      return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t };
    };
    const startCross =
      first > 0
        ? lerp(inner[first - 1], inner[first], outsideA(inner[first - 1]), outsideA(inner[first]))
        : inner[first];
    const endCross =
      last < inner.length - 1
        ? lerp(inner[last], inner[last + 1], outsideB(inner[last]), outsideB(inner[last + 1]))
        : inner[last];
    island = dedupe([
      startCross,
      ...inner.slice(first, last + 1),
      endCross,
      ...curbReturn(a, b, corner, a.mouth, b.mouth).reverse(),
    ]);
  }

  // Order from the entry leg so textures read in the direction of travel.
  const entryIsA = slip.legIndex === corner.a;
  return {
    slip,
    inner: entryIsA ? inner : [...inner].reverse(),
    outer: entryIsA ? outer : [...outer].reverse(),
    island,
  };
}
