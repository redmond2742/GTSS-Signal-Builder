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
  contactPerson: text("contact_person"),
  contactEmail: text("contact_email"),
});

export const signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signalId: text("signal_id").notNull().unique(),
  agencyId: text("agency_id").notNull(),
  streetName1: text("street_name1").notNull(),
  streetName2: text("street_name2").notNull(),
  cntLat: real("cnt_lat").notNull(),
  cntLon: real("cnt_lon").notNull(),
  controlType: text("control_type").notNull(),
  cabinetType: text("cabinet_type"),
  cabinetLat: real("cabinet_lat"),
  cabinetLon: real("cabinet_lon"),
  hasBatteryBackup: boolean("has_battery_backup").default(false),
  hasCctv: boolean("has_cctv").default(false),
});

export const phases = pgTable("phases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phase: integer("phase").notNull(),
  signalId: text("signal_id").notNull(),
  movementType: text("movement_type").notNull(),
  isPedestrian: boolean("is_pedestrian").default(false),
  isOverlap: boolean("is_overlap").default(false),
  channelOutput: text("channel_output"),
  compassBearing: integer("compass_bearing"),
  postedSpeedLimit: integer("posted_speed_limit"),
  vehicleDetectionIds: text("vehicle_detection_ids"),
  pedAudibleEnabled: boolean("ped_audible_enabled").default(false),
});

export const detectors = pgTable("detectors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signalId: text("signal_id").notNull(),
  detectorChannel: text("detector_channel").notNull(),
  phase: integer("phase").notNull(),
  description: text("description"),
  purpose: text("purpose").notNull(),
  vehicleType: text("vehicle_type"),
  lane: text("lane"),
  detTechnologyType: text("det_technology_type").notNull(),
  length: real("length"),
  stopbarSetback: real("stopbar_setback"),
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
