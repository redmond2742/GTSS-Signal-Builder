import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const agencies = pgTable("agencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: text("agency_id").notNull().unique(),
  agencyName: text("agency_name").notNull(),
  agencyUrl: text("agency_url"),
  agencyTimezone: text("agency_timezone").notNull(),
  agencyLanguage: text("agency_language").default("en"),
  agencyEmail: text("agency_email"),
  latitude: real("latitude"),
  longitude: real("longitude"),
});

export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signalId: text("signal_id").notNull().unique(),
  agencyId: text("agency_id").notNull(),
  streetName1: text("street_name_1").notNull(),
  streetName2: text("street_name_2").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
});

// Approaches table - new for GTSSv1.1
export const approaches = pgTable("approaches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  approachId: text("approach_id").notNull(),
  signalId: text("signal_id").notNull(),
  streetName: text("street_name").notNull(),
  compassBearing: integer("compass_bearing"),
  postedSpeed: integer("posted_speed"),
  // FR — Free Right: the approach has a right-turn slip lane that bypasses
  // the signal. Drawn on the phase diagram as a quarter-circle lane peeling
  // off to the right before the intersection.
  //   0 = none
  //   1 = FR     (slip lane, no pedestrian crossing)
  //   2 = FR-P   (slip lane WITH a pedestrian crossing across its middle)
  //   3 = FR-P-I (improved: traffic-calmed lane with a shark's-teeth yield
  //               line before a ladder-style crosswalk)
  freeRight: integer("free_right").default(0),
  // Number of free-right lanes. In approaches.txt this prefixes the FR code
  // as "<n>-FR", "<n>-FR-P", etc. (a bare "FR" / "FR-P" implies 1 lane).
  freeRightLanes: integer("free_right_lanes").default(1),
});

// Phases table - updated for GTSSv1.1 (removed compassBearing, postedSpeed; added approachId)
export const phases = pgTable("phases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phase: integer("phase").notNull(),
  signalId: text("signal_id").notNull(),
  movementType: text("movement_type").notNull(),
  // Pedestrian crossing mode for the phase:
  //   0 = none
  //   1 = single crosswalk on the assigned approach (legacy "true")
  //   2 = two crosswalks (assigned approach AND its 180° opposite)
  //   3 = single crosswalk on the 180° opposite approach
  //   4 = single diagonal crosswalk
  //   5 = single diagonal crosswalk on the other diagonal (90° rotated)
  //   6 = both diagonals shown simultaneously (full scramble "X")
  //   7 = all four crosswalks AND both diagonals (full all-directions scramble)
  // When movementType === 'Pedestrian' the same integer drives the rendering
  // (no auto-scramble override).
  isPedestrian: integer("is_pedestrian").default(0),
  numOfLanes: integer("num_of_lanes").default(1),
  approachId: text("approach_id"),
  // Measured crosswalk length in feet for the phase's pedestrian crossing.
  // Null means "not measured" — phases.txt then carries an estimate instead:
  //   LE-#  lane-estimated distance (12 ft × lanes on the crossed approach)
  //   TE-#  time-estimated distance (ped clearance × 3.5 ft/s walking speed)
  // The shorter available estimate is exported; a measured value overrides both.
  crosswalkLength: integer("crosswalk_length"),
});

export const detectors = pgTable("detectors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channel: text("channel").notNull(),
  signalId: text("signal_id").notNull(),
  phase: integer("phase").notNull(),
  description: text("description"),
  purpose: text("purpose").notNull(),
  vehicleType: text("vehicle_type"),
  lane: text("lane"),
  technologyType: text("technology_type").notNull(),
  length: real("length"),
  stopbarSetbackDist: real("stopbar_setback_dist"),
});

// Basic Timings table - new for GTSSv1.1
export const basicTimings = pgTable("basic_timings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phase: integer("phase").notNull(),
  signalId: text("signal_id").notNull(),
  pedWalk: real("ped_walk"),
  pedClearance: real("ped_clearance"),
  leadingPedInterval: real("leading_ped_interval"),
  minGreen: real("min_green"),
  maxGreen: real("max_green"),
  yellow: real("yellow"),
  allRed: real("all_red"),
  vehRecallType: text("veh_recall_type").default("None"),
  pedRecall: boolean("ped_recall").default(false),
});

export const insertAgencySchema = createInsertSchema(agencies).omit({
  id: true,
}).extend({
  agencyLanguage: z.string().optional(),
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
}).extend({
  signalId: z.string().optional(),
});

export const insertApproachSchema = createInsertSchema(approaches).omit({
  id: true,
}).extend({
  approachId: z.string().optional(),
});

export const insertPhaseSchema = createInsertSchema(phases).omit({
  id: true,
});

export const insertDetectorSchema = createInsertSchema(detectors).omit({
  id: true,
});

export const insertBasicTimingSchema = createInsertSchema(basicTimings).omit({
  id: true,
}).extend({
  vehRecallType: z.enum(["None", "Min", "Max", "Soft"]).optional(),
});

export type Agency = typeof agencies.$inferSelect;
export type InsertAgency = z.infer<typeof insertAgencySchema>;
export type Signal = typeof signals.$inferSelect;
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Approach = typeof approaches.$inferSelect;
export type InsertApproach = z.infer<typeof insertApproachSchema>;
export type Phase = typeof phases.$inferSelect;
export type InsertPhase = z.infer<typeof insertPhaseSchema>;
export type Detector = typeof detectors.$inferSelect;
export type InsertDetector = z.infer<typeof insertDetectorSchema>;
export type BasicTiming = typeof basicTimings.$inferSelect;
export type InsertBasicTiming = z.infer<typeof insertBasicTimingSchema>;

export type GTSSData = {
  agency: Agency | null;
  signals: Signal[];
  approaches: Approach[];
  phases: Phase[];
  detectors: Detector[];
  basicTimings: BasicTiming[];
};
