const METERS_PER_INCH = 0.0254;
const METERS_PER_FOOT = 0.3048;

/** Converts a stored lane width (inches, or cm when metric) to metres. */
export function rawWidthToMeters(value: number, isMetric: boolean): number {
  return isMetric ? value / 100 : value * METERS_PER_INCH;
}

/** Converts a stored distance (feet, or metres when metric) to metres. */
export function distanceToMeters(value: number, isMetric: boolean): number {
  return isMetric ? value : value * METERS_PER_FOOT;
}
