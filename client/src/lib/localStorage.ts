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
      agencyEmail: agency.agencyEmail ?? null,
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
      latitude: signal.latitude,
      longitude: signal.longitude,

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
      numOfLanes: phase.numOfLanes ?? 1,
      compassBearing: phase.compassBearing ?? null,
      postedSpeed: phase.postedSpeed ?? null,
      isOverlap: phase.isOverlap ?? false,
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
      channel: detector.channel,
      description: detector.description ?? null,
      purpose: detector.purpose,
      vehicleType: detector.vehicleType ?? null,
      lane: detector.lane ?? null,
      technologyType: detector.technologyType,
      length: detector.length ?? null,
      stopbarSetbackDist: detector.stopbarSetbackDist ?? null,
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
  if (!agency) return 'agency_id,agency_name,agency_url,agency_timezone,agency_language,agency_email\n';
  
  return [
    'agency_id,agency_name,agency_url,agency_timezone,agency_language,agency_email',
    `"${agency.agencyId}","${agency.agencyName}","${agency.agencyUrl || ''}","${agency.agencyTimezone}","${agency.agencyLanguage || ''}","${agency.agencyEmail || ''}"`
  ].join('\n');
}

function generateSignalsCSV(signals: Signal[]): string {
  const headers = 'signal_id,agency_id,street_name_1,street_name_2,latitude,longitude';
  
  if (signals.length === 0) return headers + '\n';
  
  const rows = signals.map(signal => 
    `"${signal.signalId}","${signal.agencyId}","${signal.streetName1}","${signal.streetName2}","${signal.latitude}","${signal.longitude}"`
  );
  
  return [headers, ...rows].join('\n');
}

function generatePhasesCSV(phases: Phase[]): string {
  const headers = 'phase,signal_id,movement_type,num_of_lanes,compass_bearing,posted_speed,is_overlap';
  
  if (phases.length === 0) return headers + '\n';
  
  const rows = phases.map(phase => 
    `"${phase.phase}","${phase.signalId}","${phase.movementType}","${phase.numOfLanes || 1}","${phase.compassBearing || ''}","${phase.postedSpeed || ''}","${phase.isOverlap || false}"`
  );
  
  return [headers, ...rows].join('\n');
}

function generateDetectionCSV(detectors: Detector[]): string {
  const headers = 'channel,signal_id,phase,description,purpose,vehicle_type,lane,technology_type,length,stopbar_setback_dist';
  
  if (detectors.length === 0) return headers + '\n';
  
  const rows = detectors.map(detector => 
    `"${detector.channel}","${detector.signalId}","${detector.phase}","${detector.description || ''}","${detector.purpose}","${detector.vehicleType || ''}","${detector.lane || ''}","${detector.technologyType}","${detector.length || ''}","${detector.stopbarSetbackDist || ''}"`
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
      'agency.csv': generateAgencyCSV(data.agency),
      'signals.csv': generateSignalsCSV(data.signals),
      'phases.csv': generatePhasesCSV(data.phases),
      'detection.csv': generateDetectionCSV(data.detectors),
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