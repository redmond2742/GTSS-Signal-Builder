import { create } from 'zustand';
import { AgencyDefaults, } from '../agencyDefaults';
import { agencyDefaultsStorage, agencyStorage, approachStorage, basicTimingStorage, detectorStorage, phaseStorage, signalStorage } from '../localStorage';
import type { Agency, Approach, BasicTiming, Detector, Phase, Signal } from '../schema/schema';

interface GTSSStore {
  agency: Agency | null;
  agencyDefaults: AgencyDefaults | null;
  signals: Signal[];
  approaches: Approach[];
  phases: Phase[];
  detectors: Detector[];
  basicTimings: BasicTiming[];

  // Navigation state (for single-page app without URL routing)
  currentView: 'main' | 'signal-details';
  currentSignalId: string | null; // null = new signal, string = edit existing

  // Shared signal selection state (persists across tabs)
  selectedSignalIdForTables: string;
  setSelectedSignalIdForTables: (signalId: string) => void;

  setAgency: (agency: Agency | null) => void;
  setAgencyDefaults: (defaults: AgencyDefaults | null) => void;
  setSignals: (signals: Signal[]) => void;
  addSignal: (signal: Signal) => void;
  updateSignal: (signalId: string, signal: Signal) => void;
  deleteSignal: (signalId: string) => void;

  setApproaches: (approaches: Approach[]) => void;
  addApproach: (approach: Approach) => void;
  updateApproach: (id: string, approach: Approach) => void;
  deleteApproach: (id: string) => void;

  setPhases: (phases: Phase[]) => void;
  addPhase: (phase: Phase) => void;
  updatePhase: (id: string, phase: Phase) => void;
  deletePhase: (id: string) => void;

  setDetectors: (detectors: Detector[]) => void;
  addDetector: (detector: Detector) => void;
  updateDetector: (id: string, detector: Detector) => void;
  deleteDetector: (id: string) => void;

  setBasicTimings: (timings: BasicTiming[]) => void;
  addBasicTiming: (timing: BasicTiming) => void;
  updateBasicTiming: (id: string, timing: BasicTiming) => void;
  deleteBasicTiming: (id: string) => void;

  // Navigation actions
  navigateToMain: () => void;
  navigateToSignalDetails: (signalId: string | null) => void;

  // Load from localStorage
  loadFromStorage: () => void;
}

export const useGTSSStore = create<GTSSStore>((set) => ({
  agency: agencyStorage.get(),
  agencyDefaults: agencyDefaultsStorage.get(),
  signals: signalStorage.getAll(),
  approaches: approachStorage.getAll(),
  phases: phaseStorage.getAll(),
  detectors: detectorStorage.getAll(),
  basicTimings: basicTimingStorage.getAll(),

  // Initial navigation state
  currentView: 'main',
  currentSignalId: null,

  // Shared signal selection (empty string = auto-select first signal)
  selectedSignalIdForTables: '',
  setSelectedSignalIdForTables: (signalId) => set({ selectedSignalIdForTables: signalId }),

  setAgency: (agency) => set({ agency }),
  setAgencyDefaults: (agencyDefaults) => set({ agencyDefaults }),

  setSignals: (signals) => set({ signals }),
  addSignal: (signal) => set((state) => ({ signals: [...state.signals, signal] })),
  updateSignal: (signalId, signal) => set((state) => ({
    signals: state.signals.map(s => s.signalId === signalId ? signal : s),
    approaches: signal.signalId === signalId
      ? state.approaches
      : state.approaches.map(a => a.signalId === signalId ? { ...a, signalId: signal.signalId } : a),
    phases: signal.signalId === signalId
      ? state.phases
      : state.phases.map(p => p.signalId === signalId ? { ...p, signalId: signal.signalId } : p),
    detectors: signal.signalId === signalId
      ? state.detectors
      : state.detectors.map(d => d.signalId === signalId ? { ...d, signalId: signal.signalId } : d),
    basicTimings: signal.signalId === signalId
      ? state.basicTimings
      : state.basicTimings.map(t => t.signalId === signalId ? { ...t, signalId: signal.signalId } : t),
  })),
  deleteSignal: (signalId) => set((state) => ({
    signals: state.signals.filter(s => s.signalId !== signalId),
    approaches: state.approaches.filter(a => a.signalId !== signalId),
    phases: state.phases.filter(p => p.signalId !== signalId),
    detectors: state.detectors.filter(d => d.signalId !== signalId),
    basicTimings: state.basicTimings.filter(t => t.signalId !== signalId),
  })),

  setApproaches: (approaches) => set({ approaches }),
  addApproach: (approach) => set((state) => ({ approaches: [...state.approaches, approach] })),
  updateApproach: (id, approach) => set((state) => ({
    approaches: state.approaches.map(a => a.id === id ? approach : a)
  })),
  deleteApproach: (id) => set((state) => ({
    approaches: state.approaches.filter(a => a.id !== id)
  })),

  setPhases: (phases) => set({ phases }),
  addPhase: (phase) => set((state) => ({ phases: [...state.phases, phase] })),
  updatePhase: (id, phase) => set((state) => ({
    phases: state.phases.map(p => p.id === id ? phase : p)
  })),
  deletePhase: (id) => set((state) => ({
    phases: state.phases.filter(p => p.id !== id)
  })),

  setDetectors: (detectors) => set({ detectors }),
  addDetector: (detector) => set((state) => ({ detectors: [...state.detectors, detector] })),
  updateDetector: (id, detector) => set((state) => ({
    detectors: state.detectors.map(d => d.id === id ? detector : d)
  })),
  deleteDetector: (id) => set((state) => ({
    detectors: state.detectors.filter(d => d.id !== id)
  })),

  setBasicTimings: (basicTimings) => set({ basicTimings }),
  addBasicTiming: (timing) => set((state) => ({ basicTimings: [...state.basicTimings, timing] })),
  updateBasicTiming: (id, timing) => set((state) => ({
    basicTimings: state.basicTimings.map(t => t.id === id ? timing : t)
  })),
  deleteBasicTiming: (id) => set((state) => ({
    basicTimings: state.basicTimings.filter(t => t.id !== id)
  })),

  // Navigation actions
  navigateToMain: () => set({ currentView: 'main', currentSignalId: null }),
  navigateToSignalDetails: (signalId) => set({ currentView: 'signal-details', currentSignalId: signalId }),

  loadFromStorage: () => set({
    agency: agencyStorage.get(),
    agencyDefaults: agencyDefaultsStorage.get(),
    signals: signalStorage.getAll(),
    approaches: approachStorage.getAll(),
    phases: phaseStorage.getAll(),
    detectors: detectorStorage.getAll(),
    basicTimings: basicTimingStorage.getAll(),
  }),
}));
