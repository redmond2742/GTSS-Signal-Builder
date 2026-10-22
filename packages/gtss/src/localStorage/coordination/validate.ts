import type { CoordinationRows } from "./rows";
import {
  describeDayType,
  effectiveSegments,
  expandEntry,
  formatClock,
  type ScheduleBlock,
} from "./schedule";
import { ringSplitTotals } from "./splitTotals";

export type CoordinationIssueLevel = "error" | "warning";

export interface CoordinationIssue {
  level: CoordinationIssueLevel;
  /** Which file the issue belongs to, for grouping in the UI. */
  scope: keyof CoordinationRows;
  /** Stable id so the UI can key a list without an index. */
  id: string;
  message: string;
}

const ERR = (scope: keyof CoordinationRows, id: string, message: string): CoordinationIssue => ({
  level: "error",
  scope,
  id,
  message,
});
const WARN = (scope: keyof CoordinationRows, id: string, message: string): CoordinationIssue => ({
  level: "warning",
  scope,
  id,
  message,
});

/**
 * Check imported coordination data for the things that actually go wrong in
 * converted timing sheets.
 *
 * The headline check is the split sum. A signal's green splits, summed per
 * ring, should equal its pattern's cycle length — and in real exports they
 * frequently don't, because the source split table was built at a different
 * native cycle. The reference intersection matches and every other signal is
 * off by a fixed amount, which is invisible in a flat table and obvious here.
 *
 * `signalIds` is the set of signals that exist in the main GTSS data, used to
 * flag coordination rows that reference a signal nobody has imported.
 */
