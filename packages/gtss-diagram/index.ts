// Public surface of the diagram package.
//
// Everything here is renderer-only: no storage access, no app state, no UI
// kit. The single piece of intersection context the renderer can't derive on
// its own — left- vs right-hand traffic — is passed in as the `isLht` prop.
export { movementShape, PhaseDiagram, phaseColors } from "./src/phase-diagram";
export type {
  MovementShape,
  PhaseDiagramApproach,
  PhaseDiagramPhase,
  PhaseDiagramProps,
} from "./src/phase-diagram";
export { PreemptDiagram } from "./src/preempt-diagram";
export type { PreemptDiagramPhase, PreemptDiagramProps } from "./src/preempt-diagram";
export { freeRightPedMarkings } from "./src/free-right-markings";
export type { FreeRightMarkingOpts } from "./src/free-right-markings";
