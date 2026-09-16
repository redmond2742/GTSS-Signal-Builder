import { z } from "zod";

export const insertAgencySchema = z.object({
  agencyId: z.string(),
  agencyName: z.string(),
  agencyUrl: z.string().nullable().optional(),
  agencyTimezone: z.string(),
  agencyLanguage: z.string().nullable().optional(),
  agencyEmail: z.string().nullable().optional(),
  agencyIsMetric: z.boolean().nullable().optional(),
  // LHT — left-hand traffic. Mirrors turn-lane offsets/ordering in diagrams.
  agencyIsLht: z.boolean().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

export const insertSignalSchema = z.object({
  signalId: z.string().optional(),
  agencyId: z.string(),
  streetName1: z.string(),
  streetName2: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

export const insertApproachSchema = z.object({
  approachId: z.string().optional(),
  signalId: z.string(),
  streetName: z.string(),
  compassBearing: z.number().nullable().optional(),
  postedSpeed: z.number().nullable().optional(),
  freeRight: z.number().nullable().optional(),
  freeRightLanes: z.number().nullable().optional(),
  laneConfig: z.string().nullable().optional(),
  laneWidth: z.string().nullable().optional(),
  laneDirection: z.string().nullable().optional(),
});

export const insertPhaseSchema = z.object({
  phase: z.number(),
  signalId: z.string(),
  movementType: z.string(),
  isPedestrian: z.number().nullable().optional(),
  numOfLanes: z.number().nullable().optional(),
  approachId: z.string().nullable().optional(),
  crosswalkLength: z.number().nullable().optional(),
});

export const insertDetectorSchema = z.object({
  channel: z.string(),
  signalId: z.string(),
  phase: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  purpose: z.string(),
  vehicleType: z.string().nullable().optional(),
  lane: z.string().nullable().optional(),
  technologyType: z.string(),
  length: z.number().nullable().optional(),
  stopbarSetbackDist: z.number().nullable().optional(),
  approachId: z.string().nullable().optional(),
});

export const insertBasicTimingSchema = z.object({
  phase: z.number(),
  signalId: z.string(),
  pedWalk: z.number().nullable().optional(),
  pedClearance: z.number().nullable().optional(),
  leadingPedInterval: z.number().nullable().optional(),
  minGreen: z.number().nullable().optional(),
  maxGreen: z.number().nullable().optional(),
  yellow: z.number().nullable().optional(),
  allRed: z.number().nullable().optional(),
  vehRecallType: z.enum(["None", "Min", "Max", "Soft"]).nullable().optional(),
  pedRecall: z.boolean().nullable().optional(),
});

export type InsertAgency = z.infer<typeof insertAgencySchema>;
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type InsertApproach = z.infer<typeof insertApproachSchema>;
export type InsertPhase = z.infer<typeof insertPhaseSchema>;
export type InsertDetector = z.infer<typeof insertDetectorSchema>;
export type InsertBasicTiming = z.infer<typeof insertBasicTimingSchema>;

export type Agency = InsertAgency & {
  id: string;
};
export type Signal = InsertSignal & {
  id: string;
  signalId: string;
};
export type Approach = Omit<
  InsertApproach,
  | "approachId"
  | "compassBearing"
  | "postedSpeed"
  | "freeRight"
  | "freeRightLanes"
  | "laneConfig"
  | "laneWidth"
> & {
  id: string;
  approachId: string;
  compassBearing: number | null;
  postedSpeed: number | null;
  freeRight: number | null;
  freeRightLanes: number | null;
  laneConfig?: string | null;
  laneWidth?: string | null;
  laneDirection?: string | null;
};
export type Phase = Omit<
  InsertPhase,
  "approachId" | "isPedestrian" | "numOfLanes" | "crosswalkLength"
> & {
  id: string;
  approachId: string | null;
  isPedestrian: number | null;
  numOfLanes: number | null;
  crosswalkLength: number | null;
};
export type Detector = Omit<
  InsertDetector,
  "phase" | "description" | "vehicleType" | "lane" | "length" | "stopbarSetbackDist" | "approachId"
> & {
  id: string;
  phase: number | null;
  description: string | null;
  vehicleType: string | null;
  lane: string | null;
  length: number | null;
  stopbarSetbackDist: number | null;
  approachId: string | null;
};
export type BasicTiming = Omit<InsertBasicTiming, "vehRecallType"> & {
  id: string;
  pedWalk: number | null;
  pedClearance: number | null;
  leadingPedInterval: number | null;
  minGreen: number | null;
  maxGreen: number | null;
  yellow: number | null;
  allRed: number | null;
  vehRecallType: string | null;
  pedRecall: boolean | null;
};

export type GTSSData = {
  agency: Agency | null;
  signals: Signal[];
  approaches: Approach[];
  phases: Phase[];
  detectors: Detector[];
  basicTimings: BasicTiming[];
};
