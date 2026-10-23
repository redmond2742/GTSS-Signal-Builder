import type { Approach, BasicTiming, Phase, Signal } from "../../schema/public";

/**
 * A small GTSS dataset: a north–south arterial (Main St) crossed by numbered
 * avenues, with standard dual-ring phasing at each signal:
 *   2 NB through + 5 NB left   (approach heading 0°)
 *   6 SB through + 1 SB left   (approach heading 180°)
 *   4 EB through + 7 EB left   (approach heading 90°)
 *   8 WB through + 3 WB left   (approach heading 270°)
 * Bearings are the direction traffic TRAVELS, as GTSS stores them.
 */

export const signal = (signalId: string, latitude: number, longitude = -118.15): Signal => ({
  id: `sig-${signalId}`,
  signalId,
  agencyId: "TEST",
  streetName1: "Main St",
  streetName2: `${signalId} Ave`,
  latitude,
  longitude,
});

export const approach = (
  signalId: string,
  n: number,
  streetName: string,
  compassBearing: number | null,
  postedSpeed: number | null,
): Approach => ({
  id: `app-${signalId}-${n}`,
  approachId: `${signalId}-${n}`,
  signalId,
  streetName,
  compassBearing,
  postedSpeed,
  freeRight: 0,
  freeRightLanes: 1,
});

export const phase = (
  signalId: string,
  phaseNumber: number,
  movementType: string,
  approachId: string | null,
): Phase => ({
  id: `ph-${signalId}-${phaseNumber}`,
  phase: phaseNumber,
  signalId,
  movementType,
  isPedestrian: 0,
  numOfLanes: 1,
  approachId,
  crosswalkLength: null,
});

export const timing = (
  signalId: string,
  phaseNumber: number,
  maxGreen: number | null,
  yellow = 4,
  allRed = 1,
): BasicTiming => ({
  id: `t-${signalId}-${phaseNumber}`,
  phase: phaseNumber,
  signalId,
  pedWalk: null,
  pedClearance: null,
  leadingPedInterval: null,
  minGreen: 5,
  maxGreen,
  yellow,
  allRed,
  vehRecallType: "None",
  pedRecall: false,
});

/** A full four-leg intersection. Speeds: Main St 40 NB / 35 SB, avenues 25. */
export function fourLeg(signalId: string, mainNb = 40, mainSb = 35) {
  const approaches = [
    approach(signalId, 1, "Main St NB", 0, mainNb),
    approach(signalId, 2, "Main St SB", 180, mainSb),
    approach(signalId, 3, `${signalId} Ave EB`, 90, 25),
    approach(signalId, 4, `${signalId} Ave WB`, 270, 25),
  ];
  const phases = [
    phase(signalId, 2, "Through", `${signalId}-1`),
    phase(signalId, 5, "Left Turn", `${signalId}-1`),
    phase(signalId, 6, "Through", `${signalId}-2`),
    phase(signalId, 1, "Left Turn", `${signalId}-2`),
    phase(signalId, 4, "Through", `${signalId}-3`),
    phase(signalId, 7, "Left Turn", `${signalId}-3`),
    phase(signalId, 8, "Through", `${signalId}-4`),
    phase(signalId, 3, "Left Turn", `${signalId}-4`),
    phase(signalId, 12, "Pedestrian", `${signalId}-3`),
  ];
  const basicTimings = [
    timing(signalId, 1, 10),
    timing(signalId, 2, 40),
    timing(signalId, 3, 10),
    timing(signalId, 4, 25),
    timing(signalId, 5, 10),
    timing(signalId, 6, 40),
    timing(signalId, 7, 10),
    timing(signalId, 8, 25),
  ];
  return { approaches, phases, basicTimings };
}

/** Three signals on Main St, north to south, about 400 m apart. */
export function mainStreet() {
  const signals = [signal("A", 34.15), signal("B", 34.1464), signal("C", 34.1428)];
  const legs = signals.map((s) => fourLeg(s.signalId));
  return {
    signals,
    approaches: legs.flatMap((l) => l.approaches),
    phases: legs.flatMap((l) => l.phases),
    basicTimings: legs.flatMap((l) => l.basicTimings),
  };
}