export function validateCoordination(
  rows: CoordinationRows,
  signalIds: ReadonlySet<string> = new Set(),
): CoordinationIssue[] {
  const issues: CoordinationIssue[] = [];

  const patternById = new Map(rows.patterns.map((p) => [p.patternId, p]));
  const corridorIds = new Set(rows.corridors.map((c) => c.corridorId));
  const coordinationIds = new Set(rows.coordination.map((c) => c.coordinationId));

  // --- Referential integrity ---------------------------------------------

  for (const p of rows.patterns) {
    if (p.corridorId != null && !corridorIds.has(p.corridorId)) {
      issues.push(
        ERR(
          "patterns",
          `pattern-corridor-${p.patternId}`,
          `Pattern ${p.patternId} references corridor ${p.corridorId}, which is not in corridors.txt`,
        ),
      );
    }
  }

  for (const s of rows.schedule) {
    if (s.patternId != null && !patternById.has(s.patternId)) {
      issues.push(
        ERR(
          "schedule",
          `schedule-pattern-${s.scheduleId}`,
          `Schedule ${s.scheduleId} references pattern ${s.patternId}, which is not in Patterns.txt`,
        ),
      );
    }
    if (s.coordinationId != null && !coordinationIds.has(s.coordinationId)) {
      issues.push(
        ERR(
          "schedule",
          `schedule-coord-${s.scheduleId}`,
          `Schedule ${s.scheduleId} references coordination ${s.coordinationId}, which is not in Coordination.txt`,
        ),
      );
    }
  }

  // Signals referenced by coordination but absent from the signal list. Only
  // meaningful once signals have been imported, hence the empty-set guard.
  if (signalIds.size > 0) {
    const missing = new Set<string>();
    const collect = (id: string) => {
      if (!signalIds.has(id)) missing.add(id);
    };
    // Every file that names a signal. Splits and PhaseSequence matter as much as
    // the others: their signal ids are editable, and a mistyped one there would
    // otherwise pass unremarked.
    rows.corridorSignals.forEach((r) => collect(r.signalId));
    rows.patternSignals.forEach((r) => collect(r.signalId));
    rows.splits.forEach((r) => collect(r.signalId));
    rows.phaseSequence.forEach((r) => collect(r.signalId));
    for (const id of Array.from(missing).sort()) {
      issues.push(
        WARN(
          "corridorSignals",
          `unknown-signal-${id}`,
          `Signal ${id} is used by coordination but has no row in signals.txt`,
        ),
      );
    }
  }

  // --- Corridor ordering --------------------------------------------------

  const bySeq = new Map<string, number[]>();
  for (const cs of rows.corridorSignals) {
    if (cs.sequence == null) continue;
    const list = bySeq.get(cs.corridorId) ?? [];
    list.push(cs.sequence);
    bySeq.set(cs.corridorId, list);
  }
  for (const [corridorId, seqs] of Array.from(bySeq)) {
    const sorted = [...seqs].sort((a, b) => a - b);
    const dupes = sorted.filter((v, i) => i > 0 && v === sorted[i - 1]);
    if (dupes.length > 0) {
      issues.push(
        ERR(
          "corridorSignals",
          `corridor-dupe-seq-${corridorId}`,
          `Corridor ${corridorId} has duplicate sequence numbers (${Array.from(new Set(dupes)).join(", ")})`,
        ),
      );
    }
    const gaps = sorted.filter((v, i) => i > 0 && v !== sorted[i - 1] && v !== sorted[i - 1] + 1);
    if (gaps.length > 0) {
      issues.push(
        WARN(
          "corridorSignals",
          `corridor-gap-seq-${corridorId}`,
          `Corridor ${corridorId} sequence numbers are not contiguous (gap before ${gaps.join(", ")})`,
        ),
      );
    }
  }

  // --- Offsets within the cycle ------------------------------------------

  for (const ps of rows.patternSignals) {
    const pattern = patternById.get(ps.patternId);
    if (!pattern) {
      issues.push(
        ERR(
          "patternSignals",
          `ps-pattern-${ps.patternId}-${ps.signalId}`,
          `PatternSignals references pattern ${ps.patternId}, which is not in Patterns.txt`,
        ),
      );
      continue;
    }
    const cycle = pattern.cycleLengthS ?? 0;
    if (cycle > 0 && ps.offsetS != null && ps.offsetS >= cycle) {
      issues.push(
        WARN(
          "patternSignals",
          `offset-${ps.patternId}-${ps.signalId}`,
          `${ps.signalId} offset ${ps.offsetS}s is not less than pattern ${ps.patternId}'s ${cycle}s cycle`,
        ),
      );
    }
  }

  // --- Split sums vs cycle (the headline check) --------------------------

  const { totals: ringTotals, unringed } = ringSplitTotals(rows.phaseSequence, rows.splits);

  for (const ref of Array.from(unringed).sort()) {
    const [signalId, phaseId] = ref.split("|");
    issues.push(
      WARN(
        "splits",
        `split-no-ring-${ref}`,
        `Split for ${signalId} phase ${phaseId} has no matching row in PhaseSequence.txt, so its ring is unknown`,
      ),
    );
  }

  for (const [key, total] of Array.from(ringTotals).sort()) {
    const [patternId, signalId, ring] = key.split("|");
    const cycle = patternById.get(patternId)?.cycleLengthS ?? 0;
    if (cycle <= 0 || total === cycle) continue;
    issues.push(
      WARN(
        "splits",
        `split-sum-${key}`,
        `${signalId} ring ${ring} splits total ${total}s but pattern ${patternId} runs a ${cycle}s cycle`,
      ),
    );
  }

  // --- Schedule coverage -------------------------------------------------

  // Each day type should account for all 24 hours exactly once. Overlap across
  // different priorities is legitimate (that is how SPECIAL_* overrides the
  // weekly schedule), so only same-priority overlap is a conflict.
  const dayGroups = new Map<string, { label: string; blocks: ScheduleBlock[] }>();
  for (const entry of rows.schedule) {
    const expanded = expandEntry(entry);
    if (expanded.problem === "unparseable") {
      issues.push(
        ERR(
          "schedule",
          `schedule-time-${entry.scheduleId}`,
          `Schedule ${entry.scheduleId} has a start or end time that isn't HH:MM[:SS] (${entry.startTime ?? "blank"} to ${entry.endTime ?? "blank"})`,
        ),
      );
    } else if (expanded.problem === "empty") {
      issues.push(
        WARN(
          "schedule",
          `schedule-empty-${entry.scheduleId}`,
          `Schedule ${entry.scheduleId} starts and ends at ${entry.startTime}, so it covers no time`,
        ),
      );
    }
    const day = describeDayType(entry.dayType);
    const key = `${entry.coordinationId ?? ""}|${day.dayType}`;
    const group = dayGroups.get(key) ?? { label: day.dayType || day.label, blocks: [] };
    group.blocks.push(...expanded.blocks);
    dayGroups.set(key, group);
  }

  for (const [key, { label, blocks }] of Array.from(dayGroups)) {
    if (blocks.length === 0) continue; // every entry was unreadable; already reported
    for (const seg of effectiveSegments(blocks)) {
      const span = `${formatClock(seg.startMin)} to ${formatClock(seg.endMin)}`;
      if (seg.block === null) {
        issues.push(
          WARN(
            "schedule",
            `schedule-gap-${key}-${seg.startMin}`,
            `Schedule ${label} has no pattern from ${span}`,
          ),
        );
      } else if (seg.conflicts.length > 0) {
        const ids = [seg.block, ...seg.conflicts].map((b) => b.scheduleId);
        issues.push(
          WARN(
            "schedule",
            `schedule-overlap-${key}-${seg.startMin}`,
            `Schedule ${label}: ${ids.join(" and ")} overlap from ${span} at priority ${seg.block.priority}`,
          ),
        );
      }
    }
  }

  return issues;
}

/** Counts for a one-line summary above the detail list. */
export const summarizeIssues = (issues: readonly CoordinationIssue[]) => ({
  errors: issues.filter((i) => i.level === "error").length,
  warnings: issues.filter((i) => i.level === "warning").length,
});
