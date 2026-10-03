import { nanoid } from "nanoid";
import type { Agency, Approach, BasicTiming, Detector, Phase, Signal } from "../../schema/public";
import { STORAGE_KEYS } from "./keys";
import {
  displayDistanceToStored,
  getFromStorage,
  removeFromStorage,
  saveToStorage,
  writeRawToStorage,
} from "./storage-utils";
import { agencyListStorage, agencyStorage } from "./storage/agencies";
import { signalStorage } from "./storage/signals";

export function importData(
  parsedData: {
    agency?: Agency | Agency[] | null;
    signals?: Signal[];
    approaches?: Approach[];
    phases?: Phase[];
    detectors?: Detector[];
    basicTimings?: BasicTiming[];
  },
  mode: "replace" | "merge" = "replace",
): void {
  if (mode === "replace") {
    if (parsedData.agency !== undefined) {
      if (parsedData.agency === null) {
        removeFromStorage(STORAGE_KEYS.AGENCY);
        try {
          removeFromStorage(STORAGE_KEYS.DEFAULT_AGENCY);
        } catch {
          // ignore
        }
      } else if (Array.isArray(parsedData.agency)) {
        const agencies = parsedData.agency.map((agency) => ({
          ...agency,
          id: agency.id ?? nanoid(),
        }));
        saveToStorage(STORAGE_KEYS.AGENCY, agencies);
        try {
          const currentDefault = localStorage.getItem(STORAGE_KEYS.DEFAULT_AGENCY);
          if (!currentDefault || !agencies.some((agency) => agency.id === currentDefault)) {
            if (agencies.length > 0) writeRawToStorage(STORAGE_KEYS.DEFAULT_AGENCY, agencies[0].id);
            else removeFromStorage(STORAGE_KEYS.DEFAULT_AGENCY);
          }
        } catch {
          // ignore storage errors
        }
      } else {
        const agency = parsedData.agency;
        const stored = { ...agency, id: agency.id ?? nanoid() };
        saveToStorage(STORAGE_KEYS.AGENCY, [stored]);
        try {
          writeRawToStorage(STORAGE_KEYS.DEFAULT_AGENCY, stored.id);
        } catch {
          // ignore
        }
      }
    }

    if (parsedData.signals !== undefined) saveToStorage(STORAGE_KEYS.SIGNALS, parsedData.signals);
    if (parsedData.approaches !== undefined)
      saveToStorage(STORAGE_KEYS.APPROACHES, parsedData.approaches);
    if (parsedData.phases !== undefined) saveToStorage(STORAGE_KEYS.PHASES, parsedData.phases);

    if (parsedData.detectors !== undefined) {
      const incomingSignals = parsedData.signals ?? [];
      const incomingAgencies = parsedData.agency
        ? Array.isArray(parsedData.agency)
          ? parsedData.agency
          : [parsedData.agency]
        : null;
      const detectorsToStore = parsedData.detectors.map((detector) => {
        const signal =
          incomingSignals.find((item) => item.signalId === detector.signalId) ||
          signalStorage.get(detector.signalId);
        const agencyId = signal?.agencyId ?? null;
        const agency =
          (agencyId && incomingAgencies
            ? incomingAgencies.find((item) => item.agencyId === agencyId)
            : null) ||
          (agencyId
            ? agencyListStorage.getAll().find((item) => item.agencyId === agencyId)
            : null) ||
          agencyStorage.get();
        const isMetric = agency?.agencyIsMetric ?? false;
        return {
          ...detector,
          length: displayDistanceToStored(detector.length ?? null, isMetric),
          stopbarSetbackDist: displayDistanceToStored(
            detector.stopbarSetbackDist ?? null,
            isMetric,
          ),
        } as Detector;
      });
      saveToStorage(STORAGE_KEYS.DETECTORS, detectorsToStore);
    }

    if (parsedData.basicTimings !== undefined)
      saveToStorage(STORAGE_KEYS.BASIC_TIMINGS, parsedData.basicTimings);
    return;
  }

  if (parsedData.agency) {
    const existing = agencyListStorage.getAll();
    const incoming = Array.isArray(parsedData.agency) ? parsedData.agency : [parsedData.agency];
    for (const agency of incoming) {
      const index = existing.findIndex((item) => item.agencyId === agency.agencyId);
      if (index !== -1)
        existing[index] = { ...existing[index], ...agency, id: existing[index].id } as Agency;
      else existing.push({ ...agency, id: nanoid() });
    }
    saveToStorage(STORAGE_KEYS.AGENCY, existing);
    try {
      const currentDefault = localStorage.getItem(STORAGE_KEYS.DEFAULT_AGENCY);
      if (!currentDefault || !existing.some((agency) => agency.id === currentDefault)) {
        if (existing.length > 0) writeRawToStorage(STORAGE_KEYS.DEFAULT_AGENCY, existing[0].id);
        else removeFromStorage(STORAGE_KEYS.DEFAULT_AGENCY);
      }
    } catch {
      // ignore storage errors
    }
  }

  if (parsedData.signals?.length) {
    const existing = getFromStorage<Signal[]>(STORAGE_KEYS.SIGNALS, []);
    const ids = new Set(existing.map((signal) => signal.signalId));
    saveToStorage(STORAGE_KEYS.SIGNALS, [
      ...existing,
      ...parsedData.signals.filter((signal) => !ids.has(signal.signalId)),
    ]);
  }
  if (parsedData.approaches?.length) {
    const existing = getFromStorage<Approach[]>(STORAGE_KEYS.APPROACHES, []);
    const keys = new Set(existing.map((approach) => `${approach.signalId}-${approach.approachId}`));
    saveToStorage(STORAGE_KEYS.APPROACHES, [
      ...existing,
      ...parsedData.approaches.filter(
        (approach) => !keys.has(`${approach.signalId}-${approach.approachId}`),
      ),
    ]);
  }
  if (parsedData.phases?.length) {
    const existing = getFromStorage<Phase[]>(STORAGE_KEYS.PHASES, []);
    const keys = new Set(existing.map((phase) => `${phase.signalId}-${phase.phase}`));
    saveToStorage(STORAGE_KEYS.PHASES, [
      ...existing,
      ...parsedData.phases.filter((phase) => !keys.has(`${phase.signalId}-${phase.phase}`)),
    ]);
  }
  if (parsedData.detectors?.length) {
    const existing = getFromStorage<Detector[]>(STORAGE_KEYS.DETECTORS, []);
    const keys = new Set(existing.map((detector) => `${detector.signalId}-${detector.channel}`));
    const newDetectors = parsedData.detectors.filter(
      (detector) => !keys.has(`${detector.signalId}-${detector.channel}`),
    );
    const incomingSignals = parsedData.signals ?? [];
    const incomingAgencies = parsedData.agency
      ? Array.isArray(parsedData.agency)
        ? parsedData.agency
        : [parsedData.agency]
      : null;
    const storedDetectors = newDetectors.map((detector) => {
      const signal =
        incomingSignals.find((item) => item.signalId === detector.signalId) ||
        signalStorage.get(detector.signalId);
      const agencyId = signal?.agencyId ?? null;
      const agency =
        (agencyId && incomingAgencies
          ? incomingAgencies.find((item) => item.agencyId === agencyId)
          : null) ||
        (agencyId ? agencyListStorage.getAll().find((item) => item.agencyId === agencyId) : null) ||
        agencyStorage.get();
      const isMetric = agency?.agencyIsMetric ?? false;
      return {
        ...detector,
        length: displayDistanceToStored(detector.length ?? null, isMetric),
        stopbarSetbackDist: displayDistanceToStored(detector.stopbarSetbackDist ?? null, isMetric),
      } as Detector;
    });
    saveToStorage(STORAGE_KEYS.DETECTORS, [...existing, ...storedDetectors]);
  }
  if (parsedData.basicTimings?.length) {
    const existing = getFromStorage<BasicTiming[]>(STORAGE_KEYS.BASIC_TIMINGS, []);
    const keys = new Set(existing.map((timing) => `${timing.signalId}-${timing.phase}`));
    saveToStorage(STORAGE_KEYS.BASIC_TIMINGS, [
      ...existing,
      ...parsedData.basicTimings.filter(
        (timing) => !keys.has(`${timing.signalId}-${timing.phase}`),
      ),
    ]);
  }
}
