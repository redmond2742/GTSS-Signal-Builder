export interface ApproachInput {
  approachId: string;
  streetName?: string | null;
  compassBearing: number | null;
  postedSpeed?: number | null;
  freeRight?: number | null;
  freeRightLanes?: number | null;
  laneConfig?: string | null;
  laneWidth?: string | null;
  laneDirection?: string | null;
}

export interface PhaseInput {
  phase: number;
  movementType: string;
  approachId: string | null;
  isPedestrian?: number | boolean | null;
  numOfLanes?: number | null;
}

export interface DetectorInput {
  id?: string;
  channel: string;
  approachId: string | null;
  lane?: string | null;
  technologyType: string;
  purpose?: string | null;
  length?: number | null;
  stopbarSetbackDist?: number | null;
  phase?: number | null;
}

export interface IntersectionInput {
  signalId?: string;
  approaches: ApproachInput[];
  phases: PhaseInput[];
  detectors: DetectorInput[];
}

export interface LayoutOptions {
  /** Lane widths in cm and distances in metres when true; inches and feet otherwise. */
  isMetric?: boolean;
  isLht?: boolean;
}

/** Ground-plane vector: x = east, z = south (three.js convention with north at -z). */
export interface Vec2 {
  x: number;
  z: number;
}
