import { nanoid } from "nanoid";
import type { Agency, InsertAgency } from "../../../schema/public";
import { parseCSVLine } from "../csv-utils";
import { STORAGE_KEYS } from "../keys";
import {
  getFromStorage,
  normalizeAgency,
  removeFromStorage,
  saveToStorage,
  writeRawToStorage,
} from "../storage-utils";
import { signalStorage } from "./signals";

export const agencyStorage = {
  get: (): Agency | null => {
    try {
      const raw = getFromStorage<Agency[] | null>(STORAGE_KEYS.AGENCY, null);
      if (raw == null) return null;
      if (Array.isArray(raw)) {
        const defId = agencyListStorage.getDefaultId();
        if (defId) {
          return normalizeAgency(raw.find((a) => a.id === defId) ?? raw[0] ?? null);
        }
        return normalizeAgency(raw[0] ?? null);
      }
      return normalizeAgency(raw as Agency);
    } catch {
      return null;
    }
  },

  save: (agency: InsertAgency): Agency => {
    const raw = getFromStorage<Agency[] | null>(STORAGE_KEYS.AGENCY, null);
    const list: Agency[] = Array.isArray(raw) ? raw : raw ? [raw as Agency] : [];
    const existingIndex = list.findIndex((a) => a.agencyId === agency.agencyId);
    const newAgency: Agency = {
      id: existingIndex !== -1 ? list[existingIndex].id : nanoid(),
      agencyId: agency.agencyId,
      agencyName: agency.agencyName,
      agencyUrl: agency.agencyUrl ?? null,
      agencyTimezone: agency.agencyTimezone,
      agencyLanguage: agency.agencyLanguage ?? null,
      agencyIsMetric: agency.agencyIsMetric ?? false,
      agencyIsLht: agency.agencyIsLht ?? false,
      agencyEmail: agency.agencyEmail ?? null,
      latitude: agency.latitude ?? null,
      longitude: agency.longitude ?? null,
    };

    if (existingIndex !== -1) list[existingIndex] = newAgency;
    else list.push(newAgency);

    saveToStorage(STORAGE_KEYS.AGENCY, list);
    const defaultId = localStorage.getItem(STORAGE_KEYS.DEFAULT_AGENCY);
    if (!defaultId) {
      try {
        writeRawToStorage(STORAGE_KEYS.DEFAULT_AGENCY, newAgency.id);
      } catch {
        // Ignore storage errors when setting the initial default.
      }
    }
    return newAgency;
  },

  clear: (): void => {
    removeFromStorage(STORAGE_KEYS.AGENCY);
    removeFromStorage(STORAGE_KEYS.DEFAULT_AGENCY);
  },
};

export const agencyListStorage = {
  getAll: (): Agency[] => {
    const raw = getFromStorage<Agency[] | null>(STORAGE_KEYS.AGENCY, null);
    if (!raw) return [];
    const list = Array.isArray(raw) ? raw : [raw as Agency];
    return list.map((a) => normalizeAgency(a) as Agency);
  },

  get: (id: string): Agency | undefined => {
    return agencyListStorage.getAll().find((a) => a.id === id);
  },

  save: (agency: InsertAgency): Agency => {
    const list = agencyListStorage.getAll();
    const existingIndex = list.findIndex((a) => a.agencyId === agency.agencyId);
    const newAgency: Agency = {
      id: existingIndex !== -1 ? list[existingIndex].id : nanoid(),
      agencyId: agency.agencyId,
      agencyName: agency.agencyName,
      agencyUrl: agency.agencyUrl ?? null,
      agencyTimezone: agency.agencyTimezone,
      agencyLanguage: agency.agencyLanguage ?? null,
      agencyIsMetric: agency.agencyIsMetric ?? false,
      agencyIsLht: agency.agencyIsLht ?? false,
      agencyEmail: agency.agencyEmail ?? null,
      latitude: agency.latitude ?? null,
      longitude: agency.longitude ?? null,
    };

    if (existingIndex !== -1) list[existingIndex] = newAgency;
    else list.push(newAgency);

    saveToStorage(STORAGE_KEYS.AGENCY, list);

    const defaultId = localStorage.getItem(STORAGE_KEYS.DEFAULT_AGENCY);
    if (!defaultId) {
      try {
        writeRawToStorage(STORAGE_KEYS.DEFAULT_AGENCY, newAgency.id);
      } catch {
        // Ignore storage errors when setting the initial default.
      }
    }

    return newAgency;
  },
  clear: (): void => {
    removeFromStorage(STORAGE_KEYS.AGENCY);
    removeFromStorage(STORAGE_KEYS.DEFAULT_AGENCY);
  },
  deleteWithCascade: (id: string): void => {
    const agency = agencyListStorage.get(id);
    if (!agency) return;

    const signals = signalStorage.getAll().filter((s) => s.agencyId === agency.agencyId);
    signals.forEach((s) => signalStorage.delete(s.signalId));

    const list = agencyListStorage.getAll();
    const updated = list.filter((a) => a.id !== id);
    saveToStorage(STORAGE_KEYS.AGENCY, updated);

    const defaultId = localStorage.getItem(STORAGE_KEYS.DEFAULT_AGENCY);
    if (defaultId === id) {
      if (updated.length > 0) {
        try {
          writeRawToStorage(STORAGE_KEYS.DEFAULT_AGENCY, updated[0].id);
        } catch {
          // Ignore storage errors when selecting a replacement default.
        }
      } else {
        removeFromStorage(STORAGE_KEYS.DEFAULT_AGENCY);
      }
    }
  },

  getDefaultId: (): string | null => {
    try {
      const value = localStorage.getItem(STORAGE_KEYS.DEFAULT_AGENCY);
      return value || null;
    } catch {
      return null;
    }
  },

  setDefaultId: (id: string | null): void => {
    if (id) {
      try {
        writeRawToStorage(STORAGE_KEYS.DEFAULT_AGENCY, id);
      } catch {
        // Ignore storage errors when selecting a default.
      }
    } else {
      removeFromStorage(STORAGE_KEYS.DEFAULT_AGENCY);
    }
  },
};

export function parseAgenciesTXT(content: string): Agency[] {
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("Agency file must contain header and at least one data row");
  }

  const agencies: Agency[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    if (values.length < 5) {
      throw new Error(
        `Row ${i + 1}: Agency data must have at least 5 fields: agencyId, agencyName, agencyUrl, agencyTimezone, agencyEmail`,
      );
    }
    if (!values[0]) throw new Error(`Row ${i + 1}: Agency ID is required`);
    if (!values[1]) throw new Error(`Row ${i + 1}: Agency Name is required`);
    if (!values[3]) throw new Error(`Row ${i + 1}: Agency Timezone is required`);

    agencies.push({
      id: nanoid(),
      agencyId: values[0],
      agencyName: values[1],
      agencyUrl: values[2] || null,
      agencyTimezone: values[3],
      agencyLanguage: null,
      agencyEmail: values[4] || null,
      latitude: null,
      longitude: null,
      agencyIsMetric: values[5] ? values[5].toLowerCase() === "true" : false,
      agencyIsLht: values[6] ? values[6].toLowerCase() === "true" : false,
    });
  }

  if (agencies.length === 0) throw new Error("No valid agencies found in file");
  return agencies;
}

export function parseAgencyTXT(content: string): Agency | null {
  const agencies = parseAgenciesTXT(content);
  return agencies.length > 0 ? agencies[0] : null;
}
