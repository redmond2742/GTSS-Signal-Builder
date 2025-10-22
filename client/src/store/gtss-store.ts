import { create } from 'zustand';
import { Agency, Signal, Phase, Detector } from '@shared/schema';
import { agencyStorage, signalStorage, phaseStorage, detectorStorage } from '@/lib/localStorage';

interface GTSSStore {
  agency: Agency | null;
  signals: Signal[];
  phases: Phase[];
  detectors: Detector[];
  
  // Navigation state (for single-page app without URL routing)
  currentView: 'main' | 'signal-details';
  currentSignalId: string | null; // null = new signal, string = edit existing
  
  setAgency: (agency: Agency | null) => void;
  setSignals: (signals: Signal[]) => void;
  addSignal: (signal: Signal) => void;
  updateSignal: (signalId: string, signal: Signal) => void;
  deleteSignal: (signalId: string) => void;
  
  setPhases: (phases: Phase[]) => void;
  addPhase: (phase: Phase) => void;
  updatePhase: (id: string, phase: Phase) => void;
  deletePhase: (id: string) => void;
  
  setDetectors: (detectors: Detector[]) => void;
  addDetector: (detector: Detector) => void;
  updateDetector: (id: string, detector: Detector) => void;
  deleteDetector: (id: string) => void;
  
  // Navigation actions
  navigateToMain: () => void;
  navigateToSignalDetails: (signalId: string | null) => void;
  
  // Load from localStorage
  loadFromStorage: () => void;
}

export const useGTSSStore = create<GTSSStore>((set) => ({
  agency: agencyStorage.get(),
  signals: signalStorage.getAll(),
  phases: phaseStorage.getAll(),
  detectors: detectorStorage.getAll(),
  
  // Initial navigation state
  currentView: 'main',
  currentSignalId: null,
  
  setAgency: (agency) => set({ agency }),
  
  setSignals: (signals) => set({ signals }),
  addSignal: (signal) => set((state) => ({ signals: [...state.signals, signal] })),
  updateSignal: (signalId, signal) => set((state) => ({
    signals: state.signals.map(s => s.signalId === signalId ? signal : s)
  })),
  deleteSignal: (signalId) => set((state) => ({
    signals: state.signals.filter(s => s.signalId !== signalId),
    phases: state.phases.filter(p => p.signalId !== signalId),
    detectors: state.detectors.filter(d => d.signalId !== signalId),
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
  
  // Navigation actions
  navigateToMain: () => set({ currentView: 'main', currentSignalId: null }),
  navigateToSignalDetails: (signalId) => set({ currentView: 'signal-details', currentSignalId: signalId }),
  
  loadFromStorage: () => set({
    agency: agencyStorage.get(),
    signals: signalStorage.getAll(),
    phases: phaseStorage.getAll(),
    detectors: detectorStorage.getAll(),
  }),
}));
