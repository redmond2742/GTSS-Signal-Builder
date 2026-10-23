import { describe, expect, it } from "vitest";
import {
  emptyOffsetHistory,
  MAX_OFFSET_HISTORY,
  recordOffsetEdit,
  redoOffsetEdit,
  undoOffsetEdit,
  type OffsetEdit,
  type OffsetHistory,
} from "../src/localStorage/coordination/offsetHistory";

const edit = (
  signalId: string,
  from: number | null,
  to: number | null,
  at = 0,
  patternId = "P1",
): OffsetEdit => ({ patternId, signalId, from, to, at });

const record = (h: OffsetHistory, ...edits: OffsetEdit[]) =>
  edits.reduce((acc, e) => recordOffsetEdit(acc, e), h);

describe("recording", () => {
  it("adds an edit to the past", () => {
    const h = record(emptyOffsetHistory, edit("A", 10, 20));
    expect(h.past).toEqual([edit("A", 10, 20)]);
    expect(h.future).toEqual([]);
  });

  it("ignores an edit that changes nothing", () => {
    expect(recordOffsetEdit(emptyOffsetHistory, edit("A", 10, 10))).toBe(emptyOffsetHistory);
  });

  it("never mutates what it was given", () => {
    const before = record(emptyOffsetHistory, edit("A", 1, 2));
    const snapshot = JSON.stringify(before);
    recordOffsetEdit(before, edit("B", 3, 4));
    undoOffsetEdit(before);
    redoOffsetEdit(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("keeps only the most recent steps", () => {
    let h = emptyOffsetHistory;
    for (let i = 0; i < MAX_OFFSET_HISTORY + 25; i++) h = record(h, edit("A", i, i + 1, i));
    expect(h.past).toHaveLength(MAX_OFFSET_HISTORY);
    expect(h.past[h.past.length - 1].to).toBe(MAX_OFFSET_HISTORY + 25);
    expect(h.past[0].from).toBe(25); // the oldest were dropped, not the newest
  });
});

describe("undo and redo", () => {
  it("steps back and forward through edits in order", () => {
    let h = record(emptyOffsetHistory, edit("A", 10, 20), edit("B", 5, 9));

    const u1 = undoOffsetEdit(h);
    expect(u1.edit).toEqual(edit("B", 5, 9));
    const u2 = undoOffsetEdit(u1.history);
    expect(u2.edit).toEqual(edit("A", 10, 20));
    expect(u2.history.past).toEqual([]);

    const r1 = redoOffsetEdit(u2.history);
    expect(r1.edit).toEqual(edit("A", 10, 20));
    const r2 = redoOffsetEdit(r1.history);
    expect(r2.edit).toEqual(edit("B", 5, 9));
    expect(r2.history.future).toEqual([]);
    h = r2.history;
    expect(h.past).toHaveLength(2);
  });

  it("does nothing when there is nothing to step over", () => {
    expect(undoOffsetEdit(emptyOffsetHistory)).toEqual({ history: emptyOffsetHistory, edit: null });
    expect(redoOffsetEdit(emptyOffsetHistory)).toEqual({ history: emptyOffsetHistory, edit: null });
  });

  it("discards redo as soon as a new edit is made", () => {
    const afterUndo = undoOffsetEdit(record(emptyOffsetHistory, edit("A", 1, 2))).history;
    expect(afterUndo.future).toHaveLength(1);
    expect(recordOffsetEdit(afterUndo, edit("A", 1, 3)).future).toEqual([]);
  });

  it("carries a blank offset through undo and redo", () => {
    const h = record(emptyOffsetHistory, edit("A", null, 30));
    expect(undoOffsetEdit(h).edit?.from).toBeNull();
    const u = undoOffsetEdit(h);
    expect(redoOffsetEdit(u.history).edit?.to).toBe(30);
  });
});

describe("coalescing a run of nudges", () => {
  const run = (h: OffsetHistory, e: OffsetEdit) => recordOffsetEdit(h, e, 1000);

  it("merges quick edits to one signal into one step that undoes to the start", () => {
    let h = run(emptyOffsetHistory, edit("A", 21, 22, 0));
    h = run(h, edit("A", 22, 23, 200));
    h = run(h, edit("A", 23, 24, 400));
    expect(h.past).toHaveLength(1);
    expect(h.past[0]).toMatchObject({ from: 21, to: 24 });
    expect(undoOffsetEdit(h).edit?.from).toBe(21);
  });

  it("starts a new step after a pause", () => {
    let h = run(emptyOffsetHistory, edit("A", 21, 22, 0));
    h = run(h, edit("A", 22, 23, 5000));
    expect(h.past).toHaveLength(2);
  });

  it("keeps different signals, and different patterns, as separate steps", () => {
    let h = run(emptyOffsetHistory, edit("A", 1, 2, 0));
    h = run(h, edit("B", 1, 2, 100));
    h = run(h, edit("A", 2, 3, 200, "P2"));
    expect(h.past).toHaveLength(3);
  });

  it("drops the step if the run ends where it began", () => {
    let h = run(emptyOffsetHistory, edit("A", 21, 31, 0));
    h = run(h, edit("A", 31, 21, 300));
    expect(h.past).toEqual([]);
  });

  it("does not coalesce unless asked to", () => {
    const h = record(emptyOffsetHistory, edit("A", 1, 2, 0), edit("A", 2, 3, 10));
    expect(h.past).toHaveLength(2);
  });

  it("clears redo when it merges", () => {
    const u = undoOffsetEdit(record(emptyOffsetHistory, edit("A", 1, 2, 0), edit("B", 1, 2, 10)));
    const h = run(u.history, edit("A", 2, 3, 50));
    expect(h.future).toEqual([]);
  });
});
