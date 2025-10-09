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
      latitude: agency.latitude ?? null,
      longitude: agency.longitude ?? null,
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

// Clear all GTSS data
export const clearAllData = (): void => {
  agencyStorage.clear();
  signalStorage.clear();
  phaseStorage.clear();
  detectorStorage.clear();
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



// CSV export functions
function generateAgencyCSV(agency: Agency | null): string {
  if (!agency) return 'agency_id,agency_name,agency_url,agency_timezone,agency_email\n';
  
  return [
    'agency_id,agency_name,agency_url,agency_timezone,agency_email',
    `${agency.agencyId},${agency.agencyName},${agency.agencyUrl || ''},${agency.agencyTimezone},${agency.agencyEmail || ''}`
  ].join('\n');
}

function generateSignalsCSV(signals: Signal[]): string {
  const headers = 'signal_id,agency_id,street_name_1,street_name_2,latitude,longitude';
  
  if (signals.length === 0) return headers + '\n';
  
  const rows = signals.map(signal => 
    `${signal.signalId},${signal.agencyId},${signal.streetName1},${signal.streetName2},${signal.latitude},${signal.longitude}`
  );
  
  return [headers, ...rows].join('\n');
}

function generatePhasesCSV(phases: Phase[]): string {
  const headers = 'phase,signal_id,movement_type,num_of_lanes,compass_bearing,posted_speed,is_overlap';
  
  if (phases.length === 0) return headers + '\n';
  
  // Movement type encoding mapping
  const movementTypeMap: { [key: string]: string } = {
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
  
  // Sort phases by signal ID first, then by phase number
  const sortedPhases = [...phases].sort((a, b) => {
    if (a.signalId !== b.signalId) {
      return a.signalId.localeCompare(b.signalId);
    }
    return a.phase - b.phase;
  });
  
  const rows = sortedPhases.map(phase => {
    const encodedMovementType = movementTypeMap[phase.movementType] || phase.movementType;
    return `${phase.phase},${phase.signalId},${encodedMovementType},${phase.numOfLanes || 1},${phase.compassBearing || ''},${phase.postedSpeed || ''},${phase.isOverlap || false}`;
  });
  
  return [headers, ...rows].join('\n');
}

function generateDetectionCSV(detectors: Detector[]): string {
  const headers = 'channel,signal_id,phase,description,purpose,vehicle_type,lane,technology_type,length,stopbar_setback_dist';
  
  if (detectors.length === 0) return headers + '\n';
  
  const rows = detectors.map(detector => 
    `${detector.channel},${detector.signalId},${detector.phase},${detector.description || ''},${detector.purpose},${detector.vehicleType || ''},${detector.lane || ''},${detector.technologyType},${detector.length || ''},${detector.stopbarSetbackDist || ''}`
  );
  
  return [headers, ...rows].join('\n');
}

// Download individual TXT files
const downloadFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Export individual TXT files
export const exportAsIndividualFiles = async (includeFiles: {
  agency: boolean;
  signals: boolean;
  phases: boolean;
  detection: boolean;
}): Promise<void> => {
  try {
    const data = exportData();
    
    // Generate and download each selected file
    if (includeFiles.agency) {
      const agencyCSV = generateAgencyCSV(data.agency);
      downloadFile(agencyCSV, 'agency.txt');
    }
    
    if (includeFiles.signals) {
      const signalsCSV = generateSignalsCSV(data.signals);
      downloadFile(signalsCSV, 'signals.txt');
    }
    
    if (includeFiles.phases) {
      const phasesCSV = generatePhasesCSV(data.phases);
      downloadFile(phasesCSV, 'phases.txt');
    }
    
    if (includeFiles.detection) {
      const detectionCSV = generateDetectionCSV(data.detectors);
      downloadFile(detectionCSV, 'detectors.txt');
    }
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
};

// Export as ZIP using JSZip
export const exportAsZip = async (includeFiles: {
  agency: boolean;
  signals: boolean;
  phases: boolean;
  detection: boolean;
} = { agency: true, signals: true, phases: true, detection: true }): Promise<void> => {
  try {
    // Dynamically import JSZip
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    const data = exportData();
    
    // Add selected files to ZIP
    if (includeFiles.agency) {
      const agencyCSV = generateAgencyCSV(data.agency);
      zip.file('agency.txt', agencyCSV);
    }
    
    if (includeFiles.signals) {
      const signalsCSV = generateSignalsCSV(data.signals);
      zip.file('signals.txt', signalsCSV);
    }
    
    if (includeFiles.phases) {
      const phasesCSV = generatePhasesCSV(data.phases);
      zip.file('phases.txt', phasesCSV);
    }
    
    if (includeFiles.detection) {
      const detectionCSV = generateDetectionCSV(data.detectors);
      zip.file('detectors.txt', detectionCSV);
    }

    // Generate ZIP file and download
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gtss-export-${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
};