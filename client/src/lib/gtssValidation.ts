import { Signal, Phase, Detector } from "@shared/schema";

export interface ValidationResult {
  signalId: string;
  street: string;
  phaseCount: number;
  detectorCount: number;
  phaseCompleteness: string;
  detectorCompleteness: string;
  overallScore: string;
  status: 'complete' | 'partial' | 'incomplete';
}

export interface ValidationSummary {
  totalSignals: number;
  completeSignals: number;
  partialSignals: number;
  incompleteSignals: number;
  overallCompleteness: number;
  results: ValidationResult[];
}

export function evaluateGTSSCompleteness(
  signals: Signal[], 
  phases: Phase[], 
  detectors: Detector[]
): ValidationSummary {
  const requiredPhaseCount = 8;
  const minRequiredDetectors = 4;

  const results = signals.map(signal => {
    const sid = signal.signalId;

    // Filter relevant data
    const signalPhases = phases.filter(p => p.signalId === sid);
    const signalDetectors = detectors.filter(d => d.signalId === sid);

    const phaseCount = signalPhases.length;
    const detectorCount = signalDetectors.length;

    const phaseCompleteness = Math.min(phaseCount / requiredPhaseCount, 1);
    const detectorCompleteness = Math.min(detectorCount / minRequiredDetectors, 1);

    const score = Math.round(((phaseCompleteness + detectorCompleteness) / 2) * 100);

    let status: 'complete' | 'partial' | 'incomplete' = "incomplete";
    if (score === 100) status = "complete";
    else if (score >= 60) status = "partial";

    return {
      signalId: sid,
      street: `${signal.streetName1} & ${signal.streetName2}`,
      phaseCount,
      detectorCount,
      phaseCompleteness: `${Math.round(phaseCompleteness * 100)}%`,
      detectorCompleteness: `${Math.round(detectorCompleteness * 100)}%`,
      overallScore: `${score}%`,
      status,
    };
  });

  const completeSignals = results.filter(r => r.status === 'complete').length;
  const partialSignals = results.filter(r => r.status === 'partial').length;
  const incompleteSignals = results.filter(r => r.status === 'incomplete').length;
  
  const overallCompleteness = signals.length > 0 
    ? Math.round((completeSignals / signals.length) * 100)
    : 0;

  return {
    totalSignals: signals.length,
    completeSignals,
    partialSignals,
    incompleteSignals,
    overallCompleteness,
    results
  };
}