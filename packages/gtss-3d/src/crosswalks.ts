import { angleDistance, normalizeAngle, type Leg } from "./legLayout";
import type { PhaseInput } from "./types";

export interface CrosswalkPlan {
  /** Indices of legs that get a crosswalk across their mouth. */
  legs: Set<number>;
  /** Compass angles of pedestrian travel for diagonal (scramble) crossings through the centre. */
  diagonals: number[];
  /** Compass angles of pedestrian travel for crossings through the centre of a two-leg (midblock) signal. */
  core: number[];
}

const LEG_MATCH_TOLERANCE = 60;

function pedMode(phase: PhaseInput): number {
  if (typeof phase.isPedestrian === "number") return phase.isPedestrian;
  return phase.isPedestrian ? 1 : 0;
}

function nearestLeg(legs: Leg[], angle: number): Leg | null {
  let best: Leg | null = null;
  let bestDistance = LEG_MATCH_TOLERANCE;
  legs.forEach((leg) => {
    const distance = angleDistance(leg.angle, angle);
    if (distance <= bestDistance) {
      best = leg;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Maps phase pedestrian modes (0-7, same scheme as the phase diagram) to crosswalk locations.
 * A crossing drawn parallel to the phase's travel direction, offset to its right, crosses the leg
 * that points toward bearing + 90.
 */
export function resolveCrosswalks(phases: PhaseInput[], legs: Leg[]): CrosswalkPlan {
  const plan: CrosswalkPlan = { legs: new Set(), diagonals: [], core: [] };
  const addUnique = (list: number[], angle: number) => {
    const axis = normalizeAngle(angle) % 180;
    if (!list.some((existing) => angleDistance(existing % 180, axis) < 5)) list.push(axis);
  };
  const addSide = (angle: number) => {
    const leg = nearestLeg(legs, angle);
    if (leg) plan.legs.add(leg.index);
    // Two-leg (midblock) signals cross the road itself.
    else if (legs.length <= 2) addUnique(plan.core, angle);
  };

  phases.forEach((phase) => {
    const mode = pedMode(phase);
    if (mode === 0) return;
    const leg = legs.find((l) => l.approach.approachId === phase.approachId);
    if (!leg) return;
    const bearing = leg.bearing;
    switch (mode) {
      case 1:
        addSide(bearing + 90);
        break;
      case 2:
        addSide(bearing + 90);
        addSide(bearing + 270);
        break;
      case 3:
        addSide(bearing + 270);
        break;
      case 4:
        addUnique(plan.diagonals, 135);
        break;
      case 5:
        addUnique(plan.diagonals, 45);
        break;
      case 6:
        addUnique(plan.diagonals, 135);
        addUnique(plan.diagonals, 45);
        break;
      case 7:
        legs.forEach((l) => plan.legs.add(l.index));
        addUnique(plan.diagonals, 135);
        addUnique(plan.diagonals, 45);
        break;
    }
  });
  return plan;
}
