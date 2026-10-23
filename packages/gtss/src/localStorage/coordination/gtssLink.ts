import type { Approach, Phase } from "../../../schema/public";
import { opposingPhaseNumber } from "./opposingPhase";

/**
 * Links from the coordination files to the GTSS intersection data.
 *
 * The coordination files name phases by number and nothing more. GTSS knows what
 * each phase is (through, left turn…), which approach it serves, which way that
 * approach's traffic travels, and how fast. That is enough to pick a corridor's
 * coordinated phase at each signal, find the left turn that runs beside it, and
 * use the real approach speeds instead of one number typed into a box.
 */

export interface GtssLinkData {
  phases: readonly Phase[];
  approaches: readonly Approach[];
}

/** Movement types that carry through traffic, best first. */
const THROUGH_MOVEMENTS = ["Through", "Through-Right", "Left Through Shared", "Permissive Phase"];
/** Movement types that are a left turn. */
const LEFT_MOVEMENTS = ["Left Turn", "Left Protected-Permissive", "Flashing Yellow Arrow"];

/** How far an approach's bearing may be from the travel direction and still count, degrees. */
const BEARING_TOLERANCE = 45;

const DIRECTION_BEARINGS: Record<string, number> = {
  N: 0,
  NB: 0,
  NORTH: 0,
  NORTHBOUND: 0,
  NE: 45,
  NEB: 45,
  NORTHEAST: 45,
  NORTHEASTBOUND: 45,
  E: 90,
  EB: 90,
  EAST: 90,
  EASTBOUND: 90,
  SE: 135,
  SEB: 135,
  SOUTHEAST: 135,
  SOUTHEASTBOUND: 135,
  S: 180,
  SB: 180,
  SOUTH: 180,
  SOUTHBOUND: 180,
  SW: 225,
  SWB: 225,
  SOUTHWEST: 225,
  SOUTHWESTBOUND: 225,
  W: 270,
  WB: 270,
  WEST: 270,
  WESTBOUND: 270,
  NW: 315,
  NWB: 315,
  NORTHWEST: 315,
  NORTHWESTBOUND: 315,
};

/**
 * "SB", "S", "Southbound" → 180. The direction traffic TRAVELS, matching how GTSS
 * stores an approach's compass bearing (a northbound approach is 0°). Null when
 * the text isn't a direction.
 */
export function directionBearing(direction: string | null | undefined): number | null {
  const key = (direction ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
  return key in DIRECTION_BEARINGS ? DIRECTION_BEARINGS[key] : null;
}

/** "SB" → "NB", for naming the return direction. Null when it isn't a direction. */
export function reverseDirection(direction: string | null | undefined): string | null {
  const bearing = directionBearing(direction);
  if (bearing === null) return null;
  const names: Record<number, string> = {
    0: "NB",
    45: "NEB",
    90: "EB",
    135: "SEB",
    180: "SB",
    225: "SWB",
    270: "WB",
    315: "NWB",
  };
  return names[(bearing + 180) % 360];
}

const angleBetween = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
};

/**
 * The phase carrying through traffic heading `bearing` at a signal: a through
 * movement on the approach whose bearing is closest to it (within 45°). Null
 * when the signal has no such approach or phase in GTSS.
 */
export function throughPhaseFor(
  signalId: string,
  bearing: number,
  gtss: GtssLinkData,
): number | null {
  return throughApproachFor(signalId, bearing, gtss)?.phase ?? null;
}

/**
 * Like `throughPhaseFor`, with the approach it found — so a picker can say
 * "φ8, Lake Ave NB" rather than a bare number.
 */
export function throughApproachFor(
  signalId: string,
  bearing: number,
  gtss: GtssLinkData,
): { phase: number; approachId: string; streetName: string; postedSpeed: number | null } | null {
  const approaches = gtss.approaches
    .filter((a) => a.signalId === signalId && a.compassBearing != null)
    .map((a) => ({ approach: a, off: angleBetween(a.compassBearing as number, bearing) }))
    .filter((x) => x.off <= BEARING_TOLERANCE)
    .sort((x, y) => x.off - y.off);

  for (const { approach } of approaches) {
    const through = gtss.phases
      .filter(
        (p) =>
          p.signalId === signalId &&
          p.approachId === approach.approachId &&
          THROUGH_MOVEMENTS.includes(p.movementType),
      )
      .sort(
        (p, q) =>
          THROUGH_MOVEMENTS.indexOf(p.movementType) - THROUGH_MOVEMENTS.indexOf(q.movementType) ||
          p.phase - q.phase,
      );
    if (through.length > 0) {
      return {
        phase: through[0].phase,
        approachId: approach.approachId,
        streetName: approach.streetName,
        postedSpeed: approach.postedSpeed,
      };
    }
  }
  return null;
}

