import { useEffect } from 'react';
import { useGTSSStore } from '@/store/gtss-store';
import { 
  agencyStorage, 
  signalStorage, 
  phaseStorage, 
  detectorStorage,
  exportAsZip,
  exportAsIndividualFiles
} from './localStorage';
import { 
  InsertAgency, 
  InsertSignal, 
  InsertPhase, 
  InsertDetector 
} from '@shared/schema';

// Custom hooks to replace TanStack Query for localStorage operations

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