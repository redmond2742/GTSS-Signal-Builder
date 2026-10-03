import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PED_RENUMBER_FLAG, STORAGE_KEYS } from "../src/localStorage/keys";
import { detectorStorage, phaseStorage, signalStorage } from "../src/localStorage/storage";
import { isStorageReadOnly, setStorageReadOnly } from "../src/localStorage/write-guard";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const snapshot = () => JSON.stringify({ ...(globalThis.localStorage as unknown as object) });

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
  setStorageReadOnly(false);
});

afterEach(() => setStorageReadOnly(false));

describe("storage write guard", () => {
  it("defaults to writes allowed, so nothing else has to opt in", () => {
    expect(isStorageReadOnly()).toBe(false);
    signalStorage.save({
      signalId: "1",
      agencyId: "A",
      streetName1: "a",
      streetName2: "b",
      latitude: 1,
      longitude: 2,
    });
    expect(signalStorage.getAll()).toHaveLength(1);
  });

  it("blocks saves while read-only, and resumes afterwards", () => {
    setStorageReadOnly(true);
    signalStorage.save({
      signalId: "1",
      agencyId: "A",
      streetName1: "a",
      streetName2: "b",
      latitude: 1,
      longitude: 2,
    });
    expect(localStorage.getItem(STORAGE_KEYS.SIGNALS)).toBeNull();

    setStorageReadOnly(false);
    signalStorage.save({
      signalId: "1",
      agencyId: "A",
      streetName1: "a",
      streetName2: "b",
      latitude: 1,
      longitude: 2,
    });
    expect(signalStorage.getAll()).toHaveLength(1);
  });

  it("blocks updates without throwing, so callers' catch blocks stay quiet", () => {
    detectorStorage.save({
      signalId: "1",
      channel: "Det 1",
      purpose: "Stop Bar",
      technologyType: "Inductance Loop",
    });
    const [saved] = detectorStorage.getAll();

    setStorageReadOnly(true);
    expect(() => detectorStorage.update(saved.id, { channel: "1" })).not.toThrow();
    expect(detectorStorage.getAll()[0].channel).toBe("Det 1");
  });

  it("blocks deletes", () => {
    signalStorage.save({
      signalId: "1",
      agencyId: "A",
      streetName1: "a",
      streetName2: "b",
      latitude: 1,
      longitude: 2,
    });
    setStorageReadOnly(true);
    signalStorage.delete("1");
    expect(signalStorage.getAll()).toHaveLength(1);
  });

  // The decisive case: phaseStorage.getAll() runs a one-time migration that
  // writes, and the zustand store calls it while building its initial state —
  // before any React code exists. A read must not become a write.
  it("leaves storage untouched when a read triggers a migration", () => {
    localStorage.setItem(
      STORAGE_KEYS.PHASES,
      JSON.stringify([
        { id: "p1", signalId: "1", phase: 1, movementType: "Through", isPedestrian: true },
      ]),
    );
    setStorageReadOnly(true);
    const before = snapshot();

    phaseStorage.getAll();

    expect(snapshot()).toBe(before);
    expect(localStorage.getItem(PED_RENUMBER_FLAG)).toBeNull();
  });
});
