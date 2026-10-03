import type { Agency } from "../../schema/public";
import { MAX_STORAGE_SIZE } from "./keys";
import { isStorageReadOnly, refuseWrite } from "./write-guard";

export function hasPrototypePollution(obj: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(obj, "__proto__") ||
    Object.prototype.hasOwnProperty.call(obj, "constructor") ||
    Object.prototype.hasOwnProperty.call(obj, "prototype")
  );
}

export function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function saveToStorage<T>(key: string, data: T): void {
  if (isStorageReadOnly()) return refuseWrite(key, "save");
  try {
    const serialized = JSON.stringify(data);
    if (serialized.length > MAX_STORAGE_SIZE) {
      throw new Error("Data too large for localStorage. Please reduce the number of records.");
    }
    localStorage.setItem(key, serialized);
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      console.error("localStorage quota exceeded");
      throw new Error("Storage quota exceeded. Please delete some data before adding more.", {
        cause: error,
      });
    }
    console.error("Failed to save to localStorage:", error);
    throw error;
  }
}

/** Raw string write. Same policy gate as saveToStorage, for the handful of
 *  keys stored as plain strings rather than JSON. */
export function writeRawToStorage(key: string, value: string): void {
  if (isStorageReadOnly()) return refuseWrite(key, "set");
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error("Failed to save to localStorage:", error);
  }
}

/** Key removal, behind the same policy gate. */
export function removeFromStorage(key: string): void {
  if (isStorageReadOnly()) return refuseWrite(key, "remove");
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error("Failed to remove from localStorage:", error);
  }
}

// Storage/import data may carry these flags as real booleans, "true"/"false"
// strings, or 0/1 — `!!value` alone would treat the string "false" as truthy.
function coerceBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.trim().toLowerCase() === "true" || value === "1";
  return false;
}

export function normalizeAgency(
  agency:
    | (Partial<{ agencyIsMetric?: unknown; agencyIsLht?: unknown }> & Record<string, unknown>)
    | null
    | undefined,
): Agency | null {
  if (agency == null) return null;
  return {
    ...agency,
    agencyIsMetric: coerceBoolean(agency.agencyIsMetric),
    agencyIsLht: coerceBoolean(agency.agencyIsLht),
  } as Agency;
}

export function storedDistanceToDisplay(value: number | null | undefined, isMetric: boolean) {
  if (value == null) return null;
  if (!isMetric) return value;
  const meters = Number(value) / 100;
  return Math.round(meters * 100) / 100;
}

export function displayDistanceToStored(value: number | null | undefined, isMetric: boolean) {
  if (value == null) return null;
  if (!isMetric) return value;
  return Math.round(Number(value) * 100);
}
