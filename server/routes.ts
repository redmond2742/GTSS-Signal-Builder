import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAgencySchema, insertSignalSchema, insertPhaseSchema, insertDetectorSchema } from "@shared/schema";
import archiver from "archiver";

export async function registerRoutes(app: Express): Promise<Server> {
  // Agency routes
  app.get("/api/agency", async (req, res) => {
    try {
      const agency = await storage.getAgency();
      res.json(agency);
    } catch (error) {
      res.status(500).json({ message: "Failed to get agency" });
    }
  });

  app.post("/api/agency", async (req, res) => {
    try {
      const validatedData = insertAgencySchema.parse(req.body);
      const agency = await storage.createOrUpdateAgency(validatedData);
      res.json(agency);
    } catch (error) {
      res.status(400).json({ message: "Invalid agency data" });
    }
  });

  // Signal routes
  app.get("/api/signals", async (req, res) => {
    try {
      const signals = await storage.getSignals();
      res.json(signals);
    } catch (error) {
      res.status(500).json({ message: "Failed to get signals" });
    }
  });

  app.post("/api/signals", async (req, res) => {
    try {
      const validatedData = insertSignalSchema.parse(req.body);
      
      // Auto-generate Signal ID if not provided
      if (!validatedData.signalId || validatedData.signalId.trim() === "") {
        const existingSignals = await storage.getSignals();
        const signalCount = existingSignals.length + 1;
        validatedData.signalId = `SIG_${signalCount.toString().padStart(3, '0')}`;
      }
      
      const signal = await storage.createSignal(validatedData);
      res.json(signal);
    } catch (error) {
      res.status(400).json({ message: "Invalid signal data" });
    }
  });

  app.put("/api/signals/:signalId", async (req, res) => {
    try {
      const { signalId } = req.params;
      const validatedData = insertSignalSchema.partial().parse(req.body);
      const signal = await storage.updateSignal(signalId, validatedData);
      res.json(signal);
    } catch (error) {
      res.status(400).json({ message: "Invalid signal data or signal not found" });
    }
  });

  app.delete("/api/signals/:signalId", async (req, res) => {
    try {
      const { signalId } = req.params;
      await storage.deleteSignal(signalId);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete signal" });
    }
  });

  // Phase routes
  app.get("/api/phases", async (req, res) => {
    try {
      const phases = await storage.getPhases();
      res.json(phases);
    } catch (error) {
      res.status(500).json({ message: "Failed to get phases" });
    }
  });

  app.post("/api/phases", async (req, res) => {
    try {
      const validatedData = insertPhaseSchema.parse(req.body);
      const phase = await storage.createPhase(validatedData);
      res.json(phase);
    } catch (error) {
      res.status(400).json({ message: "Invalid phase data" });
    }
  });

  app.put("/api/phases/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertPhaseSchema.partial().parse(req.body);
      const phase = await storage.updatePhase(id, validatedData);
      res.json(phase);
    } catch (error) {
      res.status(400).json({ message: "Invalid phase data or phase not found" });
    }
  });

  app.delete("/api/phases/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePhase(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete phase" });
    }
  });

  // Detector routes
  app.get("/api/detectors", async (req, res) => {
    try {
      const detectors = await storage.getDetectors();
      res.json(detectors);
    } catch (error) {
      res.status(500).json({ message: "Failed to get detectors" });
    }
  });

  app.post("/api/detectors", async (req, res) => {
    try {
      const validatedData = insertDetectorSchema.parse(req.body);
      const detector = await storage.createDetector(validatedData);
      res.json(detector);
    } catch (error) {
      res.status(400).json({ message: "Invalid detector data" });
    }
  });

  app.put("/api/detectors/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertDetectorSchema.partial().parse(req.body);
      const detector = await storage.updateDetector(id, validatedData);
      res.json(detector);
    } catch (error) {
      res.status(400).json({ message: "Invalid detector data or detector not found" });
    }
  });

  app.delete("/api/detectors/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteDetector(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete detector" });
    }
  });

  // Export route
  app.post("/api/export", async (req, res) => {
    try {
      const data = await storage.getAllData();
      
      // Create CSV content
      const csvData = {
        agency: generateAgencyCSV(data.agency),
        signals: generateSignalsCSV(data.signals),
        phases: generatePhasesCSV(data.phases),
        detection: generateDetectionCSV(data.detectors),
      };

      // Create ZIP file
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="gtss-export.zip"');
      
      archive.pipe(res);
      
      // Add CSV files to archive
      archive.append(csvData.agency, { name: 'agency.txt' });
      archive.append(csvData.signals, { name: 'signals.txt' });
      archive.append(csvData.phases, { name: 'phases.txt' });
      archive.append(csvData.detection, { name: 'detection.txt' });
      
      await archive.finalize();
    } catch (error) {
      res.status(500).json({ message: "Failed to generate export" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

function generateAgencyCSV(agency: any): string {
  if (!agency) return 'AgencyID,Agency_Name,Agency_URL,Agency_timezone,Agency_Language,contact_person,contact_email\n';
  
  const headers = 'AgencyID,Agency_Name,Agency_URL,Agency_timezone,Agency_Language,contact_person,contact_email\n';
  const row = `${agency.agencyId},"${agency.agencyName}","${agency.agencyUrl || ''}",${agency.agencyTimezone},${agency.agencyLanguage || ''},"${agency.contactPerson || ''}","${agency.contactEmail || ''}"\n`;
  return headers + row;
}

function generateSignalsCSV(signals: any[]): string {
  const headers = 'SignalID,AgencyID,Street_Name1,Street_Name2,Cnt_lat,Cnt_lon,Control_Type,Cabinet_Type,Cabinet_Lat,Cabinet_Lon,has_BatteryBackup,has_CCTV\n';
  const rows = signals.map(s => 
    `${s.signalId},${s.agencyId},"${s.streetName1}","${s.streetName2}",${s.cntLat},${s.cntLon},"${s.controlType}","${s.cabinetType || ''}",${s.cabinetLat || ''},${s.cabinetLon || ''},${s.hasBatteryBackup},${s.hasCctv}`
  ).join('\n');
  return headers + (rows ? rows + '\n' : '');
}

function generatePhasesCSV(phases: any[]): string {
  const headers = 'Phase,SignalID,Movement_Type,is_pedestrian,is_overlap,channel_output,Compass_Bearing,Posted_Speed_Limit,vehicle_detection_ids,ped_audible_enabled\n';
  const rows = phases.map(p => 
    `${p.phase},${p.signalId},"${p.movementType}",${p.isPedestrian},${p.isOverlap},"${p.channelOutput || ''}",${p.compassBearing || ''},${p.postedSpeedLimit || ''},"${p.vehicleDetectionIds || ''}",${p.pedAudibleEnabled}`
  ).join('\n');
  return headers + (rows ? rows + '\n' : '');
}

function generateDetectionCSV(detectors: any[]): string {
  const headers = 'SignalID,Detector_Channel,Phase,Description,Purpose,Vehicle_Type,Lane,Det_Technology_Type,Length,Stopbar_Setback\n';
  const rows = detectors.map(d => 
    `${d.signalId},"${d.detectorChannel}",${d.phase},"${d.description || ''}","${d.purpose}","${d.vehicleType || ''}","${d.lane || ''}","${d.detTechnologyType}",${d.length || ''},${d.stopbarSetback || ''}`
  ).join('\n');
  return headers + (rows ? rows + '\n' : '');
}
