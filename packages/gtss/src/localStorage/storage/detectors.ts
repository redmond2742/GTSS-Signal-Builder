import { nanoid } from "nanoid";
import type { Detector, InsertDetector } from "../../../schema/public";
import { isMetricForSignalId } from "../agency-units";
import { STORAGE_KEYS } from "../keys";
import {
  displayDistanceToStored,
  getFromStorage,
  hasPrototypePollution,
  removeFromStorage,
  saveToStorage,
  storedDistanceToDisplay,
} from "../storage-utils";

export const detectorStorage = {
  getAll: (): Detector[] => {
    const raw = getFromStorage<Detector[]>(STORAGE_KEYS.DETECTORS, []);
    return raw.map((detector) => {
      const isMetric = isMetricForSignalId(detector.signalId);
      return {
        ...detector,
        phase: detector.phase ?? null,
        approachId: (detector as { approachId?: string | null }).approachId ?? null,
        length: storedDistanceToDisplay(detector.length ?? null, isMetric),
        stopbarSetbackDist: storedDistanceToDisplay(detector.stopbarSetbackDist ?? null, isMetric),
      };
    });
  },

  getBySignal: (signalId: string): Detector[] => {
    const detectors = detectorStorage.getAll();
    return detectors.filter((detector) => detector.signalId === signalId);
  },

  save: (detector: InsertDetector): Detector => {
    const raw = getFromStorage<Detector[]>(STORAGE_KEYS.DETECTORS, []);
    const isMetric = isMetricForSignalId(detector.signalId);

    const storedDetector = {
      id: nanoid(),
      signalId: detector.signalId,
      phase: detector.phase ?? null,
      channel: detector.channel,
      description: detector.description ?? null,
      purpose: detector.purpose,
      vehicleType: detector.vehicleType ?? null,
      lane: detector.lane ?? null,
      technologyType: detector.technologyType,
      length: displayDistanceToStored(detector.length ?? null, isMetric),
      stopbarSetbackDist: displayDistanceToStored(detector.stopbarSetbackDist ?? null, isMetric),
      approachId: detector.approachId ?? null,
    };

    saveToStorage(STORAGE_KEYS.DETECTORS, [...raw, storedDetector]);

    return {
      ...storedDetector,
      length: storedDistanceToDisplay(storedDetector.length ?? null, isMetric),
      stopbarSetbackDist: storedDistanceToDisplay(
        storedDetector.stopbarSetbackDist ?? null,
        isMetric,
      ),
    } as Detector;
  },

  update: (id: string, updates: Partial<InsertDetector>): Detector | null => {
    if (hasPrototypePollution(updates as Record<string, unknown>)) {
      console.error("Attempted prototype pollution in detector update");
      return null;
    }

    const raw = getFromStorage<Detector[]>(STORAGE_KEYS.DETECTORS, []);
    const index = raw.findIndex((detector) => detector.id === id);
    if (index === -1) return null;

    const targetSignalId =
      "signalId" in updates && typeof updates.signalId === "string"
        ? updates.signalId
        : raw[index].signalId;
    const isMetric = isMetricForSignalId(targetSignalId);

    const updatesForStorage: Partial<Record<string, unknown>> = { ...updates };
    if ("length" in updatesForStorage) {
      updatesForStorage.length = displayDistanceToStored(updates.length ?? null, isMetric);
    }
    if ("stopbarSetbackDist" in updatesForStorage) {
      updatesForStorage.stopbarSetbackDist = displayDistanceToStored(
        updates.stopbarSetbackDist ?? null,
        isMetric,
      );
    }

    const mergedStored = { ...raw[index], ...updatesForStorage };
    raw[index] = mergedStored as Detector;
    saveToStorage(STORAGE_KEYS.DETECTORS, raw);

    return {
      ...mergedStored,
      length: storedDistanceToDisplay(mergedStored.length ?? null, isMetric),
      stopbarSetbackDist: storedDistanceToDisplay(
        mergedStored.stopbarSetbackDist ?? null,
        isMetric,
      ),
    } as Detector;
  },

  delete: (id: string): void => {
    const raw = getFromStorage<Detector[]>(STORAGE_KEYS.DETECTORS, []);
    saveToStorage(
      STORAGE_KEYS.DETECTORS,
      raw.filter((detector) => detector.id !== id),
    );
  },

  deleteBySignal: (signalId: string): void => {
    const raw = getFromStorage<Detector[]>(STORAGE_KEYS.DETECTORS, []);
    saveToStorage(
      STORAGE_KEYS.DETECTORS,
      raw.filter((detector) => detector.signalId !== signalId),
    );
  },

  updateSignalId: (oldSignalId: string, newSignalId: string): void => {
    const raw = getFromStorage<Detector[]>(STORAGE_KEYS.DETECTORS, []);
    const updated = raw.map((detector) =>
      detector.signalId === oldSignalId ? { ...detector, signalId: newSignalId } : detector,
    );
    saveToStorage(STORAGE_KEYS.DETECTORS, updated);
  },

  clear: (): void => {
    removeFromStorage(STORAGE_KEYS.DETECTORS);
  },
};
