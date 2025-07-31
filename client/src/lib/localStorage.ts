import { Agency, Signal, Phase, Detector, InsertAgency, InsertSignal, InsertPhase, InsertDetector } from '@shared/schema';
import { nanoid } from 'nanoid';

// Storage keys
const STORAGE_KEYS = {
  AGENCY: 'gtss_agency',
  SIGNALS: 'gtss_signals', 
  PHASES: 'gtss_phases',
  DETECTORS: 'gtss_detectors',
};

// Helper function to safely parse JSON from localStorage
function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Helper function to save to localStorage
function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
}

// Agency operations
export const agencyStorage = {
  get: (): Agency | null => {
    return getFromStorage<Agency | null>(STORAGE_KEYS.AGENCY, null);
  },

  save: (agency: InsertAgency): Agency => {
    const existingAgency = agencyStorage.get();
    const newAgency: Agency = {
      id: existingAgency?.id || nanoid(),
      agencyId: agency.agencyId,
      agencyName: agency.agencyName,
      agencyUrl: agency.agencyUrl ?? null,
      agencyTimezone: agency.agencyTimezone,
      agencyLanguage: agency.agencyLanguage ?? null,
      contactPerson: agency.contactPerson ?? null,
      contactEmail: agency.contactEmail ?? null,
      agencyLat: agency.agencyLat ?? null,
      agencyLon: agency.agencyLon ?? null,
    };
    saveToStorage(STORAGE_KEYS.AGENCY, newAgency);
    return newAgency;
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.AGENCY);
  },
};

// Signal operations
export const signalStorage = {
  getAll: (): Signal[] => {
    return getFromStorage<Signal[]>(STORAGE_KEYS.SIGNALS, []);
  },

  get: (signalId: string): Signal | undefined => {
    const signals = signalStorage.getAll();
    return signals.find(s => s.signalId === signalId);
  },

  save: (signal: InsertSignal): Signal => {
    const signals = signalStorage.getAll();
    const newSignal: Signal = {
      id: nanoid(),
      agencyId: signal.agencyId,
      signalId: signal.signalId || `SIG_${String(signals.length + 1).padStart(3, '0')}`,
      streetName1: signal.streetName1,
      streetName2: signal.streetName2,
      cntLat: signal.cntLat,
      cntLon: signal.cntLon,
      controlType: signal.controlType,
      cabinetType: signal.cabinetType ?? null,
      cabinetLat: signal.cabinetLat ?? null,
      cabinetLon: signal.cabinetLon ?? null,
      hasBatteryBackup: signal.hasBatteryBackup ?? null,
      hasCctv: signal.hasCctv ?? null,
    };
    
    const updatedSignals = [...signals, newSignal];
    saveToStorage(STORAGE_KEYS.SIGNALS, updatedSignals);
    return newSignal;
  },

  update: (signalId: string, updates: Partial<InsertSignal>): Signal | null => {
    const signals = signalStorage.getAll();
    const index = signals.findIndex(s => s.signalId === signalId);
    
    if (index === -1) return null;
    
    const updatedSignal = { ...signals[index], ...updates };
    signals[index] = updatedSignal;
    saveToStorage(STORAGE_KEYS.SIGNALS, signals);
    return updatedSignal;
  },

  delete: (signalId: string): void => {
    const signals = signalStorage.getAll();
    const updatedSignals = signals.filter(s => s.signalId !== signalId);
    saveToStorage(STORAGE_KEYS.SIGNALS, updatedSignals);
    
    // Also delete related phases and detectors
    phaseStorage.deleteBySignal(signalId);
    detectorStorage.deleteBySignal(signalId);
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.SIGNALS);
  },
};

