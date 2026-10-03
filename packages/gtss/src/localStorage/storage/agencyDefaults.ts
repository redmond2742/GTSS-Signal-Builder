import type { AgencyDefaults } from "../../agencyDefaults";
import { STORAGE_KEYS } from "../keys";
import { getFromStorage, removeFromStorage, saveToStorage } from "../storage-utils";

export const agencyDefaultsStorage = {
  get: (): AgencyDefaults | null => {
    const stored = getFromStorage<AgencyDefaults | null>(STORAGE_KEYS.AGENCY_DEFAULTS, null);
    if (!stored) return null;
    return {
      ...stored,
      mapScrollWheel: stored.mapScrollWheel === "zoom" ? "zoom" : "page",
    };
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
    removeFromStorage(STORAGE_KEYS.AGENCY_DEFAULTS);
  },
};
