import { DAY_MINUTES } from "./schedule";
import type { ScheduleEntry } from "./rows";

/**
 * Turning a painted calendar into Schedule.txt rows.
 *
 * The calendar is a grid of day types by time slots; a painted slot means "run
 * the pattern then". Runs of painted slots become schedule entries for the
 * pattern, and — if asked — the time between them becomes entries for a free
 * pattern, so every day type accounts for all 24 hours (which validation checks).
 */

/** The weekly day types a manual build schedules. */
export const WEEKLY_DAY_TYPES = ["WEEKDAY", "SATURDAY", "SUNDAY"] as const;

export interface TimeBlock {
  dayType: string;
  /** Minutes since midnight, start inclusive. */
  startMin: number;
  /** Minutes since midnight, end exclusive; 1440 is midnight at the end of the day. */
  endMin: number;
}

/** Runs of `true` slots as blocks. Slot i covers [i*slotMin, (i+1)*slotMin). */
export function blocksFromSlots(
  dayType: string,
  slots: readonly boolean[],
  slotMinutes: number,
): TimeBlock[] {
  const out: TimeBlock[] = [];
  let start: number | null = null;
  slots.forEach((on, i) => {
    if (on && start === null) start = i;
    if (!on && start !== null) {
      out.push({ dayType, startMin: start * slotMinutes, endMin: i * slotMinutes });
      start = null;
    }
  });
  if (start !== null) {
    out.push({
      dayType,
      startMin: start * slotMinutes,
      endMin: Math.min(slots.length * slotMinutes, DAY_MINUTES),
    });
  }
  return out;
}

/** Merge overlapping or touching blocks per day type; drop empty ones; sort. */
export function normaliseBlocks(blocks: readonly TimeBlock[]): TimeBlock[] {
  const byDay = new Map<string, TimeBlock[]>();
  for (const b of blocks) {
    const start = Math.max(0, Math.min(DAY_MINUTES, b.startMin));
    const end = Math.max(0, Math.min(DAY_MINUTES, b.endMin));
    if (end <= start) continue;
    byDay.set(b.dayType, [
      ...(byDay.get(b.dayType) ?? []),
      { dayType: b.dayType, startMin: start, endMin: end },
    ]);
  }
  const out: TimeBlock[] = [];
  for (const list of Array.from(byDay.values())) {
    list.sort((a, b) => a.startMin - b.startMin);
    let current: TimeBlock | null = null;
    for (const b of list) {
      if (current && b.startMin <= current.endMin) {
        current.endMin = Math.max(current.endMin, b.endMin);
      } else {
        if (current) out.push(current);
        current = { ...b };
      }
    }
    if (current) out.push(current);
  }
  return out;
}

/** "07:30:00"; 1440 minutes is "24:00:00", how the files write end of day. */
export function clockText(minutes: number): string {
  const total = Math.round(minutes * 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export interface ScheduleRowsInput {
  idPrefix: string;
  coordinationId: string;
  patternId: string;
  /** Fill the rest of each weekly day type with this pattern. Null leaves it unscheduled. */
  freePatternId: string | null;
  blocks: readonly TimeBlock[];
  priority?: number;
}

/**
 * Schedule rows for one pattern's blocks, and the free pattern around them. With
 * a free pattern, every weekly day type covers all 24 hours, including any day
 * type with no blocks at all.
 */
export function scheduleRowsFor(input: ScheduleRowsInput): ScheduleEntry[] {
  const priority = input.priority ?? 10;
  const blocks = normaliseBlocks(input.blocks);
  const rows: ScheduleEntry[] = [];
  const add = (dayType: string, startMin: number, endMin: number, patternId: string) =>
    rows.push({
      scheduleId: `${input.idPrefix}-S${String(rows.length + 1).padStart(2, "0")}`,
      coordinationId: input.coordinationId,
      dayType,
      startTime: clockText(startMin),
      endTime: clockText(endMin),
      patternId,
      priority,
    });

  const dayTypes = [
    ...WEEKLY_DAY_TYPES,
    ...Array.from(new Set(blocks.map((b) => b.dayType))).filter(
      (d) => !(WEEKLY_DAY_TYPES as readonly string[]).includes(d),
    ),
  ];
  for (const dayType of dayTypes) {
    let at = 0;
    for (const b of blocks.filter((x) => x.dayType === dayType)) {
      if (input.freePatternId && b.startMin > at) add(dayType, at, b.startMin, input.freePatternId);
      add(dayType, b.startMin, b.endMin, input.patternId);
      at = b.endMin;
    }
    if (input.freePatternId && at < DAY_MINUTES) add(dayType, at, DAY_MINUTES, input.freePatternId);
  }
  return rows;
}
