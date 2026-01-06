import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, boolean, integer, primaryKey } from "drizzle-orm/pg-core";
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
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
});

export const approaches = pgTable("approaches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  approachId: text("approach_id").notNull(),
  signalId: text("signal_id").notNull(),
  streetName: text("street_name").notNull(),
  compassBearing: text("compass_bearing").notNull(),
  postedSpeed: real("posted_speed"),
});

export const phases = pgTable("phases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phase: integer("phase").notNull(),
  signalId: text("signal_id").notNull(),
  approachId: text("approach_id"),
  movementType: text("movement_type").notNull(),
  isPedestrian: boolean("is_pedestrian").default(false),
  numOfLanes: integer("num_of_lanes").default(1),
  isOverlap: boolean("is_overlap").default(false),
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

export const basicTiming = pgTable(
  "basic_timing",
  {
    signalId: text("signal_id").notNull(),
    phase: integer("phase").notNull(),
    pedWalk: real("ped_walk").notNull(),
    pedClearance: real("ped_clearance").notNull(),
    leadingPedInterval: real("leading_ped_interval").notNull(),
    minGreen: real("min_green").notNull(),
    maxGreen: real("max_green").notNull(),
    yellow: real("yellow").notNull(),
    allRed: real("all_red").notNull(),
    vehRecallType: text("veh_recall_type").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.signalId, table.phase] }),
  })
);

export const insertAgencySchema = createInsertSchema(agencies).omit({
  id: true,
}).extend({
  agencyLanguage: z.string().optional(),
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
}).extend({
  signalId: z.string().optional(), // Make signal ID optional when creating
});

export const insertApproachSchema = createInsertSchema(approaches).omit({
  id: true,
}).extend({
  postedSpeed: z.number().optional().nullable(),
});

export const insertPhaseSchema = createInsertSchema(phases).omit({
  id: true,
}).extend({
  approachId: z.string().optional().nullable(),
});

export const insertDetectorSchema = createInsertSchema(detectors).omit({
  id: true,
});

export const VEH_RECALL_TYPES = ["None", "Min", "Max", "Soft"] as const;

export const insertBasicTimingSchema = createInsertSchema(basicTiming).extend({
  vehRecallType: z.enum(VEH_RECALL_TYPES),
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
export type BasicTiming = typeof basicTiming.$inferSelect;
export type InsertBasicTiming = z.infer<typeof insertBasicTimingSchema>;
export type VehRecallType = (typeof VEH_RECALL_TYPES)[number];

export type GTSSData = {
  agency: Agency | null;
  signals: Signal[];
  approaches: Approach[];
  phases: Phase[];
  detectors: Detector[];
  basicTiming: BasicTiming[];
};
