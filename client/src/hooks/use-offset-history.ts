import {
  emptyOffsetHistory,
  OFFSET_COALESCE_MS,
  recordOffsetEdit,
  redoOffsetEdit,
  undoOffsetEdit,
  type OffsetEdit,
  type OffsetHistory,
} from "gtss";
import { useCallback, useRef, useState } from "react";

/** What the status line says happened last. */
export interface HistoryNote {
  kind: "change" | "undo" | "redo";
  edit: OffsetEdit;
}

/**
 * Undo/redo for offset edits, over the pure history in the gtss package.
 *
 * `apply` writes an offset (or null for blank) for a signal in a pattern; undo
 * and redo call it with the value to restore. Everything that changes an offset
 * records through `record`, so undo means the same thing whether the edit was a
 * drag, a nudge, the number box or the table.
 *
 * The history is also kept in a ref. Two edits in one tick — a fast double click —
 * would otherwise each be recorded against the same stale state and the second
 * would overwrite the first.
 */
export function useOffsetHistory(
  apply: (patternId: string, signalId: string, offsetS: number | null) => void,
) {
  const [history, setHistory] = useState<OffsetHistory>(emptyOffsetHistory);
  const [note, setNote] = useState<HistoryNote | null>(null);
  const latest = useRef(history);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const commit = useCallback((next: OffsetHistory) => {
    latest.current = next;
    setHistory(next);
  }, []);

  const record = useCallback(
    (edit: Omit<OffsetEdit, "at">, options: { coalesce?: boolean } = {}) => {
      const full: OffsetEdit = { ...edit, at: Date.now() };
      commit(recordOffsetEdit(latest.current, full, options.coalesce ? OFFSET_COALESCE_MS : 0));
      setNote({ kind: "change", edit: full });
    },
    [commit],
  );

  const undo = useCallback((): OffsetEdit | null => {
    const step = undoOffsetEdit(latest.current);
    if (!step.edit) return null;
    applyRef.current(step.edit.patternId, step.edit.signalId, step.edit.from);
    commit(step.history);
    setNote({ kind: "undo", edit: step.edit });
    return step.edit;
  }, [commit]);

  const redo = useCallback((): OffsetEdit | null => {
    const step = redoOffsetEdit(latest.current);
    if (!step.edit) return null;
    applyRef.current(step.edit.patternId, step.edit.signalId, step.edit.to);
    commit(step.history);
    setNote({ kind: "redo", edit: step.edit });
    return step.edit;
  }, [commit]);

  return {
    history,
    note,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    /** The edit an undo would revert, for labelling the button. */
    nextUndo: history.past[history.past.length - 1] ?? null,
    nextRedo: history.future[0] ?? null,
    record,
    undo,
    redo,
  };
}
