import {
  Agency,
  Signal,
  Approach,
  Phase,
  Detector,
  BasicTiming,
  InsertAgency,
  InsertSignal,
  InsertApproach,
  InsertPhase,
  InsertDetector,
  InsertBasicTiming,
  VEH_RECALL_TYPES,
  VehRecallType,
} from '@shared/schema';
import { nanoid } from 'nanoid';

// Storage keys
const STORAGE_KEYS = {
  AGENCY: 'gtss_agency',
  SIGNALS: 'gtss_signals', 
  APPROACHES: 'gtss_approaches',
  PHASES: 'gtss_phases',
  DETECTORS: 'gtss_detectors',
  BASIC_TIMING: 'gtss_basic_timing',
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

    if (updates.signalId && updates.signalId !== signalId) {
      phaseStorage.updateSignalId(signalId, updates.signalId);
      detectorStorage.updateSignalId(signalId, updates.signalId);
      approachStorage.updateSignalId(signalId, updates.signalId);
      basicTimingStorage.updateSignalId(signalId, updates.signalId);
    }
    return updatedSignal;
  },

  delete: (signalId: string): void => {
    const signals = signalStorage.getAll();
    const updatedSignals = signals.filter(s => s.signalId !== signalId);
    saveToStorage(STORAGE_KEYS.SIGNALS, updatedSignals);
    
    // Also delete related phases and detectors
    phaseStorage.deleteBySignal(signalId);
    detectorStorage.deleteBySignal(signalId);
    approachStorage.deleteBySignal(signalId);
    basicTimingStorage.deleteBySignal(signalId);
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.SIGNALS);
  },
};

// Approach operations
export const approachStorage = {
  getAll: (): Approach[] => {
    return getFromStorage<Approach[]>(STORAGE_KEYS.APPROACHES, []);
  },

  getBySignal: (signalId: string): Approach[] => {
    const approaches = approachStorage.getAll();
    return approaches.filter(a => a.signalId === signalId);
  },

  save: (approach: InsertApproach): Approach => {
    const approaches = approachStorage.getAll();
    const newApproach: Approach = {
      id: nanoid(),
      approachId: approach.approachId || `APP_${String(approaches.length + 1).padStart(3, '0')}`,
      signalId: approach.signalId,
      streetName: approach.streetName,
      compassBearing: approach.compassBearing,
      postedSpeed: approach.postedSpeed ?? null,
    };

    const updatedApproaches = [...approaches, newApproach];
    saveToStorage(STORAGE_KEYS.APPROACHES, updatedApproaches);
    return newApproach;
  },

  update: (id: string, updates: Partial<InsertApproach>): Approach | null => {
    const approaches = approachStorage.getAll();
    const index = approaches.findIndex(a => a.id === id);

    if (index === -1) return null;

    const updatedApproach = { ...approaches[index], ...updates };
    approaches[index] = updatedApproach;
    saveToStorage(STORAGE_KEYS.APPROACHES, approaches);
    return updatedApproach;
  },

  delete: (id: string): void => {
    const approaches = approachStorage.getAll();
    const updatedApproaches = approaches.filter(a => a.id !== id);
    saveToStorage(STORAGE_KEYS.APPROACHES, updatedApproaches);
  },

  deleteBySignal: (signalId: string): void => {
    const approaches = approachStorage.getAll();
    const updatedApproaches = approaches.filter(a => a.signalId !== signalId);
    saveToStorage(STORAGE_KEYS.APPROACHES, updatedApproaches);
  },

  updateSignalId: (oldSignalId: string, newSignalId: string): void => {
    const approaches = approachStorage.getAll();
    const updatedApproaches = approaches.map(approach =>
      approach.signalId === oldSignalId ? { ...approach, signalId: newSignalId } : approach
    );
    saveToStorage(STORAGE_KEYS.APPROACHES, updatedApproaches);
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.APPROACHES);
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
      approachId: phase.approachId ?? null,
      movementType: phase.movementType,
      isPedestrian: phase.isPedestrian ?? phase.movementType === "Through",
      numOfLanes: phase.numOfLanes ?? 1,
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
    const phaseToDelete = phases.find(p => p.id === id);
    const updatedPhases = phases.filter(p => p.id !== id);
    saveToStorage(STORAGE_KEYS.PHASES, updatedPhases);
    if (phaseToDelete) {
      basicTimingStorage.deleteBySignalPhase(phaseToDelete.signalId, phaseToDelete.phase);
    }
  },

  deleteBySignal: (signalId: string): void => {
    const phases = phaseStorage.getAll();
    const updatedPhases = phases.filter(p => p.signalId !== signalId);
    saveToStorage(STORAGE_KEYS.PHASES, updatedPhases);
    basicTimingStorage.deleteBySignal(signalId);
  },

  updateSignalId: (oldSignalId: string, newSignalId: string): void => {
    const phases = phaseStorage.getAll();
    const updatedPhases = phases.map(phase =>
      phase.signalId === oldSignalId ? { ...phase, signalId: newSignalId } : phase
    );
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

  updateSignalId: (oldSignalId: string, newSignalId: string): void => {
    const detectors = detectorStorage.getAll();
    const updatedDetectors = detectors.map(detector =>
      detector.signalId === oldSignalId ? { ...detector, signalId: newSignalId } : detector
    );
    saveToStorage(STORAGE_KEYS.DETECTORS, updatedDetectors);
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.DETECTORS);
  },
};