/**
 * The protected left turn from the same approach as `throughPhase` — the left
 * that can run alongside it. Null if GTSS doesn't link the phases to approaches
 * or the approach has no left-turn phase.
 */
export function leftPhaseFor(
  signalId: string,
  throughPhase: number,
  gtss: GtssLinkData,
): number | null {
  const through = gtss.phases.find((p) => p.signalId === signalId && p.phase === throughPhase);
  if (!through?.approachId) return null;
  const lefts = gtss.phases
    .filter(
      (p) =>
        p.signalId === signalId &&
        p.approachId === through.approachId &&
        p.phase !== throughPhase &&
        LEFT_MOVEMENTS.includes(p.movementType),
    )
    .sort((p, q) => p.phase - q.phase);
  return lefts[0]?.phase ?? null;
}

/**
 * The left that runs with a through phase in standard dual-ring numbering: the
 * same direction's left sits in the other ring, so 2→5, 4→7, 6→1, 8→3. Used when
 * GTSS can't say. Null for anything that isn't an even phase 2–8.
 */
export function nemaSameDirectionLeft(throughPhase: number): number | null {
  if (throughPhase % 2 !== 0) return null;
  const opposing = opposingPhaseNumber(throughPhase);
  return opposing === null ? null : opposing - 1;
}

/**
 * The posted speed on the approach a phase serves, in the agency's units (mph or
 * km/h; the caller knows which). Null if the phase, its approach or the speed is
 * missing.
 */
export function approachSpeedFor(
  signalId: string,
  phase: number,
  gtss: GtssLinkData,
): number | null {
  const p = gtss.phases.find((x) => x.signalId === signalId && x.phase === phase);
  if (!p?.approachId) return null;
  const approach = gtss.approaches.find(
    (a) => a.signalId === signalId && a.approachId === p.approachId,
  );
  return approach?.postedSpeed != null && approach.postedSpeed > 0 ? approach.postedSpeed : null;
}

/** "Lake Ave SB" → "Lake Ave"; "North Branch (30°)" → "North Branch". */
const DIRECTION_SUFFIX =
  /\s*(?:\([^)]*\)|\b(?:N|S|E|W|NE|NW|SE|SW|NB|SB|EB|WB|NEB|NWB|SEB|SWB|northbound|southbound|eastbound|westbound)\b\.?)\s*$/i;

export function baseStreetName(name: string): string {
  let out = name.trim();
  // Strip more than once: "Lake Ave NB (main)" has two suffixes.
  for (let i = 0; i < 3; i++) {
    const next = out.replace(DIRECTION_SUFFIX, "").trim();
    if (next === out || next === "") break;
    out = next;
  }
  return out;
}

/**
 * The streets that meet at a signal, for labelling: each approach's street name
 * with its direction taken off, each street once. GTSS approach names usually
 * carry a direction ("Grand Ave NB", "Grand Ave SB"), so the first two names are
 * often the same road; this gives "Grand Ave / Broadway" instead. Falls back to
 * the signal's own street names when there are no approaches.
 */
export function intersectionStreetNames(
  signal: { signalId: string; streetName1?: string | null; streetName2?: string | null },
  approaches: readonly { signalId: string; streetName: string | null }[],
): string[] {
  const seen = new Map<string, string>();
  for (const a of approaches) {
    if (a.signalId !== signal.signalId || !a.streetName?.trim()) continue;
    const base = baseStreetName(a.streetName);
    const key = base.toLowerCase();
    if (!seen.has(key)) seen.set(key, base);
  }
  if (seen.size > 0) return Array.from(seen.values());
  return [signal.streetName1, signal.streetName2]
    .map((n) => (n ?? "").trim())
    .filter((n) => n !== "");
}
