import { describe, expect, it } from "vitest";
import { COORDINATION_ENTITIES } from "../src/localStorage/coordination/entities";
import {
  buildSequenceDiagrams,
  patternsUsingSequences,
  sequenceForPattern,
  sequenceFromNotes,
} from "../src/localStorage/coordination/phaseSequenceLayout";
import type { ParsedCoordination, PhaseSequenceEntry } from "../src/localStorage/coordination/rows";
import * as sample from "./fixtures/coordination-sample";

const sampleBag = (): Required<Pick<ParsedCoordination, "phaseSequence" | "patternSignals">> => {
  const bag: ParsedCoordination = {};
  for (const [key, text] of [
    ["phaseSequence", sample.phaseSequenceTxt],
    ["patternSignals", sample.patternSignalsTxt],
  ] as const) {
    COORDINATION_ENTITIES.find((e) => e.key === key)!.parseInto(text, bag);
  }
  return { phaseSequence: bag.phaseSequence ?? [], patternSignals: bag.patternSignals ?? [] };
};

const row = (
  ring: number | null,
  position: number | null,
  phaseId: number | null,
  barrierId: string | null,
  sequenceId = "S",
): PhaseSequenceEntry => ({ signalId: "X", sequenceId, ring, position, phaseId, barrierId });

/** "1,2|3,4" style: each ring's phases, bands separated by "|". */
const shape = (d: ReturnType<typeof buildSequenceDiagrams>[number]) =>
  d.rings.map(
    (r) => `R${r.ring} ` + r.groups.map((g) => g.map((c) => c.phaseId).join(",")).join(" | "),
  );

describe("ring-barrier layout, on the real sample", () => {
  const { phaseSequence } = sampleBag();

  it("gives a signal with two sequences two diagrams, in file order", () => {
    const diagrams = buildSequenceDiagrams(phaseSequence, "SIG-022");
    expect(diagrams.map((d) => d.sequenceId)).toEqual(["SEQ-01", "SEQ-11"]);
  });

  it("lays out SEQ-01 as two rings across two barriers", () => {
    const [seq01] = buildSequenceDiagrams(phaseSequence, "SIG-022");
    expect(seq01.columns).toEqual([
      { barrierId: "A", slots: 3 },
      { barrierId: "B", slots: 3 },
    ]);
    expect(shape(seq01)).toEqual(["R1 1,2,9 | 3,4,11", "R2 5,6,13 | 7,8,15"]);
  });

  // SEQ-11 is the same phases with barrier B run in the opposite order.
  it("keeps SEQ-11's different order rather than merging it into SEQ-01", () => {
    const [, seq11] = buildSequenceDiagrams(phaseSequence, "SIG-022");
    expect(shape(seq11)).toEqual(["R1 1,2,9 | 11,4,3", "R2 5,6,13 | 15,8,7"]);
  });

  it("finds nothing wrong with any signal in the sample", () => {
    const ids = Array.from(new Set(phaseSequence.map((r) => r.signalId)));
    expect(ids).toHaveLength(7);
    for (const id of ids) {
      for (const d of buildSequenceDiagrams(phaseSequence, id)) {
        expect(d.problems, `${id} ${d.sequenceId}`).toEqual([]);
      }
    }
  });

  it("returns nothing for a signal with no rows", () => {
    expect(buildSequenceDiagrams(phaseSequence, "SIG-028")).toEqual([]);
  });

  it("accounts for every row exactly once", () => {
    const total = Array.from(new Set(phaseSequence.map((r) => r.signalId)))
      .flatMap((id) => buildSequenceDiagrams(phaseSequence, id))
      .flatMap((d) => d.rings.flatMap((r) => r.groups.flat())).length;
    expect(total).toBe(phaseSequence.length);
  });
});

