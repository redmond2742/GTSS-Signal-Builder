/**
 * Undo and redo for offset edits.
 *
 * Offsets get tuned by feel: nudge, look at the diagram, nudge again, and often
 * overshoot. Undo has to be one tap away and has to cover every way of changing
 * an offset, or "undo" means different things depending on how you made the edit.
 *
 * Pure and immutable, so it is testable without React and cannot be corrupted by
 * a stale closure: every function takes a history and returns a new one.
 */

export interface OffsetEdit {
  patternId: string;
  signalId: string;
  /** The offset before the edit. Null if the field was blank. */
  from: number | null;
  /** The offset after the edit. */
  to: number | null;
  /** Milliseconds since the epoch, supplied by the caller. */
  at: number;
}

export interface OffsetHistory {
  /** Oldest first. The last entry is what undo reverts. */
  past: readonly OffsetEdit[];
  /** Most recently undone first. The first entry is what redo reapplies. */
  future: readonly OffsetEdit[];
}

export const emptyOffsetHistory: OffsetHistory = { past: [], future: [] };

/** Never keep more than this many steps. */
export const MAX_OFFSET_HISTORY = 100;

/** Edits to one signal's offset this close together count as one step. */
export const OFFSET_COALESCE_MS = 1000;

/**
 * Record an edit.
 *
 * With `coalesceMs`, an edit to the same signal in the same pattern within that
 * window of the previous one is merged into it — it keeps the ORIGINAL `from`, so
 * one undo reverts the whole run of clicks. If the run ends where it began, the
 * step disappears: there is nothing to undo.
 *
 * Any new edit discards the redo stack, as in every editor.
 */
export function recordOffsetEdit(
  history: OffsetHistory,
  edit: OffsetEdit,
  coalesceMs = 0,
): OffsetHistory {
  if (edit.from === edit.to) return history;

  const last = history.past[history.past.length - 1];
  if (
    coalesceMs > 0 &&
    last &&
    last.patternId === edit.patternId &&
    last.signalId === edit.signalId &&
    edit.at - last.at <= coalesceMs
  ) {
    const rest = history.past.slice(0, -1);
    // Back where the run started: no net change, so no step.
    if (last.from === edit.to) return { past: rest, future: [] };
    return { past: [...rest, { ...last, to: edit.to, at: edit.at }], future: [] };
  }

  const past = [...history.past, edit].slice(-MAX_OFFSET_HISTORY);
  return { past, future: [] };
}

export interface HistoryStep {
  history: OffsetHistory;
  /** The edit that was stepped over, or null if there was nothing to do. */
  edit: OffsetEdit | null;
}

/** Step back. The caller applies `edit.from`. */
export function undoOffsetEdit(history: OffsetHistory): HistoryStep {
  const edit = history.past[history.past.length - 1];
  if (!edit) return { history, edit: null };
  return {
    history: { past: history.past.slice(0, -1), future: [edit, ...history.future] },
    edit,
  };
}

/** Step forward. The caller applies `edit.to`. */
export function redoOffsetEdit(history: OffsetHistory): HistoryStep {
  const edit = history.future[0];
  if (!edit) return { history, edit: null };
  return {
    history: { past: [...history.past, edit], future: history.future.slice(1) },
    edit,
  };
}