// Basic Timing operations
export const basicTimingStorage = {
  getAll: (): BasicTiming[] => {
    return getFromStorage<BasicTiming[]>(STORAGE_KEYS.BASIC_TIMING, []);
  },

  getBySignal: (signalId: string): BasicTiming[] => {
    const timings = basicTimingStorage.getAll();
    return timings.filter(t => t.signalId === signalId);
  },

  getBySignalPhase: (signalId: string, phase: number): BasicTiming | undefined => {
    return basicTimingStorage.getAll().find(t => t.signalId === signalId && t.phase === phase);
  },

  save: (timing: InsertBasicTiming): BasicTiming => {
    const timings = basicTimingStorage.getAll();
    const newTiming: BasicTiming = {
      signalId: timing.signalId,
      phase: timing.phase,
      pedWalk: timing.pedWalk,
      pedClearance: timing.pedClearance,
      leadingPedInterval: timing.leadingPedInterval,
      minGreen: timing.minGreen,
      maxGreen: timing.maxGreen,
      yellow: timing.yellow,
      allRed: timing.allRed,
      vehRecallType: timing.vehRecallType,
    };

    const existingIndex = timings.findIndex(t => t.signalId === timing.signalId && t.phase === timing.phase);
    const updatedTimings = [...timings];
    if (existingIndex >= 0) {
      updatedTimings[existingIndex] = newTiming;
    } else {
      updatedTimings.push(newTiming);
    }
    saveToStorage(STORAGE_KEYS.BASIC_TIMING, updatedTimings);
    return newTiming;
  },

  update: (signalId: string, phase: number, updates: Partial<InsertBasicTiming>): BasicTiming | null => {
    const timings = basicTimingStorage.getAll();
    const index = timings.findIndex(t => t.signalId === signalId && t.phase === phase);

    if (index === -1) return null;

    const updatedTiming = { ...timings[index], ...updates };
    timings[index] = updatedTiming;
    saveToStorage(STORAGE_KEYS.BASIC_TIMING, timings);
    return updatedTiming;
  },

  deleteBySignalPhase: (signalId: string, phase: number): void => {
    const timings = basicTimingStorage.getAll();
    const updatedTimings = timings.filter(t => !(t.signalId === signalId && t.phase === phase));
    saveToStorage(STORAGE_KEYS.BASIC_TIMING, updatedTimings);
  },

  deleteBySignal: (signalId: string): void => {
    const timings = basicTimingStorage.getAll();
    const updatedTimings = timings.filter(t => t.signalId !== signalId);
    saveToStorage(STORAGE_KEYS.BASIC_TIMING, updatedTimings);
  },

  updateSignalId: (oldSignalId: string, newSignalId: string): void => {
    const timings = basicTimingStorage.getAll();
    const updatedTimings = timings.map(timing =>
      timing.signalId === oldSignalId ? { ...timing, signalId: newSignalId } : timing
    );
    saveToStorage(STORAGE_KEYS.BASIC_TIMING, updatedTimings);
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.BASIC_TIMING);
  },
};