describe("ring-barrier layout, structure checks", () => {
  const build = (rows: PhaseSequenceEntry[]) => buildSequenceDiagrams(rows, "X")[0];
  const ok = [
    row(1, 1, 1, "A"),
    row(1, 2, 2, "A"),
    row(1, 3, 3, "B"),
    row(1, 4, 4, "B"),
    row(2, 1, 5, "A"),
    row(2, 2, 6, "A"),
    row(2, 3, 7, "B"),
    row(2, 4, 8, "B"),
  ];

  it("passes a well-formed dual ring", () => {
    expect(build(ok).problems).toEqual([]);
  });

  // The file is a table, not an ordered list: nothing promises position order.
  it("orders by position, whatever order the rows arrive in", () => {
    const shuffled = [ok[7], ok[2], ok[5], ok[0], ok[6], ok[3], ok[1], ok[4]];
    const d = build(shuffled);
    expect(shape(d)).toEqual(["R1 1,2 | 3,4", "R2 5,6 | 7,8"]);
    expect(d.columns.map((c) => c.barrierId)).toEqual(["A", "B"]);
  });

  it("widens a band to the busiest ring and leaves the shorter ring short", () => {
    const d = build([row(1, 1, 1, "A"), row(1, 2, 2, "A"), row(1, 3, 3, "A"), row(2, 1, 5, "A")]);
    expect(d.columns).toEqual([{ barrierId: "A", slots: 3 }]);
    expect(d.rings[1].groups[0]).toHaveLength(1);
  });

  it("reports a phase that appears twice", () => {
    const d = build([...ok, row(2, 5, 3, "B")]);
    expect(d.problems).toContain("Phase 3 appears more than once.");
  });

  it("reports two phases in one place", () => {
    const d = build([...ok, row(1, 2, 9, "A")]);
    expect(d.problems).toContain("Ring 1 uses position 2 more than once.");
  });

  it("reports skipped positions", () => {
    const d = build(ok.filter((r) => !(r.ring === 1 && r.position === 2)));
    expect(d.problems.some((p) => p.startsWith("Ring 1 positions skip a number"))).toBe(true);
  });

  it("reports rows that can't be drawn, without dropping the rest", () => {
    const d = build([...ok, row(null, 5, 9, "B"), row(1, null, 10, "B")]);
    expect(d.problems).toContain(
      "2 rows are missing a ring, position or phase and can't be drawn.",
    );
    expect(d.rings.flatMap((r) => r.groups.flat())).toHaveLength(8);
  });

  it("reports rings that cross the barriers in different orders", () => {
    const d = build([row(1, 1, 1, "A"), row(1, 2, 2, "B"), row(2, 1, 5, "B"), row(2, 2, 6, "A")]);
    expect(d.problems.some((p) => p.startsWith("Ring 2 crosses the barriers as B → A"))).toBe(true);
  });

  it("reports a ring that leaves a barrier and comes back", () => {
    const d = build([row(1, 1, 1, "A"), row(1, 2, 2, "B"), row(1, 3, 3, "A")]);
    expect(d.problems.some((p) => p.includes("A → B → A"))).toBe(true);
  });

  it("copes with no barrier ids at all", () => {
    const d = build([row(1, 1, 1, null), row(1, 2, 2, null)]);
    expect(d.columns).toEqual([{ barrierId: null, slots: 2 }]);
    expect(d.problems).toEqual([]);
  });
});

describe("which pattern uses which sequence", () => {
  const { phaseSequence, patternSignals } = sampleBag();
  const ids = ["SEQ-01", "SEQ-11"];

  it("reads the sequence number out of the notes", () => {
    expect(sequenceFromNotes("split table 1; seq 1; offset ref BegGreen", ids)).toBe("SEQ-01");
    expect(sequenceFromNotes("seq 11", ids)).toBe("SEQ-11");
    expect(sequenceFromNotes("Sequence #1", ids)).toBe("SEQ-01");
  });

  it("returns null rather than guessing", () => {
    expect(sequenceFromNotes("Free at this signal (pattern 5 cycle 0)", ids)).toBeNull();
    expect(sequenceFromNotes("seq 7", ids)).toBeNull(); // no SEQ-07 here
    expect(sequenceFromNotes(null, ids)).toBeNull();
    expect(sequenceFromNotes("seq 1", ["SEQ-01", "SEQ-001"])).toBeNull(); // ambiguous
  });

  it("matches the real data: SIG-022 runs SEQ-01 in P01/P03 and SEQ-11 in P05", () => {
    const used = patternsUsingSequences(patternSignals, "SIG-022", ids);
    expect(used.get("SEQ-01")).toEqual(["CAL-SB-P01", "CAL-SB-P03"]);
    expect(used.get("SEQ-11")).toEqual(["CAL-SB-P05"]);
  });

  it("picks the sequence for one pattern and signal", () => {
    expect(sequenceForPattern(patternSignals, phaseSequence, "CAL-SB-P03", "SIG-023")).toBe(
      "SEQ-03",
    );
    expect(sequenceForPattern(patternSignals, phaseSequence, "CAL-SB-P01", "SIG-023")).toBe(
      "SEQ-01",
    );
  });

  it("says nothing where the notes say nothing", () => {
    // SIG-023 is free in P05, so its note names no sequence.
    expect(sequenceForPattern(patternSignals, phaseSequence, "CAL-SB-P05", "SIG-023")).toBeNull();
    expect(sequenceForPattern(patternSignals, phaseSequence, "NOPE", "SIG-023")).toBeNull();
  });
});
