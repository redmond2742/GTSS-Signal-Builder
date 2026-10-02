import { parseLaneConfig, serializeLaneConfig, type LaneDirection } from "gtss";
import type { ApproachInput, PhaseInput, Vec2 } from "./types";
import { rawWidthToMeters } from "./units";

export interface LaneBand {
  index: number;
  kind: "lane" | "divider";
  raw: string;
  parts: string[];
  direction: LaneDirection;
  /** Lateral extent in metres; positive is to the right when looking outward from the centre. */
  t0: number;
  t1: number;
}

export interface Leg {
  approach: ApproachInput;
  /** Position in clockwise (ascending compass angle) order. */
  index: number;
  /** Compass bearing of incoming traffic. */
  bearing: number;
  /** Compass angle of the leg as seen from the centre (bearing + 180). */
  angle: number;
  u: Vec2;
  r: Vec2;
  bands: LaneBand[];
  /** Outer edges of the whole cross-section. */
  t0: number;
  t1: number;
  /** Curb-to-curb roadway extents (sidewalks and edge curbs excluded). */
  roadT0: number;
  roadT1: number;
  /** Distance from the centre where the leg begins. */
  mouth: number;
  /** Length of the leg beyond the mouth. */
  length: number;
}

export interface Corner {
  index: number;
  /** Leg whose +t edge forms this corner. */
  a: number;
  /** Leg whose -t edge forms this corner. */
  b: number;
  /** Clockwise angle from leg a to leg b, degrees. */
  theta: number;
  /** Intersection of the two curb lines (null when the legs are near-parallel or diverge). */
  curbVertex: Vec2 | null;
  outerVertex: Vec2 | null;
  /** Distances along legs a and b where the curb-return fillet meets each curb line. */
  filletA: number;
  filletB: number;
}

export const CORNER_RADIUS = 6;
export const MIN_MOUTH = 3;
const MAX_MOUTH = 80;
const DEFAULT_SIDEWALK_IN = 72;
const DEFAULT_CURB_IN = 6;
const DEFAULT_CAR_IN = 132;
const EDGE_CODES = new Set(["S", "-"]);

const DEG = Math.PI / 180;

export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Smallest absolute difference between two compass angles, degrees. */
export function angleDistance(a: number, b: number): number {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return d > 180 ? 360 - d : d;
}

export function compassVector(deg: number): Vec2 {
  return { x: Math.sin(deg * DEG), z: -Math.cos(deg * DEG) };
}

/** World position of lateral offset t at distance s along a leg. */
export function legPoint(leg: Pick<Leg, "u" | "r">, t: number, s: number): Vec2 {
  return { x: leg.u.x * s + leg.r.x * t, z: leg.u.z * s + leg.r.z * t };
}

/** Solves p + λd = q + μe; returns null for (near-)parallel lines. */
export function intersectLines(
  p: Vec2,
  d: Vec2,
  q: Vec2,
  e: Vec2,
): { lambda: number; mu: number; point: Vec2 } | null {
  const det = d.x * -e.z - d.z * -e.x;
  if (Math.abs(det) < 1e-6) return null;
  const rx = q.x - p.x;
  const rz = q.z - p.z;
  const lambda = (rx * -e.z - rz * -e.x) / det;
  const mu = (d.x * rz - d.z * rx) / det;
  return { lambda, mu, point: { x: p.x + d.x * lambda, z: p.z + d.z * lambda } };
}

function phaseLaneDemand(approachId: string, phases: PhaseInput[]) {
  let inbound = 0;
  let through = 0;
  phases.forEach((phase) => {
    if (phase.approachId !== approachId) return;
    if (phase.movementType.toLowerCase().includes("ped")) return;
    const lanes = Math.max(1, phase.numOfLanes ?? 1);
    inbound += lanes;
    if (!/left|right|u-?turn/i.test(phase.movementType)) through += lanes;
  });
  return { inbound: Math.max(1, inbound), outbound: Math.max(1, through) };
}

/** Builds a sidewalk/curb/lanes cross-section when an approach has no lane config. */
export function defaultLaneFields(
  approach: ApproachInput,
  phases: PhaseInput[],
  isLht: boolean,
  isMetric: boolean,
) {
  const { inbound, outbound } = phaseLaneDemand(approach.approachId, phases);
  const scale = isMetric ? 2.54 : 1;
  const segments: Array<{ raw: string; width: number; direction: LaneDirection }> = [];
  const add = (raw: string, width: number, direction: LaneDirection = "B") =>
    segments.push({ raw, width: Math.round(width * scale), direction });
  const run = (count: number, direction: LaneDirection) => {
    for (let i = 0; i < count; i++) {
      if (i > 0) add(":", 0);
      add("C", DEFAULT_CAR_IN, direction);
    }
  };
  add("S", DEFAULT_SIDEWALK_IN);
  add("-", DEFAULT_CURB_IN);
  run(isLht ? outbound : inbound, isLht ? "O" : "I");
  add("|", 0);
  run(isLht ? inbound : outbound, isLht ? "I" : "O");
  add("-", DEFAULT_CURB_IN);
  add("S", DEFAULT_SIDEWALK_IN);
  return serializeLaneConfig(
    segments.map((seg) => ({
      kind: seg.raw === "C" || seg.raw === "S" ? "lane" : "divider",
      raw: seg.raw,
      parts: [seg.raw],
      width: seg.width,
      direction: seg.direction,
    })),
  );
}

/** Reverses an approach's cross-section, e.g. to show RHT-authored data as LHT. */
export function mirrorApproachLanes<T extends ApproachInput>(approach: T): T {
  if (!approach.laneConfig) return approach;
  const segments = parseLaneConfig(
    approach.laneConfig,
    approach.laneWidth,
    approach.laneDirection,
  ).reverse();
  return { ...approach, ...serializeLaneConfig(segments) };
}

