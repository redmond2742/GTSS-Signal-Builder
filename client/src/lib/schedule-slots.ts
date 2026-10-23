import { blocksFromSlots, formatClock, WEEKLY_DAY_TYPES, type TimeBlock } from "gtss";

// A week as half-hour slots per weekly day type: what the paint grid edits and
// the corridor builder turns into Schedule.txt rows.

/** Half-hour slots: fine enough for peak periods, coarse enough to paint. */
export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;

export type DaySlots = Record<(typeof WEEKLY_DAY_TYPES)[number], boolean[]>;

export const emptySlots = (): DaySlots => ({
  WEEKDAY: Array(SLOTS_PER_DAY).fill(false),
  SATURDAY: Array(SLOTS_PER_DAY).fill(false),
  SUNDAY: Array(SLOTS_PER_DAY).fill(false),
});

/** Painted slots as time blocks, ready for the schedule builder. */
export const slotsToBlocks = (slots: DaySlots): TimeBlock[] =>
  WEEKLY_DAY_TYPES.flatMap((day) => blocksFromSlots(day, slots[day], SLOT_MINUTES));

/** "06:00–09:00, 15:00–19:00", or "not run". */
export const describeDay = (slots: readonly boolean[]) => {
  const blocks = blocksFromSlots("", slots, SLOT_MINUTES);
  return blocks.length === 0
    ? "not run"
    : blocks.map((b) => `${formatClock(b.startMin)}–${formatClock(b.endMin)}`).join(", ");
};
