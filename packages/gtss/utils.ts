import { clsx, type ClassValue } from "clsx";
import type { KeyboardEvent } from "react";
import { twMerge } from "tailwind-merge";
import type { Approach, Signal } from './shared/schema';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Tab / Shift+Tab navigation that moves DOWN a column instead of across a row.
 * Attach to a table (or wrapping container) via onKeyDown. Each focusable cell
 * must carry `data-tab-col` and `data-tab-row` attributes. Focusable elements
 * without those attributes are left to the browser's default tab behavior.
 */
export function handleColumnMajorTab(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab") return;
  const target = e.target as HTMLElement;
  if (target.dataset.tabCol == null || target.dataset.tabRow == null) return;

  const cells = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>("[data-tab-col][data-tab-row]")
  ).filter(el => !(el as HTMLInputElement).disabled);

  // Column-major order: all rows of column 0, then column 1, etc.
  cells.sort((a, b) => {
    const ca = Number(a.dataset.tabCol);
    const cb = Number(b.dataset.tabCol);
    if (ca !== cb) return ca - cb;
    return Number(a.dataset.tabRow) - Number(b.dataset.tabRow);
  });

  const idx = cells.indexOf(target);
  if (idx === -1) return;
  const next = cells[e.shiftKey ? idx - 1 : idx + 1];
  if (next) {
    e.preventDefault();
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  }
}

/**
 * Get derived street names from approaches for a signal
 * Returns first 2 unique street names from approaches
 */
export function getDerivedStreetNames(
  signalId: string,
  approaches: Approach[]
): { streetName1: string; streetName2: string } {
  const signalApproaches = approaches.filter(a => a.signalId === signalId);
  const uniqueStreets = Array.from(
    new Set(signalApproaches.map(a => a.streetName).filter(name => name && name.trim()))
  );

  return {
    streetName1: uniqueStreets[0] || "",
    streetName2: uniqueStreets[1] || "",
  };
}

/**
 * Suggest a street name for a NEW approach based on approaches at nearby
 * intersections that point along the same street.
 *
 * Heuristic:
 *   1. Pull every approach from OTHER signals that has both a street name
 *      and a compass bearing.
 *   2. Keep ones whose bearing is within `angleTolerance` of either the
 *      target bearing or its 180° opposite (so a Main St approach at 0° is
 *      considered "same street" as a Main St approach at 180°).
 *   3. Keep ones whose signal is within `maxDistanceMeters` of the target
 *      signal location (haversine).
 *   4. Among survivors, group by street name and return the one with the
 *      highest weight. Weight = sum of 1 / (1 + distanceKm) so closer hits
 *      dominate ties.
 *
 * Returns null if nothing plausible is found.
 */
export function suggestStreetNameForApproach(params: {
  bearing: number;
  signalLat: number;
  signalLng: number;
  currentSignalId: string | null;
  signals: Signal[];
  approaches: Approach[];
  angleTolerance?: number; // degrees, default 25
  maxDistanceMeters?: number; // default 3000
}): string | null {
  const {
    bearing,
    signalLat,
    signalLng,
    currentSignalId,
    signals,
    approaches,
    angleTolerance = 25,
    maxDistanceMeters = 3000,
  } = params;

  if (!Number.isFinite(bearing) || !Number.isFinite(signalLat) || !Number.isFinite(signalLng)) {
    return null;
  }

  // Build a lookup of signalId → { lat, lng } so we can compute distance quickly.
  const signalLoc = new Map<string, { lat: number; lng: number }>();
  for (const s of signals) {
    if (s.latitude != null && s.longitude != null) {
      signalLoc.set(s.signalId, { lat: s.latitude, lng: s.longitude });
    }
  }

  // Angular distance in degrees on a 0..360 circle (always 0..180).
  const angDist = (a: number, b: number) => {
    const d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
    return d;
  };

  // Haversine, in meters.
  const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  const weights = new Map<string, number>();
  const oppositeBearing = (bearing + 180) % 360;

  for (const ap of approaches) {
    if (ap.signalId === currentSignalId) continue;
    if (!ap.streetName || !ap.streetName.trim()) continue;
    if (ap.compassBearing == null) continue;

    const angleToSame = angDist(ap.compassBearing, bearing);
    const angleToOpposite = angDist(ap.compassBearing, oppositeBearing);
    const angleMatch = Math.min(angleToSame, angleToOpposite);
    if (angleMatch > angleTolerance) continue;

    const loc = signalLoc.get(ap.signalId);
    if (!loc) continue;
    const dist = haversine(signalLat, signalLng, loc.lat, loc.lng);
    if (dist > maxDistanceMeters) continue;

    const name = ap.streetName.trim();
    const weight = 1 / (1 + dist / 1000); // emphasize close hits
    weights.set(name, (weights.get(name) ?? 0) + weight);
  }

  if (weights.size === 0) return null;

  let bestName: string | null = null;
  let bestWeight = -Infinity;
  Array.from(weights.entries()).forEach(([name, w]) => {
    if (w > bestWeight) {
      bestWeight = w;
      bestName = name;
    }
  });
  return bestName;
}

/**
 * Get display name for a signal using derived street names from approaches
 * Format: "ID# - Street Name 1 & Street Name 2" or "ID#" if no approaches
 */
export function getSignalDisplayName(
  signal: Signal,
  approaches: Approach[]
): string {
  const derived = getDerivedStreetNames(signal.signalId, approaches);

  if (derived.streetName1 && derived.streetName2) {
    return `${signal.signalId} - ${derived.streetName1} & ${derived.streetName2}`;
  } else if (derived.streetName1) {
    return `${signal.signalId} - ${derived.streetName1}`;
  } else if (signal.streetName1 && signal.streetName2) {
    // Fallback to signal's own street names if no approaches
    return `${signal.signalId} - ${signal.streetName1} & ${signal.streetName2}`;
  } else if (signal.streetName1) {
    return `${signal.signalId} - ${signal.streetName1}`;
  }

  return signal.signalId;
}
