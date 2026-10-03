import { nanoid } from "nanoid";
import type { BasicTiming, InsertBasicTiming } from "../../../schema/public";
import { STORAGE_KEYS } from "../keys";
import {
  getFromStorage,
  hasPrototypePollution,
  removeFromStorage,
  saveToStorage,
} from "../storage-utils";

export const basicTimingStorage = {
  getAll: (): BasicTiming[] => {
    return getFromStorage<BasicTiming[]>(STORAGE_KEYS.BASIC_TIMINGS, []);
  },

  getBySignal: (signalId: string): BasicTiming[] => {
    const timings = basicTimingStorage.getAll();
    return timings.filter((timing) => timing.signalId === signalId);
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

    saveToStorage(STORAGE_KEYS.BASIC_TIMINGS, [...timings, newTiming]);
    return newTiming;
  },

  update: (id: string, updates: Partial<InsertBasicTiming>): BasicTiming | null => {
    if (hasPrototypePollution(updates as Record<string, unknown>)) {
      console.error("Attempted prototype pollution in basic timing update");
      return null;
    }

    const timings = basicTimingStorage.getAll();
    const index = timings.findIndex((timing) => timing.id === id);
    if (index === -1) return null;

    const updatedTiming = { ...timings[index], ...updates };
    timings[index] = updatedTiming;
    saveToStorage(STORAGE_KEYS.BASIC_TIMINGS, timings);
    return updatedTiming;
  },

  delete: (id: string): void => {
    const timings = getFromStorage<BasicTiming[]>(STORAGE_KEYS.BASIC_TIMINGS, []);
    saveToStorage(
      STORAGE_KEYS.BASIC_TIMINGS,
      timings.filter((timing) => timing.id !== id),
    );
  },

  deleteBySignal: (signalId: string): void => {
    const timings = getFromStorage<BasicTiming[]>(STORAGE_KEYS.BASIC_TIMINGS, []);
    saveToStorage(
      STORAGE_KEYS.BASIC_TIMINGS,
      timings.filter((timing) => timing.signalId !== signalId),
    );
  },

  updateSignalId: (oldSignalId: string, newSignalId: string): void => {
    const timings = getFromStorage<BasicTiming[]>(STORAGE_KEYS.BASIC_TIMINGS, []);
    saveToStorage(
      STORAGE_KEYS.BASIC_TIMINGS,
      timings.map((timing) =>
        timing.signalId === oldSignalId ? { ...timing, signalId: newSignalId } : timing,
      ),
    );
  },

  clear: (): void => {
    removeFromStorage(STORAGE_KEYS.BASIC_TIMINGS);
  },
};