// Clear all GTSS data
export const clearAllData = (): void => {
  agencyStorage.clear();
  signalStorage.clear();
  approachStorage.clear();
  phaseStorage.clear();
  detectorStorage.clear();
  basicTimingStorage.clear();
};

// Export all data
export const exportData = () => {
  return {
    agency: agencyStorage.get(),
    signals: signalStorage.getAll(),
    approaches: approachStorage.getAll(),
    phases: phaseStorage.getAll(),
    detectors: detectorStorage.getAll(),
    basicTiming: basicTimingStorage.getAll(),
  };
};



// CSV export functions
export function generateAgencyCSV(agency: Agency | null): string {
  if (!agency) return 'agency_id,agency_name,agency_url,agency_timezone,agency_email\n';
  
  return [
    'agency_id,agency_name,agency_url,agency_timezone,agency_email',
    `${agency.agencyId},${agency.agencyName},${agency.agencyUrl || ''},${agency.agencyTimezone},${agency.agencyEmail || ''}`
  ].join('\n');
}

export function generateSignalsCSV(signals: Signal[]): string {
  const headers = 'signal_id,agency_id,latitude,longitude';
  
  if (signals.length === 0) return headers + '\n';
  
  const rows = signals.map(signal => 
    `${signal.signalId},${signal.agencyId},${signal.latitude},${signal.longitude}`
  );
  
  return [headers, ...rows].join('\n');
}

export function generateApproachesCSV(approaches: Approach[]): string {
  const headers = 'approach_id,signal_id,street_name,compass_bearing,posted_speed';

  if (approaches.length === 0) return headers + '\n';

  const rows = approaches.map(approach =>
    `${approach.approachId},${approach.signalId},${approach.streetName},${approach.compassBearing},${approach.postedSpeed ?? ''}`
  );

  return [headers, ...rows].join('\n');
}

export function generatePhasesCSV(phases: Phase[]): string {
  const headers = 'phase,signal_id,approach_id,movement_type,num_of_lanes,is_overlap,pedestrian_phase_enabled';
  
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
    const isPedestrian = phase.isPedestrian ?? phase.movementType === "Through";
    return `${phase.phase},${phase.signalId},${phase.approachId ?? ''},${encodedMovementType},${phase.numOfLanes || 1},${phase.isOverlap || false},${isPedestrian}`;
  });
  
  return [headers, ...rows].join('\n');
}

export function generateDetectionCSV(detectors: Detector[]): string {
  const headers = 'channel,signal_id,phase,description,purpose,vehicle_type,lane,technology_type,length,stopbar_setback_dist';
  
  if (detectors.length === 0) return headers + '\n';
  
  const rows = detectors.map(detector => 
    `${detector.channel},${detector.signalId},${detector.phase},${detector.description || ''},${detector.purpose},${detector.vehicleType || ''},${detector.lane || ''},${detector.technologyType},${detector.length || ''},${detector.stopbarSetbackDist ?? ''}`
  );
  
  return [headers, ...rows].join('\n');
}

