import { useGTSSStore, validateCoordination } from "gtss";
import { useMemo } from "react";

/**
 * Validation for the coordination files, worked out from what is stored. Signals
 * matter too: coordination rows naming a signal GTSS doesn't have are flagged.
 */
export function useCoordinationIssues() {
  const { coordination, signals } = useGTSSStore();
  const signalIds = useMemo(() => new Set(signals.map((s) => s.signalId)), [signals]);
  return useMemo(() => validateCoordination(coordination, signalIds), [coordination, signalIds]);
}