// Phase operations
export const phaseStorage = {
  getAll: (): Phase[] => {
    return getFromStorage<Phase[]>(STORAGE_KEYS.PHASES, []);
  },

  getBySignal: (signalId: string): Phase[] => {
    const phases = phaseStorage.getAll();
    return phases.filter(p => p.signalId === signalId);
  },

  save: (phase: InsertPhase): Phase => {
    const phases = phaseStorage.getAll();
    const newPhase: Phase = {
      id: nanoid(),
      signalId: phase.signalId,
      phase: phase.phase,
      movementType: phase.movementType,
      isPedestrian: phase.isPedestrian ?? null,
      isOverlap: phase.isOverlap ?? null,
      channelOutput: phase.channelOutput ?? null,
      compassBearing: phase.compassBearing ?? null,
      postedSpeedLimit: phase.postedSpeedLimit ?? null,
      vehicleDetectionIds: phase.vehicleDetectionIds ?? null,
      pedAudibleEnabled: phase.pedAudibleEnabled ?? null,
    };
    
    const updatedPhases = [...phases, newPhase];
    saveToStorage(STORAGE_KEYS.PHASES, updatedPhases);
    return newPhase;
  },

  update: (id: string, updates: Partial<InsertPhase>): Phase | null => {
    const phases = phaseStorage.getAll();
    const index = phases.findIndex(p => p.id === id);
    
    if (index === -1) return null;
    
    const updatedPhase = { ...phases[index], ...updates };
    phases[index] = updatedPhase;
    saveToStorage(STORAGE_KEYS.PHASES, phases);
    return updatedPhase;
  },

  delete: (id: string): void => {
    const phases = phaseStorage.getAll();
    const updatedPhases = phases.filter(p => p.id !== id);
    saveToStorage(STORAGE_KEYS.PHASES, updatedPhases);
  },

  deleteBySignal: (signalId: string): void => {
    const phases = phaseStorage.getAll();
    const updatedPhases = phases.filter(p => p.signalId !== signalId);
    saveToStorage(STORAGE_KEYS.PHASES, updatedPhases);
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.PHASES);
  },
};

// Detector operations
export const detectorStorage = {
  getAll: (): Detector[] => {
    return getFromStorage<Detector[]>(STORAGE_KEYS.DETECTORS, []);
  },

  getBySignal: (signalId: string): Detector[] => {
    const detectors = detectorStorage.getAll();
    return detectors.filter(d => d.signalId === signalId);
  },

  save: (detector: InsertDetector): Detector => {
    const detectors = detectorStorage.getAll();
    const newDetector: Detector = {
      id: nanoid(),
      signalId: detector.signalId,
      phase: detector.phase,
      detectorChannel: detector.detectorChannel,
      description: detector.description ?? null,
      purpose: detector.purpose,
      vehicleType: detector.vehicleType ?? null,
      lane: detector.lane ?? null,
      detTechnologyType: detector.detTechnologyType,
      length: detector.length ?? null,
      stopbarSetback: detector.stopbarSetback ?? null,
    };
    
    const updatedDetectors = [...detectors, newDetector];
    saveToStorage(STORAGE_KEYS.DETECTORS, updatedDetectors);
    return newDetector;
  },

  update: (id: string, updates: Partial<InsertDetector>): Detector | null => {
    const detectors = detectorStorage.getAll();
    const index = detectors.findIndex(d => d.id === id);
    
    if (index === -1) return null;
    
    const updatedDetector = { ...detectors[index], ...updates };
    detectors[index] = updatedDetector;
    saveToStorage(STORAGE_KEYS.DETECTORS, detectors);
    return updatedDetector;
  },

  delete: (id: string): void => {
    const detectors = detectorStorage.getAll();
    const updatedDetectors = detectors.filter(d => d.id !== id);
    saveToStorage(STORAGE_KEYS.DETECTORS, updatedDetectors);
  },

  deleteBySignal: (signalId: string): void => {
    const detectors = detectorStorage.getAll();
    const updatedDetectors = detectors.filter(d => d.signalId !== signalId);
    saveToStorage(STORAGE_KEYS.DETECTORS, updatedDetectors);
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.DETECTORS);
  },
};

