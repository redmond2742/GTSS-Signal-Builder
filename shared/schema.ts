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

export const phases = pgTable("phases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phase: integer("phase").notNull(),
  signalId: text("signal_id").notNull(),
  movementType: text("movement_type").notNull(),
  numOfLanes: integer("num_of_lanes").default(1),
  compassBearing: integer("compass_bearing"),
  postedSpeed: integer("posted_speed"),
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

export const insertAgencySchema = createInsertSchema(agencies).omit({
  id: true,
});

export const insertSignalSchema = createInsertSchema(signals).omit({
  id: true,
}).extend({
  signalId: z.string().optional(), // Make signal ID optional when creating
});

export const insertPhaseSchema = createInsertSchema(phases).omit({
  id: true,
});

export const insertDetectorSchema = createInsertSchema(detectors).omit({
  id: true,
});

export type Agency = typeof agencies.$inferSelect;
export type InsertAgency = z.infer<typeof insertAgencySchema>;
export type Signal = typeof signals.$inferSelect;
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Phase = typeof phases.$inferSelect;
export type InsertPhase = z.infer<typeof insertPhaseSchema>;
export type Detector = typeof detectors.$inferSelect;
export type InsertDetector = z.infer<typeof insertDetectorSchema>;

export type GTSSData = {
  agency: Agency | null;
  signals: Signal[];
  phases: Phase[];
  detectors: Detector[];
};
