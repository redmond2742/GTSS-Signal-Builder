import { sanitizeCSVField } from "../csv-utils";
import {
  CORRIDOR_COLUMNS,
  CORRIDOR_SIGNAL_COLUMNS,
  PATTERN_COLUMNS,
  PATTERN_SIGNAL_COLUMNS,
  PHASE_SEQUENCE_COLUMNS,
  SCHEDULE_COLUMNS,
  SPLIT_COLUMNS,
} from "./columns";
import type {
  Corridor,
  CorridorSignal,
  Pattern,
  PatternSignal,
  PhaseSequenceEntry,
  ScheduleEntry,
  Split,
} from "./rows";

type Cell = string | number | boolean | null | undefined;

/**
 * Shared generator. The header comes from the same column array the parser
 * reads by name, and `toCells` must return values in that order — so the two
 * sides of the round-trip are pinned to one declaration.
 *
 * Matches the existing generators' conventions: header-only output for an empty
 * collection gets a trailing newline, non-empty output does not.
 */
function generate<C extends readonly string[], T>(
  columns: C,
  rows: readonly T[],
  toCells: (row: T) => readonly Cell[],
): string {
  const header = columns.join(",");
  if (rows.length === 0) return header + "\n";
  const body = rows.map((row) => toCells(row).map(sanitizeCSVField).join(","));
  return [header, ...body].join("\n");
}

export const generateCorridorsCSV = (rows: readonly Corridor[]): string =>
  generate(CORRIDOR_COLUMNS, rows, (r) => [
    r.corridorId,
    r.name,
    r.description,
    r.primaryDirection,
    r.referenceClock,
    r.timezone,
  ]);

export const generateCorridorSignalsCSV = (rows: readonly CorridorSignal[]): string =>
  generate(CORRIDOR_SIGNAL_COLUMNS, rows, (r) => [
    r.corridorId,
    r.sequence,
    r.signalId,
    r.direction,
  ]);

export const generatePatternsCSV = (rows: readonly Pattern[]): string =>
  generate(PATTERN_COLUMNS, rows, (r) => [
    r.patternId,
    r.patternNumber,
    r.corridorId,
    r.cycleLengthS,
    r.referencePoint,
    r.description,
  ]);

export const generatePatternSignalsCSV = (rows: readonly PatternSignal[]): string =>
  generate(PATTERN_SIGNAL_COLUMNS, rows, (r) => [
    r.patternId,
    r.signalId,
    r.offsetS,
    r.coordinatedPhase,
    r.referencePoint,
    r.notes,
  ]);

export const generateSplitsCSV = (rows: readonly Split[]): string =>
  generate(SPLIT_COLUMNS, rows, (r) => [r.patternId, r.signalId, r.phaseId, r.splitS]);

export const generateScheduleCSV = (rows: readonly ScheduleEntry[]): string =>
  generate(SCHEDULE_COLUMNS, rows, (r) => [
    r.scheduleId,
    r.corridorId,
    r.dayType,
    r.startTime,
    r.endTime,
    r.patternId,
    r.priority,
  ]);

export const generatePhaseSequenceCSV = (rows: readonly PhaseSequenceEntry[]): string => {
  // The progression column is GTSS Builder's own; leave it off when nothing uses
  // it, so the file is exactly the six columns the converter writes.
  const used = rows.some((r) => (r.progression ?? "").trim() !== "");
  const columns = used ? PHASE_SEQUENCE_COLUMNS : PHASE_SEQUENCE_COLUMNS.slice(0, -1);
  return generate(columns, rows, (r) => [
    r.signalId,
    r.sequenceId,
    r.ring,
    r.position,
    r.phaseId,
    r.barrierId,
    ...(used ? [r.progression] : []),
  ]);
};
