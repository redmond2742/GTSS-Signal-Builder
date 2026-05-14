// server/index.ts
import express2 from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
import { randomUUID } from "crypto";
var MemStorage = class {
  agency = null;
  signals = /* @__PURE__ */ new Map();
  phases = /* @__PURE__ */ new Map();
  detectors = /* @__PURE__ */ new Map();
  async getAgency() {
    return this.agency || void 0;
  }
  async createOrUpdateAgency(agencyData) {
    const agency = {
      id: this.agency?.id || randomUUID(),
      ...agencyData,
      agencyUrl: agencyData.agencyUrl || null,
      agencyLanguage: agencyData.agencyLanguage || null,
      contactPerson: agencyData.contactPerson || null,
      contactEmail: agencyData.contactEmail || null
    };
    this.agency = agency;
    return agency;
  }
  async getSignals() {
    return Array.from(this.signals.values());
  }
  async getSignal(signalId) {
    return Array.from(this.signals.values()).find((s) => s.signalId === signalId);
  }
  async createSignal(signalData) {
    const id = randomUUID();
    const signal = {
      id,
      ...signalData,
      cabinetType: signalData.cabinetType || null,
      cabinetLat: signalData.cabinetLat || null,
      cabinetLon: signalData.cabinetLon || null,
      hasBatteryBackup: signalData.hasBatteryBackup ?? false,
      hasCctv: signalData.hasCctv ?? false
    };
    this.signals.set(id, signal);
    return signal;
  }
  async updateSignal(signalId, signalData) {
    const existing = Array.from(this.signals.values()).find((s) => s.signalId === signalId);
    if (!existing) {
      throw new Error("Signal not found");
    }
    const updated = { ...existing, ...signalData };
    this.signals.set(existing.id, updated);
    if (signalData.signalId && signalData.signalId !== signalId) {
      Array.from(this.phases.entries()).forEach(([id, phase]) => {
        if (phase.signalId === signalId) {
          this.phases.set(id, { ...phase, signalId: signalData.signalId });
        }
      });
      Array.from(this.detectors.entries()).forEach(([id, detector]) => {
        if (detector.signalId === signalId) {
          this.detectors.set(id, { ...detector, signalId: signalData.signalId });
        }
      });
    }
    return updated;
  }
  async deleteSignal(signalId) {
    const existing = Array.from(this.signals.values()).find((s) => s.signalId === signalId);
    if (existing) {
      this.signals.delete(existing.id);
      Array.from(this.phases.entries()).forEach(([id, phase]) => {
        if (phase.signalId === signalId) {
          this.phases.delete(id);
        }
      });
      Array.from(this.detectors.entries()).forEach(([id, detector]) => {
        if (detector.signalId === signalId) {
          this.detectors.delete(id);
        }
      });
    }
  }
  async getPhases() {
    return Array.from(this.phases.values());
  }
  async getPhasesBySignal(signalId) {
    return Array.from(this.phases.values()).filter((p) => p.signalId === signalId);
  }
  async createPhase(phaseData) {
    const id = randomUUID();
    const phase = {
      id,
      ...phaseData,
      isPedestrian: phaseData.isPedestrian ?? false,
      isOverlap: phaseData.isOverlap ?? false,
      channelOutput: phaseData.channelOutput || null,
      compassBearing: phaseData.compassBearing || null,
      postedSpeedLimit: phaseData.postedSpeedLimit || null,
      vehicleDetectionIds: phaseData.vehicleDetectionIds || null,
      pedAudibleEnabled: phaseData.pedAudibleEnabled ?? false
    };
    this.phases.set(id, phase);
    return phase;
  }
  async updatePhase(id, phaseData) {
    const existing = this.phases.get(id);
    if (!existing) {
      throw new Error("Phase not found");
    }
    const updated = { ...existing, ...phaseData };
    this.phases.set(id, updated);
    return updated;
  }
  async deletePhase(id) {
    this.phases.delete(id);
  }
  async getDetectors() {
    return Array.from(this.detectors.values());
  }
  async getDetectorsBySignal(signalId) {
    return Array.from(this.detectors.values()).filter((d) => d.signalId === signalId);
  }
  async createDetector(detectorData) {
    const id = randomUUID();
    const detector = {
      id,
      ...detectorData,
      description: detectorData.description || null,
      vehicleType: detectorData.vehicleType || null,
      lane: detectorData.lane || null,
      length: detectorData.length || null,
      stopbarSetback: detectorData.stopbarSetback ?? null
    };
    this.detectors.set(id, detector);
    return detector;
  }
  async updateDetector(id, detectorData) {
    const existing = this.detectors.get(id);
    if (!existing) {
      throw new Error("Detector not found");
    }
    const updated = { ...existing, ...detectorData };
    this.detectors.set(id, updated);
    return updated;
  }
  async deleteDetector(id) {
    this.detectors.delete(id);
  }
  async getAllData() {
    return {
      agency: this.agency,
      signals: Array.from(this.signals.values()),
      phases: Array.from(this.phases.values()),
      detectors: Array.from(this.detectors.values())
    };
  }
};
var storage = new MemStorage();

