import { angleDistance, normalizeAngle, type LaneBand, type Leg } from "./legLayout";
import type { PhaseInput } from "./types";

export type TurnLetter = "L" | "T" | "R";
/** Letters in L-T-R order, e.g. "L", "TR", "LTR"; "TWLTL" marks a two-way centre turn lane. */
export type ArrowKind = string;

export interface LegMovements {
  left: boolean;
  straight: boolean;
  right: boolean;
}

/** Which movements are geometrically possible from a leg, based on where the other legs are. */
export function legMovements(leg: Leg, legs: Leg[]): LegMovements {
  const result: LegMovements = { left: false, straight: false, right: false };
  legs.forEach((other) => {
    if (other === leg) return;
    const rel = normalizeAngle(other.angle - leg.bearing);
    if (rel > 30 && rel < 150) result.right = true;
    else if (rel > 210 && rel < 330) result.left = true;
    else if (angleDistance(other.angle, leg.bearing) <= 30) result.straight = true;
  });
  return result;
}

const center = (band: LaneBand) => (band.t0 + band.t1) / 2;

/** +1 when the centreline lies toward +t from the incoming lanes, -1 otherwise. */
export function centerSideSign(leg: Leg, isLht: boolean): 1 | -1 {
  const lanes = leg.bands.filter((band) => band.kind === "lane");
  const incoming = lanes.filter((band) => band.direction === "I");
  const outgoing = lanes.filter((band) => band.direction === "O");
  if (incoming.length && outgoing.length) {
    const mean = (list: LaneBand[]) => list.reduce((sum, b) => sum + center(b), 0) / list.length;
    return mean(outgoing) > mean(incoming) ? 1 : -1;
  }
  return isLht ? -1 : 1;
}

/** Incoming general-traffic lanes, ordered from the centreline to the curb. */
export function incomingCarBands(leg: Leg, isLht: boolean): LaneBand[] {
  const sign = centerSideSign(leg, isLht);
  return leg.bands
    .filter((band) => band.kind === "lane" && band.direction === "I" && band.parts.includes("C"))
    .sort((a, b) => center(b) * sign - center(a) * sign);
}

export function classifyMovement(movementType: string): TurnLetter | null {
  const text = movementType.toLowerCase();
  if (text.includes("ped")) return null;
  if (text.includes("left") || /u-?turn/.test(text)) return "L";
  if (text.includes("right")) return "R";
  return "T";
}

const ORDER: TurnLetter[] = ["L", "T", "R"];
const combine = (letters: Iterable<TurnLetter>): ArrowKind => {
  const set = new Set(letters);
  return ORDER.filter((letter) => set.has(letter)).join("");
};

/** Assigns a pavement-arrow kind to each incoming car lane (keyed by band index). */
export function assignTurnArrows(
  leg: Leg,
  legs: Leg[],
  phases: PhaseInput[],
  isLht: boolean,
): Map<number, ArrowKind> {
  const arrows = new Map<number, ArrowKind>();
  leg.bands.forEach((band) => {
    if (band.kind === "lane" && band.direction === "T") arrows.set(band.index, "TWLTL");
  });
  const lanes = incomingCarBands(leg, isLht);
  if (!lanes.length) return arrows;

  const far: TurnLetter = isLht ? "R" : "L";
  const near: TurnLetter = isLht ? "L" : "R";
  const counts: Record<TurnLetter, number> = { L: 0, T: 0, R: 0 };
  phases.forEach((phase) => {
    if (phase.approachId !== leg.approach.approachId) return;
    const letter = classifyMovement(phase.movementType);
    if (letter) counts[letter] += Math.max(1, phase.numOfLanes ?? 1);
  });

  const moves = legMovements(leg, legs);
  const canNear = isLht ? moves.left : moves.right;
  const canFar = isLht ? moves.right : moves.left;
  const hasSlip = (leg.approach.freeRight ?? 0) > 0;

  const groups: Record<"far" | "T" | "near", TurnLetter[]> = {
    far: Array(counts[far]).fill(far),
    T: Array(counts.T).fill("T"),
    near: Array(counts[near]).fill(near),
  };
  const total = groups.far.length + groups.T.length + groups.near.length;

  let result: ArrowKind[];
  if (total <= lanes.length) {
    const fillGroup =
      moves.straight || counts.T > 0 ? "T" : canNear && !hasSlip ? "near" : canFar ? "far" : "T";
    const fillLetter: TurnLetter = fillGroup === "T" ? "T" : fillGroup === "near" ? near : far;
    for (let i = total; i < lanes.length; i++) groups[fillGroup].push(fillLetter);
    result = [...groups.far, ...groups.T, ...groups.near];
    const last = result.length - 1;
    const letters = (kind: ArrowKind) => kind.split("") as TurnLetter[];
    if (counts[near] === 0 && canNear && !hasSlip && result[last].includes("T")) {
      result[last] = combine([...letters(result[last]), near]);
    }
    if (counts[far] === 0 && canFar && result[0].includes("T")) {
      result[0] = combine([...letters(result[0]), far]);
    }
  } else {
    const demand = [...groups.far, ...groups.T, ...groups.near];
    result = lanes.map((_, k) => {
      const start = Math.floor((k * total) / lanes.length);
      const end = Math.max(start + 1, Math.floor(((k + 1) * total) / lanes.length));
      return combine(demand.slice(start, end));
    });
  }

  lanes.forEach((band, i) => arrows.set(band.index, result[i]));
  return arrows;
}
