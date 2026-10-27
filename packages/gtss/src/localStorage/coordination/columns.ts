// Column order for the 7 coordination files — the single source of truth.
//
// The six original GTSS entities couple their CSV generator to their parser by
// hand: the generator writes a header literal and the parser reads `values[7]`,
// with nothing tying the two together. Adding a column in one place and not the
// other fails silently. Here the generator joins these arrays for its header and
// its row order, and the parser looks fields up by NAME against the same array,
// so the coupling is mechanical.
//
// Names and order are taken verbatim from a real converter export
// (GTSS-Coordination.zip) — there is no published coordination spec to check
// against, so this file is the spec until there is one.

export const CORRIDOR_COLUMNS = [
  "corridor_id",
  "name",
  "description",
  "primary_direction",
  // Folded in from the old Coordination.txt, which is no longer exported.
  "reference_clock",
  "timezone",
] as const;

export const CORRIDOR_SIGNAL_COLUMNS = [
  "corridor_id",
  "sequence",
  "signal_id",
  "direction",
] as const;

export const PATTERN_COLUMNS = [
  "pattern_id",
  "pattern_number",
  "corridor_id",
  "cycle_length_s",
  "reference_point",
  "description",
] as const;

export const PATTERN_SIGNAL_COLUMNS = [
  "pattern_id",
  "signal_id",
  "offset_s",
  "coordinated_phase",
  "reference_point",
  "notes",
] as const;

export const SPLIT_COLUMNS = ["pattern_id", "signal_id", "phase_id", "split_s"] as const;

export const SCHEDULE_COLUMNS = [
  "schedule_id",
  "corridor_id",
  "day_type",
  "start_time",
  "end_time",
  "pattern_id",
  "priority",
] as const;

export const PHASE_SEQUENCE_COLUMNS = [
  "signal_id",
  "sequence_id",
  "ring",
  "position",
  "phase_id",
  "barrier_id",
  // GTSS Builder's addition, not the converter's: the directions whose traffic
  // can go through the signal while this phase is green, beyond the coordinated
  // phase (an overlap carrying the through movement, or a left turn the route
  // takes). Only written when some row uses it.
  "progression",
] as const;

/**
 * Read a parsed CSV row by column name rather than by index.
 *
 * Returns "" for a missing column so a short row degrades to empty fields
 * instead of `undefined` leaking into the row object.
 */
export function fieldReader<C extends readonly string[]>(columns: C, values: string[]) {
  return (name: C[number]): string => {
    const index = columns.indexOf(name);
    return index === -1 ? "" : (values[index] ?? "").trim();
  };
}

/** `""` and `undefined` both mean "absent" for an optional text column. */
export const text = (value: string): string | null => (value === "" ? null : value);

/** Optional integer column. Non-numeric text becomes null rather than NaN. */
export const int = (value: string): number | null => {
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
