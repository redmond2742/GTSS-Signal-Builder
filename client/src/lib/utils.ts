import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Signal, Approach } from "@shared/schema"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
