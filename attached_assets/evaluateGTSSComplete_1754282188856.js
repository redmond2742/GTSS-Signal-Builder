function evaluateGTSSCompleteness({ signals, phases, detection }) {
  const requiredPhaseCount = 8;
  const minRequiredDetectors = 4;

  const summary = signals.map(signal => {
    const sid = signal.signal_id;

    // Filter relevant data
    const signalPhases = phases.filter(p => p.signal_id === sid);
    const signalDetectors = detection.filter(d => d.signal_id === sid);

    const phaseCount = signalPhases.length;
    const detectorCount = signalDetectors.length;

    const phaseCompleteness = Math.min(phaseCount / requiredPhaseCount, 1);
    const detectorCompleteness = Math.min(detectorCount / minRequiredDetectors, 1);

    const score = Math.round(((phaseCompleteness + detectorCompleteness) / 2) * 100);

    let status = "incomplete";
    if (score === 100) status = "complete";
    else if (score >= 60) status = "partial";

    return {
      signal_id: sid,
      street: `${signal.street_name_1} & ${signal.street_name_2}`,
      phaseCount,
      detectorCount,
      phaseCompleteness: `${Math.round(phaseCompleteness * 100)}%`,
      detectorCompleteness: `${Math.round(detectorCompleteness * 100)}%`,
      overallScore: `${score}%`,
      status,
    };
  });

  return summary;
}

