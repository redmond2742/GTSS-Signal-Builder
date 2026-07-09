import { Agency, Signal, Phase, Detector, Approach, BasicTiming, InsertAgency, InsertSignal, InsertPhase, InsertDetector, InsertApproach, InsertBasicTiming } from '@shared/schema';
import { AgencyDefaults, NEMA_DEFAULTS } from './agencyDefaults';
import { nanoid } from 'nanoid';

// Storage keys
const STORAGE_KEYS = {
  AGENCY: 'gtss_agency',
  SIGNALS: 'gtss_signals',
  PHASES: 'gtss_phases',
  DETECTORS: 'gtss_detectors',
  APPROACHES: 'gtss_approaches',
  BASIC_TIMINGS: 'gtss_basic_timings',
  AGENCY_DEFAULTS: 'gtss_agency_defaults',
};

// Maximum localStorage size (5MB)
const MAX_STORAGE_SIZE = 5 * 1024 * 1024;

// CSV sanitization to prevent formula injection attacks
function sanitizeCSVField(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';

  // For numeric and boolean values, just convert to string (no formula risk)
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const strValue = String(value);

  // Quote fields containing commas, quotes, or newlines
  if (/[",\n\r]/.test(strValue)) {
    return `"${strValue.replace(/"/g, '""')}"`;
  }

  // Escape dangerous characters that could start formulas in spreadsheet applications
  // Characters =, +, -, @, tab, carriage return can trigger formula execution
  // Only apply to string values that aren't already quoted
  if (/^[=+\-@\t\r]/.test(strValue)) {
    // Prepend single quote to neutralize formula execution and wrap in quotes
    return `"'${strValue.replace(/"/g, '""')}"`;
  }

  return strValue;
}

// Proper CSV line parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote inside quoted field
        field += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      fields.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }

  // Push the last field
  fields.push(field.trim());
  return fields;
}

// Safer number validation without ReDoS risk
function isValidNumber(value: string): boolean {
  if (!value || value.trim() === '') return false;
  const num = Number(value);
  return !isNaN(num) && isFinite(num);
}

function isValidInteger(value: string): boolean {
  if (!value || value.trim() === '') return false;
  const num = Number(value);
  return !isNaN(num) && isFinite(num) && Number.isInteger(num);
}

// Check for prototype pollution attempts
function hasPrototypePollution(obj: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(obj, '__proto__') ||
         Object.prototype.hasOwnProperty.call(obj, 'constructor') ||
         Object.prototype.hasOwnProperty.call(obj, 'prototype');
}

// Helper function to safely parse JSON from localStorage
function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Helper function to save to localStorage with size limit check
function saveToStorage<T>(key: string, data: T): void {
  try {
    const serialized = JSON.stringify(data);

    // Check size before saving
    if (serialized.length > MAX_STORAGE_SIZE) {
      throw new Error('Data too large for localStorage. Please reduce the number of records.');
    }

    localStorage.setItem(key, serialized);
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded');
      throw new Error('Storage quota exceeded. Please delete some data before adding more.');
    }
    console.error('Failed to save to localStorage:', error);
    throw error;
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
    // Prevent prototype pollution
    if (hasPrototypePollution(updates as Record<string, unknown>)) {
      console.error('Attempted prototype pollution in signal update');
      return null;
    }

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

    // Also delete related phases, detectors, approaches, and basic timings
    phaseStorage.deleteBySignal(signalId);
    detectorStorage.deleteBySignal(signalId);
    approachStorage.deleteBySignal(signalId);
    basicTimingStorage.deleteBySignal(signalId);
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.SIGNALS);
  },
};

// Approach operations - new for GTSSv1.1
// Coerce the FR (free right) value to the integer scheme:
//   0 = none, 1 = FR (slip lane), 2 = FR-P (slip lane with ped crossing),
//   3 = FR-P-I (improved traffic-calmed crossing).
// Legacy booleans (from the short-lived boolean field) map false → 0, true → 1.
function normalizeFreeRight(value: unknown): number {
  if (typeof value === "number") return value;
  if (value === true) return 1;
  return 0;
}

