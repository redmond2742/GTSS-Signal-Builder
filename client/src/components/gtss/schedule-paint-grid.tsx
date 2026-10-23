import { Button } from "@/components/ui/button";
import {
  describeDay,
  emptySlots,
  SLOT_MINUTES,
  SLOTS_PER_DAY,
  type DaySlots,
} from "@/lib/schedule-slots";
import { formatClock, WEEKLY_DAY_TYPES } from "gtss";
import { useEffect, useRef, useState, type PointerEvent } from "react";

const DAY_LABEL: Record<(typeof WEEKLY_DAY_TYPES)[number], string> = {
  WEEKDAY: "Mon–Fri",
  SATURDAY: "Sat",
  SUNDAY: "Sun",
};

const ROW_PX = 6;

/** Hours [from, to) painted on the given days. */
const paint = (
  slots: DaySlots,
  days: readonly (typeof WEEKLY_DAY_TYPES)[number][],
  ranges: readonly [number, number][],
  on = true,
): DaySlots => {
  const next = { ...slots };
  for (const day of days) {
    next[day] = slots[day].map((v, i) =>
      ranges.some(([a, b]) => i * SLOT_MINUTES >= a * 60 && i * SLOT_MINUTES < b * 60) ? on : v,
    );
  }
  return next;
};

const PRESETS: { label: string; title: string; apply: (s: DaySlots) => DaySlots }[] = [
  {
    label: "AM peak",
    title: "Weekdays 06:00–09:00",
    apply: (s) => paint(s, ["WEEKDAY"], [[6, 9]]),
  },
  {
    label: "Midday",
    title: "Weekdays 11:00–13:30",
    apply: (s) => paint(s, ["WEEKDAY"], [[11, 13.5]]),
  },
  {
    label: "PM peak",
    title: "Weekdays 15:00–19:00",
    apply: (s) => paint(s, ["WEEKDAY"], [[15, 19]]),
  },
  {
    label: "Weekend day",
    title: "Saturday and Sunday 10:00–18:00",
    apply: (s) => paint(s, ["SATURDAY", "SUNDAY"], [[10, 18]]),
  },
  {
    label: "Every day 6–22",
    title: "Every day 06:00–22:00",
    apply: (s) => paint(s, WEEKLY_DAY_TYPES, [[6, 22]]),
  },
];

interface SchedulePaintGridProps {
  slots: DaySlots;
  onChange: (slots: DaySlots) => void;
  /** What the unpainted time runs, for the legend: "free" or "nothing". */
  restLabel: string;
}

/**
 * A week painted in half hours: hours run down, day types across, like the
 * Schedule calendar. Press and drag to paint; starting on a painted slot erases.
 */
export default function SchedulePaintGrid({ slots, onChange, restLabel }: SchedulePaintGridProps) {
  // While dragging: painting or erasing (decided by the first slot), and the
  // last slot reached.
  const [stroke, setStroke] = useState<{
    on: boolean;
    day: (typeof WEEKLY_DAY_TYPES)[number];
    index: number;
  } | null>(null);
  const latest = useRef(slots);
  latest.current = slots;

  // Listen for the release only while a stroke is under way.
  const stroking = stroke !== null;
  useEffect(() => {
    if (!stroking) return;
    const end = () => setStroke(null);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [stroking]);

  /** Set slots `from` to `to` (either order) of one day. */
  const set = (day: (typeof WEEKLY_DAY_TYPES)[number], from: number, to: number, on: boolean) => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const current = latest.current[day];
    if (current.every((v, j) => j < lo || j > hi || v === on)) return;
    const next = { ...latest.current, [day]: current.map((v, j) => (j >= lo && j <= hi ? on : v)) };
    latest.current = next;
    onChange(next);
  };

  const enter = (day: (typeof WEEKLY_DAY_TYPES)[number], i: number) => {
    if (!stroke) return;
    // Same day: fill from the last slot reached, so a fast drag that skips cells
    // leaves no gaps. Another day: start afresh there.
    set(day, stroke.day === day ? stroke.index : i, i, stroke.on);
    setStroke({ ...stroke, day, index: i });
  };

  const down = (e: PointerEvent, day: (typeof WEEKLY_DAY_TYPES)[number], i: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // Let the pointer move over other cells instead of staying captured by this one.
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const on = !slots[day][i];
    setStroke({ on, day, index: i });
    set(day, i, i, on);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            type="button"
            variant="outline"
            title={p.title}
            onClick={() => onChange(p.apply(slots))}
            className="h-6 px-2 text-[11px]"
          >
            {p.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange(emptySlots())}
          className="h-6 px-2 text-[11px] text-grey-500"
        >
          Clear
        </Button>
      </div>
      <div className="flex select-none gap-1" role="group" aria-label="When the pattern runs">
        {/* Hour labels */}
        <div className="relative w-9 shrink-0" style={{ height: SLOTS_PER_DAY * ROW_PX + 16 }}>
          {Array.from({ length: 9 }, (_, k) => k * 3).map((h) => (
            <span
              key={h}
              className="absolute right-1 text-[9px] tabular-nums text-grey-400"
              style={{ top: 16 + h * 2 * ROW_PX - 5 }}
            >
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {WEEKLY_DAY_TYPES.map((day) => (
          <div key={day} className="w-16">
            <div className="h-4 text-center text-[10px] font-medium text-grey-600">
              {DAY_LABEL[day]}
            </div>
            <div
              className="overflow-hidden rounded border border-grey-300"
              style={{ touchAction: "none" }}
              title={`${DAY_LABEL[day]}: ${describeDay(slots[day])}`}
            >
              {slots[day].map((on, i) => (
                <div
                  key={i}
                  data-slot={`${day}-${i}`}
                  aria-label={`${DAY_LABEL[day]} ${formatClock(i * SLOT_MINUTES)}`}
                  onPointerDown={(e) => down(e, day, i)}
                  onPointerEnter={() => enter(day, i)}
                  className={`cursor-crosshair ${on ? "bg-blue-500" : i % 2 === 0 ? "bg-white" : "bg-grey-50"} ${
                    i % 6 === 5 ? "border-b border-grey-200" : ""
                  }`}
                  style={{ height: ROW_PX }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-grey-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" /> pattern
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-grey-300 bg-white" />{" "}
          {restLabel}
        </span>
        <span>Drag to paint; start on blue to erase.</span>
      </div>
    </div>
  );
}
