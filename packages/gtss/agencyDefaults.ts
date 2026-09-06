import type { Approach } from './shared/schema';

export type CardinalDirection = 'N' | 'S' | 'E' | 'W';

export type PhaseDirectionStandard = {
  N?: number[];
  S?: number[];
  E?: number[];
  W?: number[];
  N_left?: number[];
  S_left?: number[];
  E_left?: number[];
  W_left?: number[];
};

export type AgencyDefaults = {
  agencyId: string;
  phaseDirectionStandard: PhaseDirectionStandard;
  defaultPhaseCount: number;
  updatedAt: string;
};

/**
 * NEMA standard phase convention.
 * Even phases (2,4,6,8) = through movements.
 * Odd phases (1,3,5,7) = left turn movements.
 *
 * Based on leftTurnMapping in existing code: { 2:5, 4:7, 6:1, 8:3 }
 * Per spec example: E:[2], W:[6], N:[4], S:[8]
 */
export const NEMA_DEFAULTS: PhaseDirectionStandard = {
  E: [2],
  N: [4],
  W: [6],
  S: [8],
  E_left: [5], // leftTurnMapping[2] = 5
  N_left: [7], // leftTurnMapping[4] = 7
  W_left: [1], // leftTurnMapping[6] = 1
  S_left: [3], // leftTurnMapping[8] = 3
};

export const DEFAULT_AGENCY_DEFAULTS: AgencyDefaults = {
  agencyId: '',
  phaseDirectionStandard: { ...NEMA_DEFAULTS },
  defaultPhaseCount: 8,
  updatedAt: new Date().toISOString(),
};

/**
 * Convert a compass bearing (0–359°) to a 4-quadrant cardinal direction.
 * Bearing represents the heading of traffic traveling toward the intersection.
 *   N: 315°–45°   (traffic heading North)
 *   E: 45°–135°   (traffic heading East)
 *   S: 135°–225°  (traffic heading South)
 *   W: 225°–315°  (traffic heading West)
 */
export function bearingToCardinal(bearing: number | null | undefined): CardinalDirection | null {
  if (bearing === null || bearing === undefined) return null;
  const normalized = ((bearing % 360) + 360) % 360;
  if (normalized >= 315 || normalized < 45) return 'N';
  if (normalized >= 45 && normalized < 135) return 'E';
  if (normalized >= 135 && normalized < 225) return 'S';
  return 'W';
}

/**
 * Sanitize a PhaseDirectionStandard: clamp phase numbers to 1–8,
 * remove duplicates within each key, remove invalid entries.
 */
export function sanitizePhaseDirectionStandard(standard: PhaseDirectionStandard): PhaseDirectionStandard {
  const result: PhaseDirectionStandard = {};
  const keys: (keyof PhaseDirectionStandard)[] = ['N', 'S', 'E', 'W', 'N_left', 'S_left', 'E_left', 'W_left'];

  for (const key of keys) {
    const val = standard[key];
    if (val && Array.isArray(val) && val.length > 0) {
      const cleaned = val
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 8);
      if (cleaned.length > 0) {
        result[key] = Array.from(new Set(cleaned));
      }
    }
  }
  return result;
}

/**
 * Validate a phase direction standard, returning an array of error messages.
 * Returns empty array if valid.
 */
export function validatePhaseDirectionStandard(standard: PhaseDirectionStandard): string[] {
  const errors: string[] = [];
  const keys: (keyof PhaseDirectionStandard)[] = ['N', 'S', 'E', 'W', 'N_left', 'S_left', 'E_left', 'W_left'];

  // Collect all assigned phase numbers to check for cross-direction duplicates
  const allPhaseNumbers: number[] = [];

  for (const key of keys) {
    const val = standard[key];
    if (!val || val.length === 0) continue;

    for (const num of val) {
      if (!Number.isInteger(num) || num < 1 || num > 8) {
        errors.push(`${key}: phase number ${num} is out of range (must be 1–8)`);
      } else {
        allPhaseNumbers.push(num);
      }
    }
  }

  // Check for duplicates across all keys
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const num of allPhaseNumbers) {
    if (seen.has(num)) duplicates.add(num);
    seen.add(num);
  }
  if (duplicates.size > 0) {
    errors.push(`Phase numbers assigned to multiple directions: ${Array.from(duplicates).join(', ')}`);
  }

  return errors;
}

/**
 * Guess phase → approachId mapping based on agency defaults and available approaches.
 *
 * Algorithm:
 * 1. Convert each approach's compass bearing to N/S/E/W
 * 2. Look up phase numbers for each direction in the agency defaults (falling back to NEMA)
 * 3. Prefer through phases (even) over left turns (odd) when phaseCount is limited
 * 4. Return { phaseNumber: approachId } for up to phaseCount phases
 *
 * @param phaseCount - Target number of phases to assign
 * @param approaches - Approaches for the signal (with compassBearing)
 * @param agencyDefaults - Persisted agency defaults (or null for NEMA fallback)
 * @returns Map of phaseNumber → approachId
 */