// Number of free-right lanes; at least 1 whenever a lane is present.
function normalizeFreeRightLanes(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export const approachStorage = {
  getAll: (): Approach[] => {
    const raw = getFromStorage<Approach[]>(STORAGE_KEYS.APPROACHES, []);
    return raw.map(a => ({
      ...a,
      freeRight: normalizeFreeRight((a as { freeRight?: unknown }).freeRight),
      freeRightLanes: normalizeFreeRightLanes((a as { freeRightLanes?: unknown }).freeRightLanes),
    }));
  },

  getBySignal: (signalId: string): Approach[] => {
    const approaches = approachStorage.getAll();
    return approaches.filter(a => a.signalId === signalId);
  },

  save: (approach: InsertApproach): Approach => {
    const approaches = approachStorage.getAll();
    // Count approaches for this specific signal to generate per-signal ID
    const signalApproaches = approaches.filter(a => a.signalId === approach.signalId);
    const nextApproachNum = signalApproaches.length + 1;
    const newApproach: Approach = {
      id: nanoid(),
      approachId: approach.approachId || `${approach.signalId}-${nextApproachNum}`,
      signalId: approach.signalId,
      streetName: approach.streetName,
      compassBearing: approach.compassBearing ?? null,
      postedSpeed: approach.postedSpeed ?? null,
      freeRight: normalizeFreeRight(approach.freeRight),
      freeRightLanes: normalizeFreeRightLanes(approach.freeRightLanes),
    };

    const updatedApproaches = [...approaches, newApproach];
    saveToStorage(STORAGE_KEYS.APPROACHES, updatedApproaches);
    return newApproach;
  },

  update: (id: string, updates: Partial<InsertApproach>): Approach | null => {
    if (hasPrototypePollution(updates as Record<string, unknown>)) {
      console.error('Attempted prototype pollution in approach update');
      return null;
    }

    const approaches = approachStorage.getAll();
    const index = approaches.findIndex(a => a.id === id);

    if (index === -1) return null;

    const updatedApproach = { ...approaches[index], ...updates };
    if ("freeRight" in updates) {
      updatedApproach.freeRight = normalizeFreeRight(updatedApproach.freeRight);
    }
    if ("freeRightLanes" in updates) {
      updatedApproach.freeRightLanes = normalizeFreeRightLanes(updatedApproach.freeRightLanes);
    }
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

// Phase operations - updated for GTSSv1.1
// Coerce legacy boolean isPedestrian values to the integer scheme:
// false → 0, true → 1, undefined/null → 0, numbers pass through.
function normalizePedestrian(value: unknown): number {
  if (typeof value === "number") return value;
  if (value === true) return 1;
  return 0;
}

// One-time migration: the pedestrian-mode meanings were renumbered so a new
// "two crosswalks" value could be inserted at 2. Old data: 2 = opposite, 3 =
// diagonal, 4 = diagonal-90°. New data: 2 = two crosswalks, 3 = opposite,
// 4 = diagonal, 5 = diagonal-90°. To preserve previously chosen visuals we
// shift old 2/3/4 → new 3/4/5 the first time we read after the rename.
const PED_RENUMBER_FLAG = "gtss_ped_renumber_v2_done";

export const phaseStorage = {
  getAll: (): Phase[] => {
    const raw = getFromStorage<Phase[]>(STORAGE_KEYS.PHASES, []);
    const normalized = raw.map(p => ({
      ...p,
      isPedestrian: normalizePedestrian((p as { isPedestrian?: unknown }).isPedestrian),
    }));
    try {
      if (typeof localStorage !== "undefined" && !localStorage.getItem(PED_RENUMBER_FLAG)) {
        const renumbered = normalized.map(p => {
          const v = p.isPedestrian;
          // 2/3/4 are the only renumbered values; 0 and 1 are unchanged, and
          // 5 (the new top of the range) won't exist in pre-rename data.
          if (typeof v === "number" && v >= 2 && v <= 4) {
            return { ...p, isPedestrian: v + 1 };
          }
          return p;
        });
        saveToStorage(STORAGE_KEYS.PHASES, renumbered);
        localStorage.setItem(PED_RENUMBER_FLAG, "1");
        return renumbered;
      }
    } catch {
      // localStorage may be unavailable (SSR / privacy mode) — skip migration.
    }
    return normalized;
  },

  getBySignal: (signalId: string): Phase[] => {
    const phases = phaseStorage.getAll();
    return phases.filter(p => p.signalId === signalId);
  },

  save: (phase: InsertPhase): Phase => {
    const phases = phaseStorage.getAll();
    const defaultPed = phase.movementType === "Through" ? 1 : 0;
    const newPhase: Phase = {
      id: nanoid(),
      signalId: phase.signalId,
      phase: phase.phase,
      movementType: phase.movementType,
      isPedestrian:
        phase.isPedestrian == null
          ? defaultPed
          : normalizePedestrian(phase.isPedestrian),
      numOfLanes: phase.numOfLanes ?? 1,
      approachId: phase.approachId ?? null,
      isOverlap: phase.isOverlap ?? false,
    };

    const updatedPhases = [...phases, newPhase];
    saveToStorage(STORAGE_KEYS.PHASES, updatedPhases);
    return newPhase;
  },

  update: (id: string, updates: Partial<InsertPhase>): Phase | null => {
    // Prevent prototype pollution
    if (hasPrototypePollution(updates as Record<string, unknown>)) {
      console.error('Attempted prototype pollution in phase update');
      return null;
    }

    const phases = phaseStorage.getAll();
    const index = phases.findIndex(p => p.id === id);

    if (index === -1) return null;

    const merged = { ...phases[index], ...updates };
    // Coerce isPedestrian to the integer scheme on every update so legacy
    // callers passing booleans still produce valid data.
    if ("isPedestrian" in updates) {
      merged.isPedestrian = normalizePedestrian(merged.isPedestrian);
    }
    phases[index] = merged;
    saveToStorage(STORAGE_KEYS.PHASES, phases);
    return merged;
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
    // Prevent prototype pollution
    if (hasPrototypePollution(updates as Record<string, unknown>)) {
      console.error('Attempted prototype pollution in detector update');
      return null;
    }

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

// Basic Timing operations - new for GTSSv1.1
export const basicTimingStorage = {
  getAll: (): BasicTiming[] => {
    return getFromStorage<BasicTiming[]>(STORAGE_KEYS.BASIC_TIMINGS, []);
  },

  getBySignal: (signalId: string): BasicTiming[] => {
    const timings = basicTimingStorage.getAll();
    return timings.filter(t => t.signalId === signalId);
  },

  save: (timing: InsertBasicTiming): BasicTiming => {
    const timings = basicTimingStorage.getAll();
    const newTiming: BasicTiming = {
      id: nanoid(),
      phase: timing.phase,
      signalId: timing.signalId,
      pedWalk: timing.pedWalk ?? null,
      pedClearance: timing.pedClearance ?? null,
      leadingPedInterval: timing.leadingPedInterval ?? null,
      minGreen: timing.minGreen ?? null,
      maxGreen: timing.maxGreen ?? null,
      yellow: timing.yellow ?? null,
      allRed: timing.allRed ?? null,
      vehRecallType: timing.vehRecallType ?? "None",
      pedRecall: timing.pedRecall ?? false,
    };

    const updatedTimings = [...timings, newTiming];
    saveToStorage(STORAGE_KEYS.BASIC_TIMINGS, updatedTimings);
    return newTiming;
  },

  update: (id: string, updates: Partial<InsertBasicTiming>): BasicTiming | null => {
    if (hasPrototypePollution(updates as Record<string, unknown>)) {
      console.error('Attempted prototype pollution in basic timing update');
      return null;
    }

    const timings = basicTimingStorage.getAll();
    const index = timings.findIndex(t => t.id === id);

    if (index === -1) return null;

    const updatedTiming = { ...timings[index], ...updates };
    timings[index] = updatedTiming;
    saveToStorage(STORAGE_KEYS.BASIC_TIMINGS, timings);
    return updatedTiming;
  },

  delete: (id: string): void => {
    const timings = basicTimingStorage.getAll();
    const updatedTimings = timings.filter(t => t.id !== id);
    saveToStorage(STORAGE_KEYS.BASIC_TIMINGS, updatedTimings);
  },

  deleteBySignal: (signalId: string): void => {
    const timings = basicTimingStorage.getAll();
    const updatedTimings = timings.filter(t => t.signalId !== signalId);
    saveToStorage(STORAGE_KEYS.BASIC_TIMINGS, updatedTimings);
  },

  updateSignalId: (oldSignalId: string, newSignalId: string): void => {
    const timings = basicTimingStorage.getAll();
    const updatedTimings = timings.map(timing =>
      timing.signalId === oldSignalId ? { ...timing, signalId: newSignalId } : timing
    );
    saveToStorage(STORAGE_KEYS.BASIC_TIMINGS, updatedTimings);
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.BASIC_TIMINGS);
  },
};

// Agency Defaults operations
export const agencyDefaultsStorage = {
  get: (): AgencyDefaults | null => {
    return getFromStorage<AgencyDefaults | null>(STORAGE_KEYS.AGENCY_DEFAULTS, null);
  },

  save: (defaults: AgencyDefaults): AgencyDefaults => {
    const updated: AgencyDefaults = {
      ...defaults,
      updatedAt: new Date().toISOString(),
    };
    saveToStorage(STORAGE_KEYS.AGENCY_DEFAULTS, updated);
    return updated;
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.AGENCY_DEFAULTS);
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
  // Note: agency defaults are intentionally NOT cleared with clearAllData,
  // as they are a configuration preference, not signal data.
};

// Export all data
export const exportData = () => {
  return {
    agency: agencyStorage.get(),
    signals: signalStorage.getAll(),
    approaches: approachStorage.getAll(),
    phases: phaseStorage.getAll(),
    detectors: detectorStorage.getAll(),
    basicTimings: basicTimingStorage.getAll(),
  };
};

// Movement type encoding mapping
const MOVEMENT_TYPE_MAP: { [key: string]: string } = {
  "Through": "T",
  "Left Turn": "L",
  "Left Protected-Permissive": "LPP",
  "Left Through Shared": "LT",
  "Permissive Phase": "TL",
  "Flashing Yellow Arrow": "FYA",
  "U-Turn": "U",
  "Right Turn": "R",
  "Through-Right": "TR",
  "Pedestrian": "PED"
};

// Movement type reverse mapping for import
const MOVEMENT_TYPE_REVERSE_MAP: { [key: string]: string } = {
  "T": "Through",
  "L": "Left Turn",
  "LPP": "Left Protected-Permissive",
  "LT": "Left Through Shared",
  "TL": "Permissive Phase",
  "FYA": "Flashing Yellow Arrow",
  "U": "U-Turn",
  "R": "Right Turn",
  "TR": "Through-Right",
  "PED": "Pedestrian"
};

// CSV export functions with sanitization to prevent formula injection
export function generateAgencyCSV(agency: Agency | null): string {
  if (!agency) return 'agency_id,agency_name,agency_url,agency_timezone,agency_email\n';

  return [
    'agency_id,agency_name,agency_url,agency_timezone,agency_email',
    `${sanitizeCSVField(agency.agencyId)},${sanitizeCSVField(agency.agencyName)},${sanitizeCSVField(agency.agencyUrl)},${sanitizeCSVField(agency.agencyTimezone)},${sanitizeCSVField(agency.agencyEmail)}`
  ].join('\n');
}

export function generateSignalsCSV(signals: Signal[]): string {
  const headers = 'signal_id,agency_id,latitude,longitude';

  if (signals.length === 0) return headers + '\n';

  const rows = signals.map(signal =>
    `${sanitizeCSVField(signal.signalId)},${sanitizeCSVField(signal.agencyId)},${sanitizeCSVField(signal.latitude)},${sanitizeCSVField(signal.longitude)}`
  );

  return [headers, ...rows].join('\n');
}

// New for GTSSv1.1
export function generateApproachesCSV(approaches: Approach[]): string {
  const headers = 'approach_id,signal_id,street_name,compass_bearing,posted_speed,free_right';

  if (approaches.length === 0) return headers + '\n';

  const sortedApproaches = [...approaches].sort((a, b) => {
    if (a.signalId !== b.signalId) return a.signalId.localeCompare(b.signalId);
    return a.approachId.localeCompare(b.approachId);
  });

  // free_right column: '' = none, 'FR' = slip lane, 'FR-P' = slip lane with
  // pedestrian crossing, 'FR-P-I' = improved (traffic-calmed) crossing. When
  // more than one free-right lane exists it is prefixed as '<n>-FR…'.
  const frLabel = (v: number | boolean | null | undefined, lanes: number | null | undefined) => {
    const code = v === 3 ? 'FR-P-I' : v === 2 ? 'FR-P' : v === 1 || v === true ? 'FR' : '';
    if (!code) return '';
    const n = typeof lanes === 'number' && lanes > 1 ? lanes : 1;
    return n > 1 ? `${n}-${code}` : code;
  };
  const rows = sortedApproaches.map(approach =>
    `${sanitizeCSVField(approach.approachId)},${sanitizeCSVField(approach.signalId)},${sanitizeCSVField(approach.streetName)},${sanitizeCSVField(approach.compassBearing)},${sanitizeCSVField(approach.postedSpeed)},${frLabel(approach.freeRight, approach.freeRightLanes)}`
  );

  return [headers, ...rows].join('\n');
}

// Updated for GTSSv1.1 - removed compass_bearing, posted_speed; added approach_id
export function generatePhasesCSV(phases: Phase[]): string {
  const headers = 'phase,signal_id,movement_type,num_of_lanes,approach_id,is_overlap,pedestrian_phase_enabled';

  if (phases.length === 0) return headers + '\n';

  // Sort phases by signal ID first, then by phase number
  const sortedPhases = [...phases].sort((a, b) => {
    if (a.signalId !== b.signalId) {
      return a.signalId.localeCompare(b.signalId);
    }
    return a.phase - b.phase;
  });

  const rows = sortedPhases.map(phase => {
    const encodedMovementType = MOVEMENT_TYPE_MAP[phase.movementType] || phase.movementType;
    // Pedestrian mode is now an integer 0–4 (see schema). Default Through phases
    // to 1 when the field is missing, so old exports stay readable.
    const pedMode =
      typeof phase.isPedestrian === "number"
        ? phase.isPedestrian
        : (phase.movementType === "Through" ? 1 : 0);
    return `${sanitizeCSVField(phase.phase)},${sanitizeCSVField(phase.signalId)},${sanitizeCSVField(encodedMovementType)},${sanitizeCSVField(phase.numOfLanes || 1)},${sanitizeCSVField(phase.approachId)},${sanitizeCSVField(phase.isOverlap || false)},${sanitizeCSVField(pedMode)}`;
  });

  return [headers, ...rows].join('\n');
}

export function generateDetectionCSV(detectors: Detector[]): string {
  const headers = 'channel,signal_id,phase,description,purpose,vehicle_type,lane,technology_type,length,stopbar_setback_dist';

  if (detectors.length === 0) return headers + '\n';

  const rows = detectors.map(detector =>
    `${sanitizeCSVField(detector.channel)},${sanitizeCSVField(detector.signalId)},${sanitizeCSVField(detector.phase)},${sanitizeCSVField(detector.description)},${sanitizeCSVField(detector.purpose)},${sanitizeCSVField(detector.vehicleType)},${sanitizeCSVField(detector.lane)},${sanitizeCSVField(detector.technologyType)},${sanitizeCSVField(detector.length)},${sanitizeCSVField(detector.stopbarSetbackDist)}`
  );

  return [headers, ...rows].join('\n');
}

// New for GTSSv1.1
export function generateBasicTimingsCSV(timings: BasicTiming[]): string {
  const headers = 'phase,signal_id,ped_walk,ped_clearance,leading_ped_interval,min_green,max_green,yellow,all_red,veh_recall_type,ped_recall';

  if (timings.length === 0) return headers + '\n';

  const sortedTimings = [...timings].sort((a, b) => {
    if (a.signalId !== b.signalId) return a.signalId.localeCompare(b.signalId);
    return a.phase - b.phase;
  });

  const rows = sortedTimings.map(t =>
    `${sanitizeCSVField(t.phase)},${sanitizeCSVField(t.signalId)},${sanitizeCSVField(t.pedWalk)},${sanitizeCSVField(t.pedClearance)},${sanitizeCSVField(t.leadingPedInterval)},${sanitizeCSVField(t.minGreen)},${sanitizeCSVField(t.maxGreen)},${sanitizeCSVField(t.yellow)},${sanitizeCSVField(t.allRed)},${sanitizeCSVField(t.vehRecallType)},${sanitizeCSVField(t.pedRecall)}`
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

// Export individual TXT files - updated for GTSSv1.1
export const exportAsIndividualFiles = async (includeFiles: {
  agency: boolean;
  signals: boolean;
  approaches: boolean;
  phases: boolean;
  detection: boolean;
  basicTimings: boolean;
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

    if (includeFiles.basicTimings) {
      const basicTimingsCSV = generateBasicTimingsCSV(data.basicTimings);
      downloadFile(basicTimingsCSV, 'basic_timings.txt');
    }
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
};

// Export as ZIP using JSZip - updated for GTSSv1.1
export const exportAsZip = async (includeFiles: {
  agency: boolean;
  signals: boolean;
  approaches: boolean;
  phases: boolean;
  detection: boolean;
  basicTimings: boolean;
} = { agency: true, signals: true, approaches: true, phases: true, detection: true, basicTimings: true }): Promise<void> => {
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

    if (includeFiles.basicTimings) {
      const basicTimingsCSV = generateBasicTimingsCSV(data.basicTimings);
      zip.file('basic_timings.txt', basicTimingsCSV);
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

// Parse agency.txt file
export function parseAgencyTXT(content: string): Agency | null {
  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('Agency file must contain header and at least one data row');
  }

  // Use proper CSV parser to handle quoted fields
  const values = parseCSVLine(lines[1]);

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
// Format: signal_id,agency_id,latitude,longitude
export function parseSignalsTXT(content: string): Signal[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('Signals file must contain header and at least one data row');
  }

  const signals: Signal[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Use proper CSV parser to handle quoted fields
    const values = parseCSVLine(lines[i]);

    if (values.length < 4) {
      errors.push(`Row ${i + 1}: Must have 4 fields (signal_id, agency_id, latitude, longitude)`);
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

    // Validate numeric fields using safer validation
    if (!isValidNumber(values[2])) {
      errors.push(`Row ${i + 1}: Latitude must be a valid number, got "${values[2]}"`);
      continue;
    }
    if (!isValidNumber(values[3])) {
      errors.push(`Row ${i + 1}: Longitude must be a valid number, got "${values[3]}"`);
      continue;
    }

    const latitude = Number(values[2]);
    const longitude = Number(values[3]);

    signals.push({
      id: nanoid(),
      signalId: values[0],
      agencyId: values[1],
      streetName1: "", // Not in GTSS import format
      streetName2: "", // Not in GTSS import format
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

// Parse approaches.txt file - new for GTSSv1.1
export function parseApproachesTXT(content: string): Approach[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('Approaches file must contain header and at least one data row');
  }

  const approaches: Approach[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    if (values.length < 5) {
      errors.push(`Row ${i + 1}: Must have at least 5 fields (approachId, signalId, streetName, compassBearing, postedSpeed[, freeRight])`);
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
      errors.push(`Row ${i + 1}: Street Name is required`);
      continue;
    }

    let compassBearing: number | null = null;
    if (values[3] && values[3].trim() !== '') {
      if (!isValidInteger(values[3])) {
        errors.push(`Row ${i + 1}: Compass bearing must be a valid integer or empty, got "${values[3]}"`);
        continue;
      }
      compassBearing = Number(values[3]);
    }

    let postedSpeed: number | null = null;
    if (values[4] && values[4].trim() !== '') {
      if (!isValidInteger(values[4])) {
        errors.push(`Row ${i + 1}: Posted speed must be a valid integer or empty, got "${values[4]}"`);
        continue;
      }
      postedSpeed = Number(values[4]);
    }

    // Optional 6th column: FR (free right slip lane), optionally prefixed with
    // a lane count as "<n>-FR…" (e.g. "2-FR-P" = two-lane FR-P).
    //   '' / 'false' / '0' → 0 (none)
    //   'FR' / 'true' / '1' → 1 (slip lane)
    //   'FR-P' / 'FRP' / '2' → 2 (slip lane with pedestrian crossing)
    //   'FR-P-I' / 'FRPI' / '3' → 3 (improved traffic-calmed crossing)
    // Legacy 5-field rows default to 0 with 1 lane.
    let freeRight = 0;
    let freeRightLanes = 1;
    if (values.length > 5 && values[5].trim() !== '') {
      let raw = values[5].trim().toLowerCase();
      // Strip an optional "<n>-" lane-count prefix.
      const laneMatch = raw.match(/^(\d+)\s*-\s*(fr.*)$/);
      if (laneMatch) {
        const n = parseInt(laneMatch[1], 10);
        if (n >= 1) freeRightLanes = n;
        raw = laneMatch[2];
      }
      if (raw === 'false' || raw === '0') freeRight = 0;
      else if (raw === 'fr' || raw === 'true' || raw === '1') freeRight = 1;
      else if (raw === 'fr-p' || raw === 'frp' || raw === '2') freeRight = 2;
      else if (raw === 'fr-p-i' || raw === 'frpi' || raw === '3') freeRight = 3;
      else {
        errors.push(`Row ${i + 1}: Free right must be "FR", "FR-P", "FR-P-I" (optionally "<n>-" prefixed), or empty, got "${values[5]}"`);
        continue;
      }
    }

    approaches.push({
      id: nanoid(),
      approachId: values[0],
      signalId: values[1],
      streetName: values[2],
      compassBearing,
      postedSpeed,
      freeRight,
      freeRightLanes,
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

// Parse phases.txt file - updated for GTSSv1.1
export function parsePhasesTXT(content: string): Phase[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('Phases file must contain header and at least one data row');
  }

  const phases: Phase[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Use proper CSV parser to handle quoted fields
    const values = parseCSVLine(lines[i]);

    if (values.length < 6) {
      errors.push(`Row ${i + 1}: Must have at least 6 fields (phase, signalId, movementType, numOfLanes, approachId, isOverlap)`);
      continue;
    }

    // Validate required fields using safer validation
    if (!isValidInteger(values[0])) {
      errors.push(`Row ${i + 1}: Phase number must be a valid integer, got "${values[0]}"`);
      continue;
    }

    if (!values[1]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }

    if (!values[2]) {
      errors.push(`Row ${i + 1}: Movement type is required`);
      continue;
    }

    if (!isValidInteger(values[3])) {
      errors.push(`Row ${i + 1}: Number of lanes must be a valid integer, got "${values[3]}"`);
      continue;
    }

    const phaseNum = Number(values[0]);
    const numOfLanes = Number(values[3]);

    // Decode movement type
    const encodedMovement = values[2];
    const movementType = MOVEMENT_TYPE_REVERSE_MAP[encodedMovement] || encodedMovement;

    // Validate movement type is recognized - reject unrecognized types
    if (!MOVEMENT_TYPE_REVERSE_MAP[encodedMovement]) {
      // If it's not a known code, verify it's a valid full movement type name
      const validTypes = ["Through", "Left Turn", "Left Protected-Permissive", "Left Through Shared", "Permissive Phase", "Flashing Yellow Arrow", "U-Turn", "Right Turn", "Through-Right", "Pedestrian"];
      if (!validTypes.includes(encodedMovement)) {
        errors.push(`Row ${i + 1}: Movement type "${encodedMovement}" is not recognized. Expected codes: T, L, LT, TL, FYA, U, R, TR, PED or full names.`);
        continue;
      }
    }

    // Parse optional approach_id field
    const approachId = values[4] && values[4].trim() !== '' ? values[4] : null;

    // Validate overlap boolean
    const overlapValue = values[5].toLowerCase();
    if (overlapValue !== 'true' && overlapValue !== 'false') {
      errors.push(`Row ${i + 1}: Overlap must be "true" or "false", got "${values[5]}"`);
      continue;
    }

    // Pedestrian mode: integer 0–7. Accept legacy "true"/"false" too:
    //   true  → 1 (crosswalk on assigned approach)
    //   false → 0 (none)
    let pedestrianMode = movementType === "Pedestrian"
      ? 6
      : movementType === "Through"
        ? 1
        : 0;
    if (values.length > 6 && values[6].trim() !== '') {
      const raw = values[6].trim().toLowerCase();
      if (raw === 'true') pedestrianMode = 1;
      else if (raw === 'false') pedestrianMode = 0;
      else {
        const n = parseInt(raw, 10);
        if (Number.isInteger(n) && n >= 0 && n <= 7) {
          pedestrianMode = n;
        } else {
          errors.push(`Row ${i + 1}: Pedestrian mode must be 0–7 (or legacy "true"/"false"), got "${values[6]}"`);
          continue;
        }
      }
    }

    phases.push({
      id: nanoid(),
      phase: phaseNum,
      signalId: values[1],
      movementType: movementType,
      isPedestrian: pedestrianMode,
      numOfLanes: numOfLanes,
      approachId,
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
    // Use proper CSV parser to handle quoted fields
    const values = parseCSVLine(lines[i]);

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

    // Use safer integer validation
    if (!isValidInteger(values[2])) {
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

    // Parse optional numeric fields using safer validation
    let length: number | null = null;
    let stopbarSetbackDist: number | null = null;

    if (values[8] && values[8].trim() !== '') {
      if (!isValidNumber(values[8])) {
        errors.push(`Row ${i + 1}: Length must be a valid number or empty, got "${values[8]}"`);
        continue;
      }
      length = Number(values[8]);
    }

    if (values[9] && values[9].trim() !== '') {
      if (!isValidNumber(values[9])) {
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

// Parse basic_timings.txt file - new for GTSSv1.1
export function parseBasicTimingsTXT(content: string): BasicTiming[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('Basic timings file must contain header and at least one data row');
  }

  const timings: BasicTiming[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    if (values.length < 11) {
      errors.push(`Row ${i + 1}: Must have 11 fields (phase, signalId, pedWalk, pedClearance, leadingPedInterval, minGreen, maxGreen, yellow, allRed, vehRecallType, pedRecall)`);
      continue;
    }

    if (!isValidInteger(values[0])) {
      errors.push(`Row ${i + 1}: Phase must be a valid integer, got "${values[0]}"`);
      continue;
    }

    if (!values[1]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }

    const phase = Number(values[0]);

    // Parse optional numeric fields
    const parseOptionalNumber = (val: string, fieldName: string, rowNum: number): number | null | 'error' => {
      if (!val || val.trim() === '') return null;
      if (!isValidNumber(val)) {
        errors.push(`Row ${rowNum}: ${fieldName} must be a valid number or empty, got "${val}"`);
        return 'error';
      }
      return Number(val);
    };

    const pedWalk = parseOptionalNumber(values[2], 'Ped walk', i + 1);
    const pedClearance = parseOptionalNumber(values[3], 'Ped clearance', i + 1);
    const leadingPedInterval = parseOptionalNumber(values[4], 'Leading ped interval', i + 1);
    const minGreen = parseOptionalNumber(values[5], 'Min green', i + 1);
    const maxGreen = parseOptionalNumber(values[6], 'Max green', i + 1);
    const yellow = parseOptionalNumber(values[7], 'Yellow', i + 1);
    const allRed = parseOptionalNumber(values[8], 'All red', i + 1);

    if (pedWalk === 'error' || pedClearance === 'error' || leadingPedInterval === 'error' ||
        minGreen === 'error' || maxGreen === 'error' || yellow === 'error' || allRed === 'error') {
      continue;
    }

    const vehRecallType = values[9] || 'None';
    if (!['None', 'Min', 'Max', 'Soft'].includes(vehRecallType)) {
      errors.push(`Row ${i + 1}: veh_recall_type must be None, Min, Max, or Soft, got "${vehRecallType}"`);
      continue;
    }

    const pedRecallStr = values[10]?.toLowerCase() || 'false';
    if (pedRecallStr !== 'true' && pedRecallStr !== 'false') {
      errors.push(`Row ${i + 1}: ped_recall must be true or false, got "${values[10]}"`);
      continue;
    }

    timings.push({
      id: nanoid(),
      phase,
      signalId: values[1],
      pedWalk: pedWalk as number | null,
      pedClearance: pedClearance as number | null,
      leadingPedInterval: leadingPedInterval as number | null,
      minGreen: minGreen as number | null,
      maxGreen: maxGreen as number | null,
      yellow: yellow as number | null,
      allRed: allRed as number | null,
      vehRecallType,
      pedRecall: pedRecallStr === 'true',
    });
  }

  if (errors.length > 0) {
    throw new Error(`Basic timings validation errors:\n${errors.join('\n')}`);
  }

  if (timings.length === 0) {
    throw new Error('No valid basic timings found in file');
  }

  return timings;
}

// Import data with replace or merge mode - updated for GTSSv1.1
export function importData(
  parsedData: {
    agency?: Agency | null;
    signals?: Signal[];
    approaches?: Approach[];
    phases?: Phase[];
    detectors?: Detector[];
    basicTimings?: BasicTiming[];
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

    if (parsedData.basicTimings !== undefined) {
      saveToStorage(STORAGE_KEYS.BASIC_TIMINGS, parsedData.basicTimings);
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

    if (parsedData.basicTimings && parsedData.basicTimings.length > 0) {
      const existingTimings = getFromStorage<BasicTiming[]>(STORAGE_KEYS.BASIC_TIMINGS, []);
      const existingKeys = new Set(existingTimings.map(t => `${t.signalId}-${t.phase}`));
      const newTimings = parsedData.basicTimings.filter(t => !existingKeys.has(`${t.signalId}-${t.phase}`));
      saveToStorage(STORAGE_KEYS.BASIC_TIMINGS, [...existingTimings, ...newTimings]);
    }
  }
}
