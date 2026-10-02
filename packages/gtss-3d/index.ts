export { buildIntersectionObject, disposeObject } from "./src/builders";
export type { BuildOptions } from "./src/builders";
export { resolveCrosswalks } from "./src/crosswalks";
export type { CrosswalkPlan } from "./src/crosswalks";
export { detectorColor, matchDetectorLanes, placeDetector } from "./src/detectorPlacement";
export type { DetectorZone } from "./src/detectorPlacement";
export {
  assignTurnArrows,
  classifyMovement,
  incomingCarBands,
  legMovements,
} from "./src/laneAssignment";
export type { ArrowKind, LegMovements, TurnLetter } from "./src/laneAssignment";
export { computeLayout } from "./src/layout";
export type { IntersectionLayout, LegPlan, SlipLane } from "./src/layout";
export {
  buildLegs,
  computeCorners,
  defaultLaneFields,
  legPoint,
  mirrorApproachLanes,
} from "./src/legLayout";
export type { Corner, LaneBand, Leg } from "./src/legLayout";
export { Intersection3D } from "./src/react/Intersection3D";
export type { Intersection3DHandle, Intersection3DProps } from "./src/react/Intersection3D";
export { createIntersectionScene } from "./src/scene";
export type { IntersectionSceneHandle, IntersectionSceneOptions } from "./src/scene";
export type {
  ApproachInput,
  DetectorInput,
  IntersectionInput,
  LayoutOptions,
  PhaseInput,
  Vec2,
} from "./src/types";