export function generateBasicTimingCSV(timings: BasicTiming[]): string {
  const headers = 'phase,signal_id,ped_walk,ped_clearance,leading_ped_interval,min_green,max_green,yellow,all_red,veh_recall_type';

  if (timings.length === 0) return headers + '\n';

  const sortedTimings = [...timings].sort((a, b) => {
    if (a.signalId !== b.signalId) {
      return a.signalId.localeCompare(b.signalId);
    }
    return a.phase - b.phase;
  });

  const rows = sortedTimings.map(timing =>
    `${timing.phase},${timing.signalId},${timing.pedWalk},${timing.pedClearance},${timing.leadingPedInterval},${timing.minGreen},${timing.maxGreen},${timing.yellow},${timing.allRed},${timing.vehRecallType}`
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
  approaches: boolean;
  phases: boolean;
  detection: boolean;
  basicTiming: boolean;
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

    if (includeFiles.approaches) {
      const approachesCSV = generateApproachesCSV(data.approaches);
      downloadFile(approachesCSV, 'approaches.txt');
    }
    
    if (includeFiles.phases) {
      const phasesCSV = generatePhasesCSV(data.phases);
      downloadFile(phasesCSV, 'phases.txt');
    }
    
    if (includeFiles.detection) {
      const detectionCSV = generateDetectionCSV(data.detectors);
      downloadFile(detectionCSV, 'detectors.txt');
    }

    if (includeFiles.basicTiming) {
      const basicTimingCSV = generateBasicTimingCSV(data.basicTiming);
      downloadFile(basicTimingCSV, 'basic_timing.txt');
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
  approaches: boolean;
  phases: boolean;
  detection: boolean;
  basicTiming: boolean;
} = { agency: true, signals: true, approaches: true, phases: true, detection: true, basicTiming: true }): Promise<void> => {
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

    if (includeFiles.approaches) {
      const approachesCSV = generateApproachesCSV(data.approaches);
      zip.file('approaches.txt', approachesCSV);
    }
    
    if (includeFiles.phases) {
      const phasesCSV = generatePhasesCSV(data.phases);
      zip.file('phases.txt', phasesCSV);
    }
    
    if (includeFiles.detection) {
      const detectionCSV = generateDetectionCSV(data.detectors);
      zip.file('detectors.txt', detectionCSV);
    }

    if (includeFiles.basicTiming) {
      const basicTimingCSV = generateBasicTimingCSV(data.basicTiming);
      zip.file('basic_timing.txt', basicTimingCSV);
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

// Movement type reverse mapping for import
const MOVEMENT_TYPE_REVERSE_MAP: { [key: string]: string } = {
  "T": "Through",
  "L": "Left Turn",
  "LT": "Left Through Shared",
  "TL": "Permissive Phase",
  "FYA": "Flashing Yellow Arrow",
  "U": "U-Turn",
  "R": "Right Turn",
  "TR": "Through-Right",
  "PED": "Pedestrian"
};

// Parse agency.txt file
export function parseAgencyTXT(content: string): Agency | null {
  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('Agency file must contain header and at least one data row');
  }
  
  const dataLine = lines[1].trim();
  const values = dataLine.split(',').map(v => v.trim());
  
  if (values.length < 5) {
    throw new Error('Agency data must have at least 5 fields: agencyId, agencyName, agencyUrl, agencyTimezone, agencyEmail');
  }

  // Validate required fields
  if (!values[0]) {
    throw new Error('Agency ID is required');
  }
  if (!values[1]) {
    throw new Error('Agency Name is required');
  }
  if (!values[3]) {
    throw new Error('Agency Timezone is required');
  }
  
  return {
    id: nanoid(),
    agencyId: values[0],
    agencyName: values[1],
    agencyUrl: values[2] || null,
    agencyTimezone: values[3],
    agencyLanguage: null,
    agencyEmail: values[4] || null,
    latitude: null,
    longitude: null,
  };
}

// Parse signals.txt file
export function parseSignalsTXT(content: string): Signal[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('Signals file must contain header and at least one data row');
  }
  
  const signals: Signal[] = [];
  const errors: string[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    
    if (values.length < 4) {
      errors.push(`Row ${i + 1}: Must have 4 fields (signalId, agencyId, latitude, longitude)`);
      continue;
    }

    // Validate required fields
    if (!values[0]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }
    if (!values[1]) {
      errors.push(`Row ${i + 1}: Agency ID is required`);
      continue;
    }
    // Validate numeric fields - strict validation, no partial numbers
    // Check regex BEFORE converting to ensure no malformed input
    if (!values[2] || values[2].trim() === '' || !/^-?\d*\.?\d+$/.test(values[2])) {
      errors.push(`Row ${i + 1}: Latitude must be a valid number, got "${values[2]}"`);
      continue;
    }
    if (!values[3] || values[3].trim() === '' || !/^-?\d*\.?\d+$/.test(values[3])) {
      errors.push(`Row ${i + 1}: Longitude must be a valid number, got "${values[3]}"`);
      continue;
    }

    const latitude = Number(values[2]);
    const longitude = Number(values[3]);

    signals.push({
      id: nanoid(),
      signalId: values[0],
      agencyId: values[1],
      latitude,
      longitude,
    });
  }

  if (errors.length > 0) {
    throw new Error(`Signals validation errors:\n${errors.join('\n')}`);
  }

  if (signals.length === 0) {
    throw new Error('No valid signals found in file');
  }

  return signals;
}

// Parse approaches.txt file
export function parseApproachesTXT(content: string): Approach[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('Approaches file must contain header and at least one data row');
  }

  const approaches: Approach[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());

    if (values.length < 5) {
      errors.push(`Row ${i + 1}: Must have 5 fields (approachId, signalId, streetName, compassBearing, postedSpeed)`);
      continue;
    }

    if (!values[0]) {
      errors.push(`Row ${i + 1}: Approach ID is required`);
      continue;
    }

    if (!values[1]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }

    if (!values[2]) {
      errors.push(`Row ${i + 1}: Street name is required`);
      continue;
    }

    if (!values[3]) {
      errors.push(`Row ${i + 1}: Compass bearing is required`);
      continue;
    }

    let postedSpeed: number | null = null;
    if (values[4] && values[4].trim() !== '') {
      if (!/^-?\d*\.?\d+$/.test(values[4])) {
        errors.push(`Row ${i + 1}: Posted speed must be a valid number or empty, got "${values[4]}"`);
        continue;
      }
      postedSpeed = Number(values[4]);
    }

    approaches.push({
      id: nanoid(),
      approachId: values[0],
      signalId: values[1],
      streetName: values[2],
      compassBearing: values[3],
      postedSpeed,
    });
  }

  if (errors.length > 0) {
    throw new Error(`Approaches validation errors:\n${errors.join('\n')}`);
  }

  if (approaches.length === 0) {
    throw new Error('No valid approaches found in file');
  }

  return approaches;
}

