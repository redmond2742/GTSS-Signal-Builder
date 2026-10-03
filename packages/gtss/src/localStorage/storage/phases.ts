import { nanoid } from "nanoid";
import type { InsertPhase, Phase } from "../../../schema/public";
import { PED_RENUMBER_FLAG, STORAGE_KEYS } from "../keys";
import {
  getFromStorage,
  hasPrototypePollution,
  removeFromStorage,
  saveToStorage,
  writeRawToStorage,
} from "../storage-utils";

function normalizePedestrian(value: unknown): number {
  if (typeof value === "number") return value;
  if (value === true) return 1;
  return 0;
}

export const phaseStorage = {
  getAll: (): Phase[] => {
    const raw = getFromStorage<Phase[]>(STORAGE_KEYS.PHASES, []);
    const hadOverlap = raw.some((phase) => "isOverlap" in (phase as object));
    const normalized = raw.map((phase) => {
      const rest = { ...phase };
      delete (rest as Phase & { isOverlap?: unknown }).isOverlap;
      return {
        ...rest,
        isPedestrian: normalizePedestrian((phase as { isPedestrian?: unknown }).isPedestrian),
      };
    });
    try {
      if (typeof localStorage !== "undefined" && !localStorage.getItem(PED_RENUMBER_FLAG)) {
        const renumbered = normalized.map((phase) => {
          const value = phase.isPedestrian;
          if (typeof value === "number" && value >= 2 && value <= 4) {
            return { ...phase, isPedestrian: value + 1 };
          }
          return phase;
        });
        saveToStorage(STORAGE_KEYS.PHASES, renumbered);
        writeRawToStorage(PED_RENUMBER_FLAG, "1");
        return renumbered;
      }
      if (hadOverlap) {
        saveToStorage(STORAGE_KEYS.PHASES, normalized);
      }
    } catch {
      // localStorage may be unavailable (SSR / privacy mode) - skip migration.
    }
    return normalized;
  },

  getBySignal: (signalId: string): Phase[] => {
    const phases = phaseStorage.getAll();
    return phases.filter((phase) => phase.signalId === signalId);
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
        phase.isPedestrian == null ? defaultPed : normalizePedestrian(phase.isPedestrian),
      numOfLanes: phase.numOfLanes ?? 1,
      approachId: phase.approachId ?? null,
      crosswalkLength: phase.crosswalkLength ?? null,
    };

    saveToStorage(STORAGE_KEYS.PHASES, [...phases, newPhase]);
    return newPhase;
  },

  update: (id: string, updates: Partial<InsertPhase>): Phase | null => {
    if (hasPrototypePollution(updates as Record<string, unknown>)) {
      console.error("Attempted prototype pollution in phase update");
      return null;
    }

    const phases = phaseStorage.getAll();
    const index = phases.findIndex((phase) => phase.id === id);
    if (index === -1) return null;

    const merged = { ...phases[index], ...updates };
    if ("isPedestrian" in updates) {
      merged.isPedestrian = normalizePedestrian(merged.isPedestrian);
    }
    phases[index] = merged;
    saveToStorage(STORAGE_KEYS.PHASES, phases);
    return merged;
  },

  delete: (id: string): void => {
    const raw = getFromStorage<Phase[]>(STORAGE_KEYS.PHASES, []);
    saveToStorage(
      STORAGE_KEYS.PHASES,
      raw.filter((phase) => phase.id !== id),
    );
  },

  deleteBySignal: (signalId: string): void => {
    const raw = getFromStorage<Phase[]>(STORAGE_KEYS.PHASES, []);
    saveToStorage(
      STORAGE_KEYS.PHASES,
      raw.filter((phase) => phase.signalId !== signalId),
    );
  },

  updateSignalId: (oldSignalId: string, newSignalId: string): void => {
    const raw = getFromStorage<Phase[]>(STORAGE_KEYS.PHASES, []);
    const updated = raw.map((phase) =>
      phase.signalId === oldSignalId ? { ...phase, signalId: newSignalId } : phase,
    );
    saveToStorage(STORAGE_KEYS.PHASES, updated);
  },

  clear: (): void => {
    removeFromStorage(STORAGE_KEYS.PHASES);
  },
};
