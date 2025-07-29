import { type Agency, type InsertAgency, type Signal, type InsertSignal, type Phase, type InsertPhase, type Detector, type InsertDetector, type GTSSData } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Agency methods
  getAgency(): Promise<Agency | undefined>;
  createOrUpdateAgency(agency: InsertAgency): Promise<Agency>;

  // Signal methods
  getSignals(): Promise<Signal[]>;
  getSignal(signalId: string): Promise<Signal | undefined>;
  createSignal(signal: InsertSignal): Promise<Signal>;
  updateSignal(signalId: string, signal: Partial<InsertSignal>): Promise<Signal>;
  deleteSignal(signalId: string): Promise<void>;

  // Phase methods
  getPhases(): Promise<Phase[]>;
  getPhasesBySignal(signalId: string): Promise<Phase[]>;
  createPhase(phase: InsertPhase): Promise<Phase>;
  updatePhase(id: string, phase: Partial<InsertPhase>): Promise<Phase>;
  deletePhase(id: string): Promise<void>;

  // Detector methods
  getDetectors(): Promise<Detector[]>;
  getDetectorsBySignal(signalId: string): Promise<Detector[]>;
  createDetector(detector: InsertDetector): Promise<Detector>;
  updateDetector(id: string, detector: Partial<InsertDetector>): Promise<Detector>;
  deleteDetector(id: string): Promise<void>;

  // Export method
  getAllData(): Promise<GTSSData>;
}

export class MemStorage implements IStorage {
  private agency: Agency | null = null;
  private signals: Map<string, Signal> = new Map();
  private phases: Map<string, Phase> = new Map();
  private detectors: Map<string, Detector> = new Map();

  async getAgency(): Promise<Agency | undefined> {
    return this.agency || undefined;
  }

  async createOrUpdateAgency(agencyData: InsertAgency): Promise<Agency> {
    const agency: Agency = {
      id: this.agency?.id || randomUUID(),
      ...agencyData,
      agencyUrl: agencyData.agencyUrl || null,
      agencyLanguage: agencyData.agencyLanguage || null,
      contactPerson: agencyData.contactPerson || null,
      contactEmail: agencyData.contactEmail || null,
    };
    this.agency = agency;
    return agency;
  }

  async getSignals(): Promise<Signal[]> {
    return Array.from(this.signals.values());
  }

  async getSignal(signalId: string): Promise<Signal | undefined> {
    return Array.from(this.signals.values()).find(s => s.signalId === signalId);
  }

  async createSignal(signalData: InsertSignal): Promise<Signal> {
    const id = randomUUID();
    const signal: Signal = { 
      id, 
      ...signalData,
      cabinetType: signalData.cabinetType || null,
      cabinetLat: signalData.cabinetLat || null,
      cabinetLon: signalData.cabinetLon || null,
      hasBatteryBackup: signalData.hasBatteryBackup ?? false,
      hasCctv: signalData.hasCctv ?? false,
    };
    this.signals.set(id, signal);
    return signal;
  }

  async updateSignal(signalId: string, signalData: Partial<InsertSignal>): Promise<Signal> {
    const existing = Array.from(this.signals.values()).find(s => s.signalId === signalId);
    if (!existing) {
      throw new Error("Signal not found");
    }
    const updated: Signal = { ...existing, ...signalData };
    this.signals.set(existing.id, updated);
    return updated;
  }

  async deleteSignal(signalId: string): Promise<void> {
    const existing = Array.from(this.signals.values()).find(s => s.signalId === signalId);
    if (existing) {
      this.signals.delete(existing.id);
      // Also delete related phases and detectors
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

  async getPhases(): Promise<Phase[]> {
    return Array.from(this.phases.values());
  }

  async getPhasesBySignal(signalId: string): Promise<Phase[]> {
    return Array.from(this.phases.values()).filter(p => p.signalId === signalId);
  }

  async createPhase(phaseData: InsertPhase): Promise<Phase> {
    const id = randomUUID();
    const phase: Phase = { 
      id, 
      ...phaseData,
      isPedestrian: phaseData.isPedestrian ?? false,
      isOverlap: phaseData.isOverlap ?? false,
      channelOutput: phaseData.channelOutput || null,
      compassBearing: phaseData.compassBearing || null,
      postedSpeedLimit: phaseData.postedSpeedLimit || null,
      vehicleDetectionIds: phaseData.vehicleDetectionIds || null,
      pedAudibleEnabled: phaseData.pedAudibleEnabled ?? false,
    };
    this.phases.set(id, phase);
    return phase;
  }

  async updatePhase(id: string, phaseData: Partial<InsertPhase>): Promise<Phase> {
    const existing = this.phases.get(id);
    if (!existing) {
      throw new Error("Phase not found");
    }
    const updated: Phase = { ...existing, ...phaseData };
    this.phases.set(id, updated);
    return updated;
  }

  async deletePhase(id: string): Promise<void> {
    this.phases.delete(id);
  }

  async getDetectors(): Promise<Detector[]> {
    return Array.from(this.detectors.values());
  }

  async getDetectorsBySignal(signalId: string): Promise<Detector[]> {
    return Array.from(this.detectors.values()).filter(d => d.signalId === signalId);
  }

  async createDetector(detectorData: InsertDetector): Promise<Detector> {
    const id = randomUUID();
    const detector: Detector = { 
      id, 
      ...detectorData,
      description: detectorData.description || null,
      vehicleType: detectorData.vehicleType || null,
      lane: detectorData.lane || null,
      length: detectorData.length || null,
      stopbarSetback: detectorData.stopbarSetback || null,
    };
    this.detectors.set(id, detector);
    return detector;
  }

  async updateDetector(id: string, detectorData: Partial<InsertDetector>): Promise<Detector> {
    const existing = this.detectors.get(id);
    if (!existing) {
      throw new Error("Detector not found");
    }
    const updated: Detector = { ...existing, ...detectorData };
    this.detectors.set(id, updated);
    return updated;
  }

  async deleteDetector(id: string): Promise<void> {
    this.detectors.delete(id);
  }

  async getAllData(): Promise<GTSSData> {
    return {
      agency: this.agency,
      signals: Array.from(this.signals.values()),
      phases: Array.from(this.phases.values()),
      detectors: Array.from(this.detectors.values()),
    };
  }
}

export const storage = new MemStorage();