// Parse phases.txt file
export function parsePhasesTXT(content: string): Phase[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('Phases file must contain header and at least one data row');
  }
  
  const phases: Phase[] = [];
  const errors: string[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    
    if (values.length < 5) {
      errors.push(`Row ${i + 1}: Must have at least 5 fields (phase, signalId, movementType, numOfLanes, isOverlap)`);
      continue;
    }

    const validTypes = ["Through", "Left Turn", "Left Through Shared", "Permissive Phase", "Flashing Yellow Arrow", "U-Turn", "Right Turn", "Through-Right", "Pedestrian"];
    const isMovementValue = (value: string) => Boolean(MOVEMENT_TYPE_REVERSE_MAP[value] || validTypes.includes(value));

    const hasApproachColumn = values.length >= 7
      || (values.length === 6 && !isMovementValue(values[2]) && isMovementValue(values[3]));

    const phaseIndex = 0;
    const signalIndex = 1;
    const approachIndex = hasApproachColumn ? 2 : -1;
    const movementIndex = hasApproachColumn ? 3 : 2;
    const lanesIndex = hasApproachColumn ? 4 : 3;
    const overlapIndex = hasApproachColumn ? 5 : 4;
    const pedestrianIndex = hasApproachColumn ? 6 : 5;

    // Validate required fields - strict integer validation
    // Check regex BEFORE converting to ensure no malformed input
    if (!values[phaseIndex] || !/^-?\d+$/.test(values[phaseIndex])) {
      errors.push(`Row ${i + 1}: Phase number must be a valid integer, got "${values[phaseIndex]}"`);
      continue;
    }

    if (!values[signalIndex]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }

    if (!values[movementIndex]) {
      errors.push(`Row ${i + 1}: Movement type is required`);
      continue;
    }

    if (!values[lanesIndex] || !/^-?\d+$/.test(values[lanesIndex])) {
      errors.push(`Row ${i + 1}: Number of lanes must be a valid integer, got "${values[lanesIndex]}"`);
      continue;
    }

    const phaseNum = Number(values[phaseIndex]);
    const numOfLanes = Number(values[lanesIndex]);

    // Decode movement type
    const encodedMovement = values[movementIndex];
    const movementType = MOVEMENT_TYPE_REVERSE_MAP[encodedMovement] || encodedMovement;

    // Validate movement type is recognized (warn if not in reverse map)
    if (!MOVEMENT_TYPE_REVERSE_MAP[encodedMovement]) {
      // If it's not a known code, verify it's a valid full movement type name
      if (!validTypes.includes(encodedMovement)) {
        errors.push(`Row ${i + 1}: Movement type "${encodedMovement}" is not recognized. Expected codes: T, L, LT, TL, FYA, U, R, TR, PED or full names.`);
        continue;
      }
    }

    // Validate overlap boolean
    const overlapValue = values[overlapIndex].toLowerCase();
    if (overlapValue !== 'true' && overlapValue !== 'false') {
      errors.push(`Row ${i + 1}: Overlap must be "true" or "false", got "${values[overlapIndex]}"`);
      continue;
    }

    let pedestrianPhaseEnabled = movementType === "Through";
    if (values.length > pedestrianIndex && values[pedestrianIndex].trim() !== '') {
      const pedestrianValue = values[pedestrianIndex].toLowerCase();
      if (pedestrianValue !== 'true' && pedestrianValue !== 'false') {
        errors.push(`Row ${i + 1}: Pedestrian phase enabled must be "true" or "false", got "${values[pedestrianIndex]}"`);
        continue;
      }
      pedestrianPhaseEnabled = pedestrianValue === 'true';
    }

    const approachId = approachIndex >= 0 ? values[approachIndex] || null : null;
    
    phases.push({
      id: nanoid(),
      phase: phaseNum,
      signalId: values[signalIndex],
      approachId,
      movementType: movementType,
      isPedestrian: pedestrianPhaseEnabled,
      numOfLanes: numOfLanes,
      isOverlap: overlapValue === 'true',
    });
  }

  if (errors.length > 0) {
    throw new Error(`Phases validation errors:\n${errors.join('\n')}`);
  }

  if (phases.length === 0) {
    throw new Error('No valid phases found in file');
  }

  return phases;
}