export function buildLegBands(
  approach: ApproachInput,
  phases: PhaseInput[],
  isLht: boolean,
  isMetric: boolean,
): LaneBand[] {
  const fields = approach.laneConfig
    ? approach
    : { ...approach, ...defaultLaneFields(approach, phases, isLht, isMetric) };
  const segments = parseLaneConfig(
    fields.laneConfig,
    fields.laneWidth,
    fields.laneDirection,
    isLht,
  );
  let cursor = 0;
  const bands = segments.map((seg, index) => {
    const width = rawWidthToMeters(seg.width, isMetric);
    const band: LaneBand = {
      index,
      kind: seg.kind,
      raw: seg.raw,
      parts: seg.parts,
      direction: seg.direction,
      t0: cursor,
      t1: cursor + width,
    };
    cursor += width;
    return band;
  });
  const offset = centerlineOffset(bands, cursor);
  bands.forEach((band) => {
    band.t0 -= offset;
    band.t1 -= offset;
  });
  return bands;
}

/** Lateral position of the boundary between inbound and outbound lanes, so opposing legs line up. */
function centerlineOffset(bands: LaneBand[], total: number): number {
  const lanes = bands.filter((band) => band.kind === "lane");
  const inbound = lanes.filter((band) => band.direction === "I");
  const outbound = lanes.filter((band) => band.direction === "O");
  if (!inbound.length || !outbound.length) return total / 2;
  const maxIn = Math.max(...inbound.map((b) => b.index));
  const minIn = Math.min(...inbound.map((b) => b.index));
  const maxOut = Math.max(...outbound.map((b) => b.index));
  const minOut = Math.min(...outbound.map((b) => b.index));
  if (maxIn < minOut) return (bands[maxIn].t1 + bands[minOut].t0) / 2;
  if (maxOut < minIn) return (bands[maxOut].t1 + bands[minIn].t0) / 2;
  return total / 2;
}

function roadExtents(bands: LaneBand[], t0: number, t1: number) {
  let roadT0 = t0;
  for (const band of bands) {
    if (!EDGE_CODES.has(band.parts[0])) break;
    roadT0 = band.t1;
  }
  let roadT1 = t1;
  for (let i = bands.length - 1; i >= 0; i--) {
    if (!EDGE_CODES.has(bands[i].parts[0])) break;
    roadT1 = bands[i].t0;
  }
  if (roadT1 - roadT0 < 1) return { roadT0: t0, roadT1: t1 };
  return { roadT0, roadT1 };
}

/** Creates legs sorted clockwise by compass angle, with cross-sections but no mouth yet. */
export function buildLegs(
  approaches: ApproachInput[],
  phases: PhaseInput[],
  isLht: boolean,
  isMetric: boolean,
): Leg[] {
  return approaches
    .filter((approach) => approach.compassBearing !== null && approach.compassBearing !== undefined)
    .map((approach) => {
      const bearing = normalizeAngle(approach.compassBearing as number);
      const angle = normalizeAngle(bearing + 180);
      const u = compassVector(angle);
      const r = { x: -u.z, z: u.x };
      const bands = buildLegBands(approach, phases, isLht, isMetric);
      const t0 = bands.length ? bands[0].t0 : -4;
      const t1 = bands.length ? bands[bands.length - 1].t1 : 4;
      return {
        approach,
        index: 0,
        bearing,
        angle,
        u,
        r,
        bands,
        t0,
        t1,
        ...roadExtents(bands, t0, t1),
        mouth: MIN_MOUTH,
        length: 60,
      };
    })
    .sort((a, b) => a.angle - b.angle)
    .map((leg, index) => ({ ...leg, index }));
}

/** Computes corners between clockwise-adjacent legs and pushes each leg's mouth out so neighbours don't overlap. */
export function computeCorners(legs: Leg[]): Corner[] {
  const n = legs.length;
  if (n < 2) return [];
  const corners: Corner[] = [];
  const mouths = legs.map(() => MIN_MOUTH);
  for (let k = 0; k < n; k++) {
    const a = legs[k];
    const b = legs[(k + 1) % n];
    const theta = normalizeAngle(b.angle - a.angle) || 360;
    let curbVertex: Vec2 | null = null;
    let outerVertex: Vec2 | null = null;
    let filletA = 0;
    let filletB = 0;
    if (theta > 5 && theta < 175) {
      const curb = intersectLines(legPoint(a, a.roadT1, 0), a.u, legPoint(b, b.roadT0, 0), b.u);
      const outer = intersectLines(legPoint(a, a.t1, 0), a.u, legPoint(b, b.t0, 0), b.u);
      if (curb) {
        curbVertex = curb.point;
        const tangent = CORNER_RADIUS / Math.tan((theta * DEG) / 2);
        filletA = curb.lambda + tangent;
        filletB = curb.mu + tangent;
        mouths[a.index] = Math.max(mouths[a.index], filletA);
        mouths[b.index] = Math.max(mouths[b.index], filletB);
      }
      if (outer) {
        outerVertex = outer.point;
        mouths[a.index] = Math.max(mouths[a.index], outer.lambda);
        mouths[b.index] = Math.max(mouths[b.index], outer.mu);
      }
    }
    corners.push({
      index: k,
      a: a.index,
      b: b.index,
      theta,
      curbVertex,
      outerVertex,
      filletA,
      filletB,
    });
  }
  legs.forEach((leg, i) => {
    leg.mouth = Math.min(MAX_MOUTH, mouths[i]);
  });
  return corners;
}
