import type { ArrowKind } from "./laneAssignment";
import type { LaneBand, Leg } from "./legLayout";
import type { DetectorInput } from "./types";
import { distanceToMeters } from "./units";

export interface DetectorZone {
  detector: DetectorInput;
  legIndex: number;
  bands: LaneBand[];
  /** Distances from the centre along the leg, metres. */
  s0: number;
  s1: number;
  color: string;
}

const LOOP_DEFAULT_M = 1.8;
const ZONE_DEFAULT_M = 6;

export function detectorColor(technologyType: string): string {
  const tech = technologyType.toLowerCase();
  if (tech.includes("loop")) return "#f97316";
  if (tech.includes("video")) return "#3b82f6";
  if (tech.includes("radar")) return "#a855f7";
  if (tech.includes("microwave")) return "#14b8a6";
  return "#eab308";
}

/**
 * Picks the lanes a detector covers from its free-text lane label (e.g. "EB Thru 2", "Left Pocket",
 * "1"). `lanes` must be ordered centre-to-curb; unmatched labels cover every lane.
 */
export function matchDetectorLanes(
  label: string | null | undefined,
  lanes: LaneBand[],
  arrows: Map<number, ArrowKind>,
): LaneBand[] | null {
  const text = (label ?? "").toLowerCase();
  if (/\bped/.test(text)) return null;
  const withArrow = (letter: string) =>
    lanes.filter((band) => (arrows.get(band.index) ?? "").includes(letter));
  let candidates = lanes;
  if (/\bleft\b/.test(text)) candidates = withArrow("L");
  else if (/\bright\b/.test(text)) candidates = withArrow("R");
  else if (/\b(thru|through|main|cross)\b/.test(text)) candidates = withArrow("T");
  if (!candidates.length) candidates = lanes;
  const number = text.match(/\d+/);
  if (number) {
    const index = Math.min(candidates.length, Math.max(1, Number(number[0]))) - 1;
    return candidates.slice(index, index + 1);
  }
  return candidates;
}

export function placeDetector(
  detector: DetectorInput,
  leg: Leg,
  stopS: number,
  lanes: LaneBand[],
  arrows: Map<number, ArrowKind>,
  isMetric: boolean,
): DetectorZone | null {
  if (!lanes.length) return null;
  const bands = matchDetectorLanes(detector.lane, lanes, arrows);
  if (!bands || !bands.length) return null;
  const isLoop = detector.technologyType.toLowerCase().includes("loop");
  const length =
    detector.length && detector.length > 0
      ? distanceToMeters(detector.length, isMetric)
      : isLoop
        ? LOOP_DEFAULT_M
        : ZONE_DEFAULT_M;
  const setback = distanceToMeters(detector.stopbarSetbackDist ?? 0, isMetric);
  const s0 = stopS + 0.6 + setback;
  return {
    detector,
    legIndex: leg.index,
    bands,
    s0,
    s1: s0 + length,
    color: detectorColor(detector.technologyType),
  };
}