// Export all data
export const exportData = () => {
  return {
    agency: agencyStorage.get(),
    signals: signalStorage.getAll(),
    phases: phaseStorage.getAll(),
    detectors: detectorStorage.getAll(),
  };
};

// Clear all data
export const clearAllData = () => {
  agencyStorage.clear();
  signalStorage.clear();
  phaseStorage.clear();
  detectorStorage.clear();
};

// CSV export functions
function generateAgencyCSV(agency: Agency | null): string {
  if (!agency) return 'agency_id,agency_name,agency_url,agency_timezone,agency_lang,contact_person,contact_email\n';
  
  return [
    'agency_id,agency_name,agency_url,agency_timezone,agency_lang,contact_person,contact_email',
    `"${agency.agencyId}","${agency.agencyName}","${agency.agencyUrl || ''}","${agency.agencyTimezone}","${agency.agencyLanguage || ''}","${agency.contactPerson || ''}","${agency.contactEmail || ''}"`
  ].join('\n');
}

function generateSignalsCSV(signals: Signal[]): string {
  const headers = 'signal_id,cnt_lat,cnt_lon,street_name_1,street_name_2,control_type,cabinet_type';
  
  if (signals.length === 0) return headers + '\n';
  
  const rows = signals.map(signal => 
    `"${signal.signalId}","${signal.cntLat}","${signal.cntLon}","${signal.streetName1}","${signal.streetName2}","${signal.controlType}","${signal.cabinetType || ''}"`
  );
  
  return [headers, ...rows].join('\n');
}

function generatePhasesCSV(phases: Phase[]): string {
  const headers = 'signal_id,phase,movement_type,is_pedestrian,is_overlap,channel_output,compass_bearing,posted_speed_limit,vehicle_detection_ids,ped_audible_enabled';
  
  if (phases.length === 0) return headers + '\n';
  
  const rows = phases.map(phase => 
    `"${phase.signalId}","${phase.phase}","${phase.movementType}","${phase.isPedestrian || false}","${phase.isOverlap || false}","${phase.channelOutput || ''}","${phase.compassBearing || ''}","${phase.postedSpeedLimit || ''}","${phase.vehicleDetectionIds || ''}","${phase.pedAudibleEnabled || false}"`
  );
  
  return [headers, ...rows].join('\n');
}

function generateDetectionCSV(detectors: Detector[]): string {
  const headers = 'signal_id,detector_channel,phase,description,purpose,vehicle_type,lane,det_technology_type,length,stopbar_setback';
  
  if (detectors.length === 0) return headers + '\n';
  
  const rows = detectors.map(detector => 
    `"${detector.signalId}","${detector.detectorChannel}","${detector.phase}","${detector.description || ''}","${detector.purpose}","${detector.vehicleType || ''}","${detector.lane || ''}","${detector.detTechnologyType}","${detector.length || ''}","${detector.stopbarSetback || ''}"`
  );
  
  return [headers, ...rows].join('\n');
}

// Export as ZIP (browser implementation)
export const exportAsZip = async (): Promise<void> => {
  try {
    // Check if the browser supports the compression streams API
    if (!('CompressionStream' in window)) {
      throw new Error('ZIP compression not supported in this browser');
    }

    const data = exportData();
    
    // Generate CSV content
    const csvFiles = {
      'agency.txt': generateAgencyCSV(data.agency),
      'signals.txt': generateSignalsCSV(data.signals),
      'phases.txt': generatePhasesCSV(data.phases),
      'detection.txt': generateDetectionCSV(data.detectors),
    };

    // Create a simple ZIP-like structure using a blob
    let zipContent = '';
    Object.entries(csvFiles).forEach(([filename, content]) => {
      zipContent += `=== ${filename} ===\n${content}\n\n`;
    });

    // Create and download the file
    const blob = new Blob([zipContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gtss-export-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
};