// Parse detectors.txt file
export function parseDetectorsTXT(content: string): Detector[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('Detectors file must contain header and at least one data row');
  }
  
  const detectors: Detector[] = [];
  const errors: string[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    
    if (values.length < 10) {
      errors.push(`Row ${i + 1}: Must have 10 fields (channel, signalId, phase, description, purpose, vehicleType, lane, technologyType, length, stopbarSetbackDist)`);
      continue;
    }

    // Validate required fields
    if (!values[0]) {
      errors.push(`Row ${i + 1}: Channel is required`);
      continue;
    }

    if (!values[1]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }

    // Check regex BEFORE converting to ensure no malformed input
    if (!values[2] || !/^-?\d+$/.test(values[2])) {
      errors.push(`Row ${i + 1}: Phase must be a valid integer, got "${values[2]}"`);
      continue;
    }

    if (!values[4]) {
      errors.push(`Row ${i + 1}: Purpose is required`);
      continue;
    }

    if (!values[7]) {
      errors.push(`Row ${i + 1}: Technology type is required`);
      continue;
    }

    const phase = Number(values[2]);

    // Parse optional numeric fields - strict validation
    let length: number | null = null;
    let stopbarSetbackDist: number | null = null;

    if (values[8] && values[8].trim() !== '') {
      if (!/^-?\d*\.?\d+$/.test(values[8])) {
        errors.push(`Row ${i + 1}: Length must be a valid number or empty, got "${values[8]}"`);
        continue;
      }
      length = Number(values[8]);
    }

    if (values[9] && values[9].trim() !== '') {
      if (!/^-?\d*\.?\d+$/.test(values[9])) {
        errors.push(`Row ${i + 1}: Stopbar setback distance must be a valid number or empty, got "${values[9]}"`);
        continue;
      }
      stopbarSetbackDist = Number(values[9]);
    }

    detectors.push({
      id: nanoid(),
      channel: values[0],
      signalId: values[1],
      phase,
      description: values[3] || null,
      purpose: values[4],
      vehicleType: values[5] || null,
      lane: values[6] || null,
      technologyType: values[7],
      length,
      stopbarSetbackDist,
    });
  }

  if (errors.length > 0) {
    throw new Error(`Detectors validation errors:\n${errors.join('\n')}`);
  }

  if (detectors.length === 0) {
    throw new Error('No valid detectors found in file');
  }

  return detectors;
}

