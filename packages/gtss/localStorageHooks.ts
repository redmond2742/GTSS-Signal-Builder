import { useEffect } from 'react';
import { AgencyDefaults } from './agencyDefaults';
import {
  agencyDefaultsStorage,
  agencyStorage,
  approachStorage,
  basicTimingStorage,
  detectorStorage,
  exportAsIndividualFiles,
  exportAsZip,
  phaseStorage,
  signalStorage
} from './localStorage';
import {
  InsertAgency,
  InsertApproach,
  InsertBasicTiming,
  InsertDetector,
  InsertPhase,
  InsertSignal
} from './shared/schema';
import { useGTSSStore } from './store/gtss-store';

// Custom hooks to replace TanStack Query for localStorage operations

export const useAgencyDefaults = () => {
  const { agencyDefaults, setAgencyDefaults } = useGTSSStore();

  const saveAgencyDefaults = (defaults: AgencyDefaults) => {
    const saved = agencyDefaultsStorage.save(defaults);
    setAgencyDefaults(saved);
    return saved;
  };

  const clearAgencyDefaults = () => {
    agencyDefaultsStorage.clear();
    setAgencyDefaults(null);
  };

  return {
    data: agencyDefaults,
    save: saveAgencyDefaults,
    clear: clearAgencyDefaults,
  };
};

export const useAgency = () => {
  const { agency, setAgency } = useGTSSStore();

  const saveAgency = (data: InsertAgency) => {
    const savedAgency = agencyStorage.save(data);
    setAgency(savedAgency);
    return savedAgency;
  };

  return {
    data: agency,
    save: saveAgency,
  };
};

export const useSignals = () => {
  const { signals, setSignals, addSignal, updateSignal, deleteSignal } = useGTSSStore();

  const saveSignal = (data: InsertSignal) => {
    const savedSignal = signalStorage.save(data);
    addSignal(savedSignal);
    return savedSignal;
  };

  const updateSignalById = (signalId: string, data: Partial<InsertSignal>) => {
    const updatedSignal = signalStorage.update(signalId, data);
    if (updatedSignal) {
      updateSignal(signalId, updatedSignal);
    }
    return updatedSignal;
  };

  const deleteSignalById = (signalId: string) => {
    signalStorage.delete(signalId);
    deleteSignal(signalId);
  };

  return {
    data: signals,
    save: saveSignal,
    update: updateSignalById,
    delete: deleteSignalById,
  };
};

export const useApproaches = () => {
  const { approaches, setApproaches, addApproach, updateApproach, deleteApproach, phases, updatePhase } = useGTSSStore();

  const saveApproach = (data: InsertApproach) => {
    const savedApproach = approachStorage.save(data);
    addApproach(savedApproach);
    return savedApproach;
  };

  const updateApproachById = (id: string, data: Partial<InsertApproach>) => {
    // Get the current approach to check if approachId is being changed
    const currentApproach = approaches.find(a => a.id === id);
    const oldApproachId = currentApproach?.approachId;
    const newApproachId = data.approachId;

    const updatedApproach = approachStorage.update(id, data);
    if (updatedApproach) {
      updateApproach(id, updatedApproach);

      // If approachId changed, update all phases that reference the old approachId
      if (oldApproachId && newApproachId && oldApproachId !== newApproachId) {
        const signalId = currentApproach?.signalId;
        const phasesToUpdate = phases.filter(
          p => p.signalId === signalId && p.approachId === oldApproachId
        );

        for (const phase of phasesToUpdate) {
          const updatedPhase = phaseStorage.update(phase.id, { approachId: newApproachId });
          if (updatedPhase) {
            updatePhase(phase.id, updatedPhase);
          }
        }
      }
    }
    return updatedApproach;
  };

  const deleteApproachById = (id: string) => {
    approachStorage.delete(id);
    deleteApproach(id);
  };

  return {
    data: approaches,
    save: saveApproach,
    update: updateApproachById,
    delete: deleteApproachById,
  };
};

export const usePhases = () => {
  const { phases, setPhases, addPhase, updatePhase, deletePhase } = useGTSSStore();

  const savePhase = (data: InsertPhase) => {
    const savedPhase = phaseStorage.save(data);
    addPhase(savedPhase);
    return savedPhase;
  };

  const updatePhaseById = (id: string, data: Partial<InsertPhase>) => {
    const updatedPhase = phaseStorage.update(id, data);
    if (updatedPhase) {
      updatePhase(id, updatedPhase);
    }
    return updatedPhase;
  };

  const deletePhaseById = (id: string) => {
    phaseStorage.delete(id);
    deletePhase(id);
  };

  return {
    data: phases,
    save: savePhase,
    update: updatePhaseById,
    delete: deletePhaseById,
  };
};

export const useDetectors = () => {
  const { detectors, setDetectors, addDetector, updateDetector, deleteDetector } = useGTSSStore();

  const saveDetector = (data: InsertDetector) => {
    const savedDetector = detectorStorage.save(data);
    addDetector(savedDetector);
    return savedDetector;
  };

  const updateDetectorById = (id: string, data: Partial<InsertDetector>) => {
    const updatedDetector = detectorStorage.update(id, data);
    if (updatedDetector) {
      updateDetector(id, updatedDetector);
    }
    return updatedDetector;
  };

  const deleteDetectorById = (id: string) => {
    detectorStorage.delete(id);
    deleteDetector(id);
  };

  return {
    data: detectors,
    save: saveDetector,
    update: updateDetectorById,
    delete: deleteDetectorById,
  };
};

export const useBasicTimings = () => {
  const { basicTimings, setBasicTimings, addBasicTiming, updateBasicTiming, deleteBasicTiming } = useGTSSStore();

  const saveBasicTiming = (data: InsertBasicTiming) => {
    const savedTiming = basicTimingStorage.save(data);
    addBasicTiming(savedTiming);
    return savedTiming;
  };

  const updateBasicTimingById = (id: string, data: Partial<InsertBasicTiming>) => {
    const updatedTiming = basicTimingStorage.update(id, data);
    if (updatedTiming) {
      updateBasicTiming(id, updatedTiming);
    }
    return updatedTiming;
  };

  const deleteBasicTimingById = (id: string) => {
    basicTimingStorage.delete(id);
    deleteBasicTiming(id);
  };

  return {
    data: basicTimings,
    save: saveBasicTiming,
    update: updateBasicTimingById,
    delete: deleteBasicTimingById,
  };
};

// Export hook
export const useExport = () => {
  return {
    exportAsZip,
    exportAsIndividualFiles,
  };
};

// Hook to load all data from localStorage on app start
export const useLoadFromStorage = () => {
  const { loadFromStorage } = useGTSSStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);
};
