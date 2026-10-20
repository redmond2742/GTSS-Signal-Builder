import { parseCSVLine } from "../csv-utils";
import {
  COORDINATION_COLUMNS,
  CORRIDOR_COLUMNS,
  CORRIDOR_SIGNAL_COLUMNS,
  fieldReader,
  int,
  PATTERN_COLUMNS,
  PATTERN_SIGNAL_COLUMNS,
  PHASE_SEQUENCE_COLUMNS,
  SCHEDULE_COLUMNS,
  SPLIT_COLUMNS,
  text,
} from "./columns";
import type {
  CoordinationPlan,
  Corridor,
  CorridorSignal,
  Pattern,
  PatternSignal,
  PhaseSequenceEntry,
  ScheduleEntry,
  Split,
} from "./rows";

/**
 * Shared skeleton for all 8 parsers.
 *
 * Fields are read by NAME against the column array rather than by positional
 * index, so generator and parser cannot drift. Rows that are missing a required
 * key are collected as errors and reported together, matching the existing
 * parsers' behaviour of throwing one message listing every bad row.
 */
function parseRows<C extends readonly string[], T>(
  content: string,
  columns: C,
  label: string,
  build: (col: (name: C[number]) => string, rowNumber: number) => T | string,
): T[] {
  const lines = content
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length === 0) return [];

  const rows: T[] = [];
  const errors: string[] = [];

  // Line 0 is the header. It is not used for mapping — the column array is the
  // contract — but it is skipped so a headerless file fails loudly rather than
  // silently losing its first row.
  for (let i = 1; i < lines.length; i++) {
    const col = fieldReader(columns, parseCSVLine(lines[i]));
    const built = build(col, i + 1);
    if (typeof built === "string") errors.push(built);
    else rows.push(built);
  }

  if (errors.length > 0) {
    throw new Error(`${label} validation errors:\n${errors.join("\n")}`);
  }
  if (rows.length === 0 && lines.length > 1) {
    throw new Error(`No valid ${label.toLowerCase()} found in file`);
  }
  return rows;
}

const required = (value: string, field: string, row: number): string | null =>
  value === "" ? `Row ${row}: ${field} is required` : null;

export const parseCorridorsTXT = (content: string): Corridor[] =>
  parseRows(content, CORRIDOR_COLUMNS, "Corridors", (col, row) => {
    const corridorId = col("corridor_id");
    return (
      required(corridorId, "corridor_id", row) ?? {
        corridorId,
        name: text(col("name")),
        description: text(col("description")),
        primaryDirection: text(col("primary_direction")),
      }
    );
  });

export const parseCorridorSignalsTXT = (content: string): CorridorSignal[] =>
  parseRows(content, CORRIDOR_SIGNAL_COLUMNS, "Corridor signals", (col, row) => {
    const corridorId = col("corridor_id");
    const signalId = col("signal_id");
    return (
      required(corridorId, "corridor_id", row) ??
      required(signalId, "signal_id", row) ?? {
        corridorId,
        sequence: int(col("sequence")),
        signalId,
        direction: text(col("direction")),
      }
    );
  });

export const parseCoordinationTXT = (content: string): CoordinationPlan[] =>
  parseRows(content, COORDINATION_COLUMNS, "Coordination", (col, row) => {
    const coordinationId = col("coordination_id");
    return (
      required(coordinationId, "coordination_id", row) ?? {
        coordinationId,
        name: text(col("name")),
        referenceClock: text(col("reference_clock")),
        timezone: text(col("timezone")),
        description: text(col("description")),
      }
    );
  });

export const parsePatternsTXT = (content: string): Pattern[] =>
  parseRows(content, PATTERN_COLUMNS, "Patterns", (col, row) => {
    const patternId = col("pattern_id");
    return (
      required(patternId, "pattern_id", row) ?? {
        patternId,
        patternNumber: int(col("pattern_number")),
        corridorId: text(col("corridor_id")),
        cycleLengthS: int(col("cycle_length_s")),
        referencePoint: text(col("reference_point")),
        description: text(col("description")),
      }
    );
  });

export const parsePatternSignalsTXT = (content: string): PatternSignal[] =>
  parseRows(content, PATTERN_SIGNAL_COLUMNS, "Pattern signals", (col, row) => {
    const patternId = col("pattern_id");
    const signalId = col("signal_id");
    return (
      required(patternId, "pattern_id", row) ??
      required(signalId, "signal_id", row) ?? {
        patternId,
        signalId,
        offsetS: int(col("offset_s")),
        // Blank is meaningful: this signal runs free in this pattern.
        coordinatedPhase: int(col("coordinated_phase")),
        referencePoint: text(col("reference_point")),
        notes: text(col("notes")),
      }
    );
  });

export const parseSplitsTXT = (content: string): Split[] =>
  parseRows(content, SPLIT_COLUMNS, "Splits", (col, row) => {
    const patternId = col("pattern_id");
    const signalId = col("signal_id");
    return (
      required(patternId, "pattern_id", row) ??
      required(signalId, "signal_id", row) ?? {
        patternId,
        signalId,
        phaseId: int(col("phase_id")),
        splitS: int(col("split_s")),
      }
    );
  });

export const parseScheduleTXT = (content: string): ScheduleEntry[] =>
  parseRows(content, SCHEDULE_COLUMNS, "Schedule", (col, row) => {
    const scheduleId = col("schedule_id");
    return (
      required(scheduleId, "schedule_id", row) ?? {
        scheduleId,
        coordinationId: text(col("coordination_id")),
        dayType: text(col("day_type")),
        startTime: text(col("start_time")),
        endTime: text(col("end_time")),
        patternId: text(col("pattern_id")),
        priority: int(col("priority")),
      }
    );
  });

export const parsePhaseSequenceTXT = (content: string): PhaseSequenceEntry[] =>
  parseRows(content, PHASE_SEQUENCE_COLUMNS, "Phase sequence", (col, row) => {
    const signalId = col("signal_id");
    const sequenceId = col("sequence_id");
    return (
      required(signalId, "signal_id", row) ??
      required(sequenceId, "sequence_id", row) ?? {
        signalId,
        sequenceId,
        ring: int(col("ring")),
        position: int(col("position")),
        phaseId: int(col("phase_id")),
        barrierId: text(col("barrier_id")),
      }
    );
  });