// Parse basic_timing.txt file
export function parseBasicTimingTXT(content: string): BasicTiming[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('Basic timing file must contain header and at least one data row');
  }

  const timings: BasicTiming[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());

    if (values.length < 10) {
      errors.push(`Row ${i + 1}: Must have 10 fields (phase, signalId, pedWalk, pedClearance, leadingPedInterval, minGreen, maxGreen, yellow, allRed, vehRecallType)`);
      continue;
    }

    if (!values[0] || !/^-?\d+$/.test(values[0])) {
      errors.push(`Row ${i + 1}: Phase must be a valid integer, got "${values[0]}"`);
      continue;
    }

    if (!values[1]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }

    const numericFields = [
      { index: 2, label: "Ped walk" },
      { index: 3, label: "Ped clearance" },
      { index: 4, label: "Leading ped interval" },
      { index: 5, label: "Min green" },
      { index: 6, label: "Max green" },
      { index: 7, label: "Yellow" },
      { index: 8, label: "All red" },
    ];

    let hasNumericError = false;
    for (const field of numericFields) {
      if (!values[field.index] || values[field.index].trim() === '') {
        errors.push(`Row ${i + 1}: ${field.label} is required`);
        hasNumericError = true;
        break;
      }
      if (!/^-?\d*\.?\d+$/.test(values[field.index])) {
        errors.push(`Row ${i + 1}: ${field.label} must be a valid number, got "${values[field.index]}"`);
        hasNumericError = true;
        break;
      }
    }

    if (hasNumericError) continue;

    const vehRecallType = values[9] as VehRecallType;
    if (!vehRecallType || !VEH_RECALL_TYPES.includes(vehRecallType)) {
      errors.push(`Row ${i + 1}: Veh recall type must be one of ${VEH_RECALL_TYPES.join(', ')}, got "${values[9]}"`);
      continue;
    }

    timings.push({
      signalId: values[1],
      phase: Number(values[0]),
      pedWalk: Number(values[2]),
      pedClearance: Number(values[3]),
      leadingPedInterval: Number(values[4]),
      minGreen: Number(values[5]),
      maxGreen: Number(values[6]),
      yellow: Number(values[7]),
      allRed: Number(values[8]),
      vehRecallType,
    });
  }

  if (errors.length > 0) {
    throw new Error(`Basic timing validation errors:\n${errors.join('\n')}`);
  }

  if (timings.length === 0) {
    throw new Error('No valid basic timing entries found in file');
  }

  return timings;
}