// shared/schema.ts
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var agencies = pgTable("agencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: text("agency_id").notNull().unique(),
  agencyName: text("agency_name").notNull(),
  agencyUrl: text("agency_url"),
  agencyTimezone: text("agency_timezone").notNull(),
  agencyLanguage: text("agency_language").default("en"),
  agencyEmail: text("agency_email"),
  latitude: real("latitude"),
  longitude: real("longitude")
});
var signals = pgTable("signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signalId: text("signal_id").notNull().unique(),
  agencyId: text("agency_id").notNull(),
  streetName1: text("street_name_1").notNull(),
  streetName2: text("street_name_2").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull()
});
var approaches = pgTable("approaches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  approachId: text("approach_id").notNull(),
  signalId: text("signal_id").notNull(),
  streetName: text("street_name").notNull(),
  compassBearing: integer("compass_bearing"),
  postedSpeed: integer("posted_speed")
});
var phases = pgTable("phases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phase: integer("phase").notNull(),
  signalId: text("signal_id").notNull(),
  movementType: text("movement_type").notNull(),
  isPedestrian: boolean("is_pedestrian").default(false),
  numOfLanes: integer("num_of_lanes").default(1),
  approachId: text("approach_id"),
  isOverlap: boolean("is_overlap").default(false)
});
var detectors = pgTable("detectors", {
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
  stopbarSetbackDist: real("stopbar_setback_dist")
});
var basicTimings = pgTable("basic_timings", {
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
  pedRecall: boolean("ped_recall").default(false)
});
var insertAgencySchema = createInsertSchema(agencies).omit({
  id: true
}).extend({
  agencyLanguage: z.string().optional()
});
var insertSignalSchema = createInsertSchema(signals).omit({
  id: true
}).extend({
  signalId: z.string().optional()
});
var insertApproachSchema = createInsertSchema(approaches).omit({
  id: true
}).extend({
  approachId: z.string().optional()
});
var insertPhaseSchema = createInsertSchema(phases).omit({
  id: true
});
var insertDetectorSchema = createInsertSchema(detectors).omit({
  id: true
});
var insertBasicTimingSchema = createInsertSchema(basicTimings).omit({
  id: true
}).extend({
  vehRecallType: z.enum(["None", "Min", "Max", "Soft"]).optional()
});

