import { nanoid } from "nanoid";
import type { Approach, InsertApproach } from "../../../schema/public";
import { STORAGE_KEYS } from "../keys";
import { getFromStorage, hasPrototypePollution, saveToStorage } from "../storage-utils";

function normalizeFreeRight(value: unknown): number {
  if (typeof value === "number") return value;
  if (value === true) return 1;
  return 0;
}

function normalizeFreeRightLanes(value: unknown): number {
  const lanes = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(lanes) && lanes >= 1 ? Math.floor(lanes) : 1;
}

export const approachStorage = {
  getAll: (): Approach[] => {
    const raw = getFromStorage<Approach[]>(STORAGE_KEYS.APPROACHES, []);
    return raw.map((approach) => ({
      ...approach,
      freeRight: normalizeFreeRight((approach as { freeRight?: unknown }).freeRight),
      freeRightLanes: normalizeFreeRightLanes(
        (approach as { freeRightLanes?: unknown }).freeRightLanes,
      ),
      laneConfig: (approach as { laneConfig?: string | null }).laneConfig ?? null,
      laneWidth: (approach as { laneWidth?: string | null }).laneWidth ?? null,
      laneDirection: (approach as { laneDirection?: string | null }).laneDirection ?? null,
    }));
  },

  getBySignal: (signalId: string): Approach[] => {
    const approaches = approachStorage.getAll();
    return approaches.filter((approach) => approach.signalId === signalId);
  },

  save: (approach: InsertApproach): Approach => {
    const approaches = approachStorage.getAll();
    const signalApproaches = approaches.filter((item) => item.signalId === approach.signalId);
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
      laneConfig: approach.laneConfig ?? null,
      laneWidth: approach.laneWidth ?? null,
      laneDirection: approach.laneDirection ?? null,
    };

    saveToStorage(STORAGE_KEYS.APPROACHES, [...approaches, newApproach]);
    return newApproach;
  },

  update: (id: string, updates: Partial<InsertApproach>): Approach | null => {
    if (hasPrototypePollution(updates as Record<string, unknown>)) {
      console.error("Attempted prototype pollution in approach update");
      return null;
    }

    const approaches = approachStorage.getAll();
    const index = approaches.findIndex((approach) => approach.id === id);

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
    const raw = getFromStorage<Approach[]>(STORAGE_KEYS.APPROACHES, []);
    saveToStorage(
      STORAGE_KEYS.APPROACHES,
      raw.filter((approach) => approach.id !== id),
    );
  },

  deleteBySignal: (signalId: string): void => {
    const raw = getFromStorage<Approach[]>(STORAGE_KEYS.APPROACHES, []);
    saveToStorage(
      STORAGE_KEYS.APPROACHES,
      raw.filter((approach) => approach.signalId !== signalId),
    );
  },

  updateSignalId: (oldSignalId: string, newSignalId: string): void => {
    const raw = getFromStorage<Approach[]>(STORAGE_KEYS.APPROACHES, []);
    const updated = raw.map((approach) =>
      approach.signalId === oldSignalId ? { ...approach, signalId: newSignalId } : approach,
    );
    saveToStorage(STORAGE_KEYS.APPROACHES, updated);
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.APPROACHES);
  },
};
