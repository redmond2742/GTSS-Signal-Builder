import { resolveCrosswalks, type CrosswalkPlan } from "./crosswalks";
import { placeDetector, type DetectorZone } from "./detectorPlacement";
import { assignTurnArrows, incomingCarBands, type ArrowKind } from "./laneAssignment";
import { buildLegs, computeCorners, type Corner, type LaneBand, type Leg } from "./legLayout";
import type { IntersectionInput, LayoutOptions } from "./types";

export const CROSSWALK_OFFSET = 0.5;
export const CROSSWALK_WIDTH = 3;
export const STOP_BAR_WIDTH = 0.6;
export const SLIP_LANE_WIDTH = 3.6;
const MIN_LEG_LENGTH = 60;

export interface LegPlan {
  leg: Leg;
  hasCrosswalk: boolean;
  /** Distance from the centre to the intersection-side edge of the stop bar. */
  stopS: number;
  arrows: Map<number, ArrowKind>;
  /** Incoming car lanes, centre-to-curb. */
  incoming: LaneBand[];
  /** Where sidewalks start on the -t / +t side (pushed back by slip lanes). */
  sidewalkStartNeg: number;
  sidewalkStartPos: number;
}

export interface SlipLane {
  /** Leg whose traffic uses the slip lane. */
  legIndex: number;
  cornerIndex: number;
  width: number;
  /** Distance past each leg's mouth where the slip lane meets that leg. */
  reach: number;
  /** freeRight value: 1 = FR, 2 = FR with ped crossing, 3 = FR with ped crossing and raised island. */
  mode: number;
}

export interface IntersectionLayout {
  legs: Leg[];
  corners: Corner[];
  plans: LegPlan[];
  crosswalks: CrosswalkPlan;
  slips: SlipLane[];
  detectors: DetectorZone[];
  /** Farthest distance of any leg end from the centre. */
  reach: number;
  isLht: boolean;
  isMetric: boolean;
}

export function computeLayout(
  input: IntersectionInput,
  options: LayoutOptions = {},
): IntersectionLayout {
  const isLht = options.isLht ?? false;
  const isMetric = options.isMetric ?? false;
  const legs = buildLegs(input.approaches, input.phases, isLht, isMetric);
  const corners = computeCorners(legs);
  const crosswalks = resolveCrosswalks(input.phases, legs);

  const plans: LegPlan[] = legs.map((leg) => {
    const hasCrosswalk = crosswalks.legs.has(leg.index);
    return {
      leg,
      hasCrosswalk,
      stopS: leg.mouth + (hasCrosswalk ? CROSSWALK_OFFSET + CROSSWALK_WIDTH + 1.2 : 1.2),
      arrows: assignTurnArrows(leg, legs, input.phases, isLht),
      incoming: incomingCarBands(leg, isLht),
      sidewalkStartNeg: leg.mouth,
      sidewalkStartPos: leg.mouth,
    };
  });

  const detectors: DetectorZone[] = [];
  input.detectors.forEach((detector) => {
    const plan = plans.find((p) => p.leg.approach.approachId === detector.approachId);
    if (!plan) return;
    const zone = placeDetector(
      detector,
      plan.leg,
      plan.stopS,
      plan.incoming,
      plan.arrows,
      isMetric,
    );
    if (zone) detectors.push(zone);
  });

  legs.forEach((leg) => {
    const farthest = detectors
      .filter((zone) => zone.legIndex === leg.index)
      .reduce((max, zone) => Math.max(max, zone.s1 - leg.mouth + 20), 0);
    leg.length = Math.max(MIN_LEG_LENGTH, farthest);
  });

  const slips: SlipLane[] = [];
  const n = legs.length;
  legs.forEach((leg) => {
    const mode = leg.approach.freeRight ?? 0;
    if (mode <= 0 || n < 2) return;
    const cornerIndex = isLht ? leg.index : (leg.index - 1 + n) % n;
    const corner = corners[cornerIndex];
    if (!corner || corner.theta < 20 || corner.theta > 160 || !corner.curbVertex) return;
    const width = Math.max(1, leg.approach.freeRightLanes ?? 1) * SLIP_LANE_WIDTH;
    const reach = Math.max(14, 6 + 3 * width);
    slips.push({ legIndex: leg.index, cornerIndex, width, reach, mode });
    plans[corner.a].sidewalkStartPos = Math.max(
      plans[corner.a].sidewalkStartPos,
      legs[corner.a].mouth + reach,
    );
    plans[corner.b].sidewalkStartNeg = Math.max(
      plans[corner.b].sidewalkStartNeg,
      legs[corner.b].mouth + reach,
    );
  });

  const reach = legs.reduce((max, leg) => Math.max(max, leg.mouth + leg.length), 0);
  return { legs, corners, plans, crosswalks, slips, detectors, reach, isLht, isMetric };
}