// server/routes.ts
import archiver from "archiver";
async function registerRoutes(app2) {
  app2.get("/api/agency", async (req, res) => {
    try {
      const agency = await storage.getAgency();
      res.json(agency);
    } catch (error) {
      res.status(500).json({ message: "Failed to get agency" });
    }
  });
  app2.post("/api/agency", async (req, res) => {
    try {
      const validatedData = insertAgencySchema.parse(req.body);
      const agency = await storage.createOrUpdateAgency(validatedData);
      res.json(agency);
    } catch (error) {
      res.status(400).json({ message: "Invalid agency data" });
    }
  });
  app2.get("/api/signals", async (req, res) => {
    try {
      const signals2 = await storage.getSignals();
      res.json(signals2);
    } catch (error) {
      res.status(500).json({ message: "Failed to get signals" });
    }
  });
  app2.post("/api/signals", async (req, res) => {
    try {
      const validatedData = insertSignalSchema.parse(req.body);
      if (!validatedData.signalId || validatedData.signalId.trim() === "") {
        const existingSignals = await storage.getSignals();
        const signalCount = existingSignals.length + 1;
        validatedData.signalId = `SIG_${signalCount.toString().padStart(3, "0")}`;
      }
      const signal = await storage.createSignal(validatedData);
      res.json(signal);
    } catch (error) {
      res.status(400).json({ message: "Invalid signal data" });
    }
  });
  app2.put("/api/signals/:signalId", async (req, res) => {
    try {
      const { signalId } = req.params;
      const validatedData = insertSignalSchema.partial().parse(req.body);
      const signal = await storage.updateSignal(signalId, validatedData);
      res.json(signal);
    } catch (error) {
      res.status(400).json({ message: "Invalid signal data or signal not found" });
    }
  });
  app2.delete("/api/signals/:signalId", async (req, res) => {
    try {
      const { signalId } = req.params;
      await storage.deleteSignal(signalId);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete signal" });
    }
  });
  app2.get("/api/phases", async (req, res) => {
    try {
      const phases2 = await storage.getPhases();
      res.json(phases2);
    } catch (error) {
      res.status(500).json({ message: "Failed to get phases" });
    }
  });
  app2.post("/api/phases", async (req, res) => {
    try {
      const validatedData = insertPhaseSchema.parse(req.body);
      const phase = await storage.createPhase(validatedData);
      res.json(phase);
    } catch (error) {
      res.status(400).json({ message: "Invalid phase data" });
    }
  });
  app2.put("/api/phases/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertPhaseSchema.partial().parse(req.body);
      const phase = await storage.updatePhase(id, validatedData);
      res.json(phase);
    } catch (error) {
      res.status(400).json({ message: "Invalid phase data or phase not found" });
    }
  });
  app2.delete("/api/phases/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePhase(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete phase" });
    }
  });
  app2.get("/api/detectors", async (req, res) => {
    try {
      const detectors2 = await storage.getDetectors();
      res.json(detectors2);
    } catch (error) {
      res.status(500).json({ message: "Failed to get detectors" });
    }
  });
  app2.post("/api/detectors", async (req, res) => {
    try {
      const validatedData = insertDetectorSchema.parse(req.body);
      const detector = await storage.createDetector(validatedData);
      res.json(detector);
    } catch (error) {
      res.status(400).json({ message: "Invalid detector data" });
    }
  });
  app2.put("/api/detectors/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertDetectorSchema.partial().parse(req.body);
      const detector = await storage.updateDetector(id, validatedData);
      res.json(detector);
    } catch (error) {
      res.status(400).json({ message: "Invalid detector data or detector not found" });
    }
  });
  app2.delete("/api/detectors/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteDetector(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete detector" });
    }
  });
  app2.post("/api/export", async (req, res) => {
    try {
      const data = await storage.getAllData();
      const csvData = {
        agency: generateAgencyCSV(data.agency),
        signals: generateSignalsCSV(data.signals),
        phases: generatePhasesCSV(data.phases),
        detection: generateDetectionCSV(data.detectors)
      };
      const archive = archiver("zip", { zlib: { level: 9 } });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="gtss-export.zip"');
      archive.pipe(res);
      archive.append(csvData.agency, { name: "agency.txt" });
      archive.append(csvData.signals, { name: "signals.txt" });
      archive.append(csvData.phases, { name: "phases.txt" });
      archive.append(csvData.detection, { name: "detection.txt" });
      await archive.finalize();
    } catch (error) {
      res.status(500).json({ message: "Failed to generate export" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}
function generateAgencyCSV(agency) {
  if (!agency) return "AgencyID,Agency_Name,Agency_URL,Agency_timezone,Agency_Language,contact_person,contact_email\n";
  const headers = "AgencyID,Agency_Name,Agency_URL,Agency_timezone,Agency_Language,contact_person,contact_email\n";
  const row = `${agency.agencyId},"${agency.agencyName}","${agency.agencyUrl || ""}",${agency.agencyTimezone},${agency.agencyLanguage || ""},"${agency.contactPerson || ""}","${agency.contactEmail || ""}"
`;
  return headers + row;
}
function generateSignalsCSV(signals2) {
  const headers = "SignalID,AgencyID,Street_Name1,Street_Name2,Cnt_lat,Cnt_lon,Control_Type,Cabinet_Type,Cabinet_Lat,Cabinet_Lon,has_BatteryBackup,has_CCTV\n";
  const rows = signals2.map(
    (s) => `${s.signalId},${s.agencyId},"${s.streetName1}","${s.streetName2}",${s.cntLat},${s.cntLon},"${s.controlType}","${s.cabinetType || ""}",${s.cabinetLat || ""},${s.cabinetLon || ""},${s.hasBatteryBackup},${s.hasCctv}`
  ).join("\n");
  return headers + (rows ? rows + "\n" : "");
}
function generatePhasesCSV(phases2) {
  const movementTypeMap = {
    "Through": "T",
    "Left Turn": "L",
    "Left Through Shared": "LT",
    "Permissive Phase": "TL",
    "Flashing Yellow Arrow": "FYA",
    "U-Turn": "U",
    "Right Turn": "R",
    "Through-Right": "TR",
    "Pedestrian": "PED"
  };
  const headers = "Phase,SignalID,Movement_Type,is_pedestrian,is_overlap,channel_output,Compass_Bearing,Posted_Speed_Limit,vehicle_detection_ids,ped_audible_enabled\n";
  const rows = phases2.map((p) => {
    const shorthandMovementType = movementTypeMap[p.movementType] || p.movementType;
    return `${p.phase},${p.signalId},"${shorthandMovementType}",${p.isPedestrian},${p.isOverlap},"${p.channelOutput || ""}",${p.compassBearing || ""},${p.postedSpeedLimit || ""},"${p.vehicleDetectionIds || ""}",${p.pedAudibleEnabled}`;
  }).join("\n");
  return headers + (rows ? rows + "\n" : "");
}
function generateDetectionCSV(detectors2) {
  const headers = "SignalID,Detector_Channel,Phase,Description,Purpose,Vehicle_Type,Lane,Det_Technology_Type,Length,Stopbar_Setback\n";
  const rows = detectors2.map(
    (d) => `${d.signalId},"${d.detectorChannel}",${d.phase},"${d.description || ""}","${d.purpose}","${d.vehicleType || ""}","${d.lane || ""}","${d.detTechnologyType}",${d.length || ""},${d.stopbarSetback ?? ""}`
  ).join("\n");
  return headers + (rows ? rows + "\n" : "");
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  envDir: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      // Required for Vite HMR in dev
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://nominatim.openstreetmap.org", "https://ipapi.co", "wss:", "ws:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  // Required for map tiles
  crossOriginResourcePolicy: { policy: "cross-origin" }
  // Required for external resources
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:5000", "http://localhost:3000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
var apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: 100,
  // Limit each IP to 100 requests per windowMs
  message: { message: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.path.startsWith("/api")
  // Only limit API routes
});
app.use(apiLimiter);
app.use(express2.json({ limit: "1mb" }));
app.use(express2.urlencoded({ extended: false, limit: "1mb" }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