// Import data with replace or merge mode
export function importData(
  parsedData: {
    agency?: Agency | null;
    signals?: Signal[];
    approaches?: Approach[];
    phases?: Phase[];
    detectors?: Detector[];
    basicTiming?: BasicTiming[];
  },
  mode: 'replace' | 'merge' = 'replace'
): void {
  if (mode === 'replace') {
    // Replace all data
    if (parsedData.agency !== undefined) {
      if (parsedData.agency) {
        saveToStorage(STORAGE_KEYS.AGENCY, parsedData.agency);
      } else {
        localStorage.removeItem(STORAGE_KEYS.AGENCY);
      }
    }
    
    if (parsedData.signals !== undefined) {
      saveToStorage(STORAGE_KEYS.SIGNALS, parsedData.signals);
    }

    if (parsedData.approaches !== undefined) {
      saveToStorage(STORAGE_KEYS.APPROACHES, parsedData.approaches);
    }
    
    if (parsedData.phases !== undefined) {
      saveToStorage(STORAGE_KEYS.PHASES, parsedData.phases);
    }
    
    if (parsedData.detectors !== undefined) {
      saveToStorage(STORAGE_KEYS.DETECTORS, parsedData.detectors);
    }

    if (parsedData.basicTiming !== undefined) {
      saveToStorage(STORAGE_KEYS.BASIC_TIMING, parsedData.basicTiming);
    }
  } else {
    // Merge mode
    if (parsedData.agency) {
      saveToStorage(STORAGE_KEYS.AGENCY, parsedData.agency);
    }
    
    if (parsedData.signals && parsedData.signals.length > 0) {
      const existingSignals = getFromStorage<Signal[]>(STORAGE_KEYS.SIGNALS, []);
      const existingSignalIds = new Set(existingSignals.map(s => s.signalId));
      const newSignals = parsedData.signals.filter(s => !existingSignalIds.has(s.signalId));
      saveToStorage(STORAGE_KEYS.SIGNALS, [...existingSignals, ...newSignals]);
    }

    if (parsedData.approaches && parsedData.approaches.length > 0) {
      const existingApproaches = getFromStorage<Approach[]>(STORAGE_KEYS.APPROACHES, []);
      const existingKeys = new Set(existingApproaches.map(a => `${a.signalId}-${a.approachId}`));
      const newApproaches = parsedData.approaches.filter(a => !existingKeys.has(`${a.signalId}-${a.approachId}`));
      saveToStorage(STORAGE_KEYS.APPROACHES, [...existingApproaches, ...newApproaches]);
    }
    
    if (parsedData.phases && parsedData.phases.length > 0) {
      const existingPhases = getFromStorage<Phase[]>(STORAGE_KEYS.PHASES, []);
      const existingKeys = new Set(existingPhases.map(p => `${p.signalId}-${p.phase}`));
      const newPhases = parsedData.phases.filter(p => !existingKeys.has(`${p.signalId}-${p.phase}`));
      saveToStorage(STORAGE_KEYS.PHASES, [...existingPhases, ...newPhases]);
    }
    
    if (parsedData.detectors && parsedData.detectors.length > 0) {
      const existingDetectors = getFromStorage<Detector[]>(STORAGE_KEYS.DETECTORS, []);
      const existingKeys = new Set(existingDetectors.map(d => `${d.signalId}-${d.channel}`));
      const newDetectors = parsedData.detectors.filter(d => !existingKeys.has(`${d.signalId}-${d.channel}`));
      saveToStorage(STORAGE_KEYS.DETECTORS, [...existingDetectors, ...newDetectors]);
    }

    if (parsedData.basicTiming && parsedData.basicTiming.length > 0) {
      const existingTimings = getFromStorage<BasicTiming[]>(STORAGE_KEYS.BASIC_TIMING, []);
      const existingKeys = new Set(existingTimings.map(t => `${t.signalId}-${t.phase}`));
      const newTimings = parsedData.basicTiming.filter(t => !existingKeys.has(`${t.signalId}-${t.phase}`));
      saveToStorage(STORAGE_KEYS.BASIC_TIMING, [...existingTimings, ...newTimings]);
    }
  }
}
