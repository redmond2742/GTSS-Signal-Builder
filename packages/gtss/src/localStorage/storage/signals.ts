import { nanoid } from "nanoid";
import type { InsertSignal, Signal } from "../../../schema/public";
import { STORAGE_KEYS } from "../keys";
import {
  getFromStorage,
  hasPrototypePollution,
  removeFromStorage,
  saveToStorage,
} from "../storage-utils";
import { approachStorage } from "./approaches";
import { basicTimingStorage } from "./basicTimings";
import { detectorStorage } from "./detectors";
import { phaseStorage } from "./phases";

export const signalStorage = {
  getAll: (): Signal[] => {
    return getFromStorage<Signal[]>(STORAGE_KEYS.SIGNALS, []);
  },

  get: (signalId: string): Signal | undefined => {
    const signals = signalStorage.getAll();
    return signals.find((signal) => signal.signalId === signalId);
  },

  save: (signal: InsertSignal): Signal => {
    const signals = signalStorage.getAll();
    const newSignal: Signal = {
      id: nanoid(),
      agencyId: signal.agencyId,
      signalId: signal.signalId || `SIG_${String(signals.length + 1).padStart(3, "0")}`,
      streetName1: signal.streetName1,
      streetName2: signal.streetName2,
      latitude: signal.latitude,
      longitude: signal.longitude,
    };

    saveToStorage(STORAGE_KEYS.SIGNALS, [...signals, newSignal]);
    return newSignal;
  },

  update: (signalId: string, updates: Partial<InsertSignal>): Signal | null => {
    if (hasPrototypePollution(updates as Record<string, unknown>)) {
      console.error("Attempted prototype pollution in signal update");
      return null;
    }

    const signals = signalStorage.getAll();
    const index = signals.findIndex((signal) => signal.signalId === signalId);

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
    saveToStorage(
      STORAGE_KEYS.SIGNALS,
      signals.filter((signal) => signal.signalId !== signalId),
    );

    phaseStorage.deleteBySignal(signalId);
    detectorStorage.deleteBySignal(signalId);
    approachStorage.deleteBySignal(signalId);
    basicTimingStorage.deleteBySignal(signalId);
  },

  clear: (): void => {
    removeFromStorage(STORAGE_KEYS.SIGNALS);
  },
};
