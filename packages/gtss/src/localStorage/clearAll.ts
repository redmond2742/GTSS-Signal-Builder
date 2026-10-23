import { clearAllCoordination } from "./coordination/entities";
import { agencyListStorage, agencyStorage } from "./storage/agencies";
import { approachStorage } from "./storage/approaches";
import { basicTimingStorage } from "./storage/basicTimings";
import { detectorStorage } from "./storage/detectors";
import { phaseStorage } from "./storage/phases";
import { signalStorage } from "./storage/signals";

export const clearAllData = (): void => {
  agencyStorage.clear();
  agencyListStorage.clear();
  signalStorage.clear();
  approachStorage.clear();
  phaseStorage.clear();
  detectorStorage.clear();
  basicTimingStorage.clear();
  clearAllCoordination();
};