export function guessPhaseDirectionMapping({
  phaseCount,
  approaches,
  agencyDefaults,
}: {
  phaseCount: number;
  approaches: Approach[];
  agencyDefaults: AgencyDefaults | null;
}): Record<number, string> {
  const userStandard = agencyDefaults?.phaseDirectionStandard ?? {};

  // Merge user standard over NEMA defaults: user values override, NEMA fills gaps
  const effectiveStandard: PhaseDirectionStandard = { ...NEMA_DEFAULTS };
  const keys: (keyof PhaseDirectionStandard)[] = ['N', 'S', 'E', 'W', 'N_left', 'S_left', 'E_left', 'W_left'];
  for (const key of keys) {
    const userVal = userStandard[key];
    if (userVal && userVal.length > 0) {
      effectiveStandard[key] = userVal;
    }
  }

  // Build direction → approachId map (first approach per cardinal direction wins)
  const directionToApproach: Partial<Record<CardinalDirection, string>> = {};
  for (const approach of approaches) {
    if (approach.compassBearing !== null && approach.compassBearing !== undefined) {
      const dir = bearingToCardinal(approach.compassBearing);
      if (dir && !directionToApproach[dir]) {
        directionToApproach[dir] = approach.approachId;
      }
    }
  }

  // Build candidate list: { phaseNumber, approachId, isThrough }
  type Candidate = { phaseNumber: number; approachId: string; isThrough: boolean };
  const candidates: Candidate[] = [];
  const cardinals: CardinalDirection[] = ['N', 'S', 'E', 'W'];

  for (const dir of cardinals) {
    const approachId = directionToApproach[dir];
    if (!approachId) continue;

    const throughPhases = effectiveStandard[dir] ?? [];
    for (const phaseNum of throughPhases) {
      candidates.push({ phaseNumber: phaseNum, approachId, isThrough: true });
    }

    const leftKey = `${dir}_left` as keyof PhaseDirectionStandard;
    const leftPhases = effectiveStandard[leftKey] ?? [];
    for (const phaseNum of leftPhases) {
      candidates.push({ phaseNumber: phaseNum, approachId, isThrough: false });
    }
  }

  // Bearing lookup + "are these two approaches roughly opposite (180° apart)?"
  const bearingOf = (approachId: string): number | null => {
    const a = approaches.find((ap) => ap.approachId === approachId);
    return a?.compassBearing ?? null;
  };
  const isOpposite = (b1: number | null, b2: number | null): boolean => {
    if (b1 == null || b2 == null) return false;
    // Angular distance: 0 = same heading, 180 = exactly opposite.
    const dist = Math.abs(((b1 - b2 + 540) % 360) - 180);
    return dist >= 135; // within 45° of being 180° apart (i.e. opposite)
  };

  const result: Record<number, string> = {};
  const usedPhaseNumbers = new Set<number>();
  const tryAdd = (c: Candidate): boolean => {
    if (Object.keys(result).length >= phaseCount) return false;
    if (usedPhaseNumbers.has(c.phaseNumber)) return false;
    result[c.phaseNumber] = c.approachId;
    usedPhaseNumbers.add(c.phaseNumber);
    return true;
  };

  // 1. Through phases first (ascending phase number).
  const throughs = candidates
    .filter((c) => c.isThrough)
    .sort((a, b) => a.phaseNumber - b.phaseNumber);
  for (const c of throughs) tryAdd(c);

  // 2. Left turns, grouped into OPPOSING pairs so a partial phase count (e.g.
  //    6) adds left turns that sit opposite each other on the same street
  //    rather than two unrelated perpendicular lefts.
  const uniqueLefts: Candidate[] = [];
  const seenLeft = new Set<number>();
  for (const c of candidates.filter((c) => !c.isThrough).sort((a, b) => a.phaseNumber - b.phaseNumber)) {
    if (!seenLeft.has(c.phaseNumber)) {
      seenLeft.add(c.phaseNumber);
      uniqueLefts.push(c);
    }
  }

  const leftPairs: [Candidate, Candidate][] = [];
  const leftSingles: Candidate[] = [];
  const paired = new Set<number>();
  for (let i = 0; i < uniqueLefts.length; i++) {
    if (paired.has(i)) continue;
    const a = uniqueLefts[i];
    let partner = -1;
    for (let j = i + 1; j < uniqueLefts.length; j++) {
      if (paired.has(j)) continue;
      if (isOpposite(bearingOf(a.approachId), bearingOf(uniqueLefts[j].approachId))) {
        partner = j;
        break;
      }
    }
    if (partner >= 0) {
      leftPairs.push([a, uniqueLefts[partner]]);
      paired.add(i);
      paired.add(partner);
    } else {
      leftSingles.push(a);
      paired.add(i);
    }
  }
  // Prefer the pair with the lowest phase number (e.g. {1,5} before {3,7}).
  leftPairs.sort(
    (p, q) =>
      Math.min(p[0].phaseNumber, p[1].phaseNumber) - Math.min(q[0].phaseNumber, q[1].phaseNumber),
  );

  // Add complete opposing pairs only when both fit, so we never add a lone
  // left from a pair while a full opposing pair was available.
  for (const [a, b] of leftPairs) {
    if (Object.keys(result).length + 2 <= phaseCount) {
      tryAdd(a);
      tryAdd(b);
    }
  }
  // If a single slot remains (odd count), fill it with any leftover left turns.
  for (const [a, b] of leftPairs) {
    tryAdd(a);
    tryAdd(b);
  }
  for (const c of leftSingles) tryAdd(c);

  return result;
}

/**
 * Determine if a phase number is typically a through movement (even) or left turn (odd).
 */
export function isTypicallyThroughPhase(phaseNumber: number): boolean {
  return phaseNumber % 2 === 0;
}
