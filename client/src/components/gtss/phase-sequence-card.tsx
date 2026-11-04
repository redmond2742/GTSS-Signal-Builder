import PhaseSequenceDiagram from "@/components/gtss/phase-sequence-diagram";
import PhaseSequenceEditor from "@/components/gtss/phase-sequence-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildSequenceDiagrams,
  deletePhaseSequence,
  patternsUsingSequences,
  undoSequenceChange,
  type PatternSignal,
  type PhaseSequenceEntry,
  type SequenceChange,
} from "gtss";
import type { Phase } from "gtss/schema";
import { AlertTriangle, Columns3, Info, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";

interface PhaseSequenceCardProps {
  phaseSequence: readonly PhaseSequenceEntry[];
  patternSignals: readonly PatternSignal[];
  /** Corridor signals in travel order; used to order the cards and to name any that have no rows. */
  corridorSignalIds: readonly string[];
  /** "" means every signal. */
  signalId: string;
  onSignalChange: (signalId: string) => void;
  /** GTSS phases, for the editor's labels and standard layout. */
  phases: readonly Phase[];
  readOnly: boolean;
  /** Called after a write so the store can reload from storage. */
  onChanged: () => void;
}

const ALL = "__all";

/** Drop the prefix every id shares ("CAL-SB-P01", "CAL-SB-P03" → "P01", "P03"). */
function shortenIds(ids: readonly string[]): string[] {
  if (ids.length < 2) return [...ids];
  let prefix = ids[0];
  for (const id of ids) {
    while (!id.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  const cut = prefix.lastIndexOf("-") + 1;
  return ids.map((id) => id.slice(cut) || id);
}

/**
 * Ring-barrier diagrams for PhaseSequence.txt: one per sequence, grouped by
 * signal. A signal with several sequences (lead/lag variants of the same
 * phases) gets one diagram each, because they genuinely differ. Each can be
 * edited or deleted, and a signal can be given a new one.
 */
export default function PhaseSequenceCard({
  phaseSequence,
  patternSignals,
  corridorSignalIds,
  signalId,
  onSignalChange,
  phases,
  readOnly,
  onChanged,
}: PhaseSequenceCardProps) {
  // Signals with sequences, then corridor signals without one, which can be given one.
  const signalIds = useMemo(() => {
    const present = Array.from(
      new Set([...phaseSequence.map((r) => r.signalId), ...corridorSignalIds]),
    );
    const rank = (id: string) => {
      const at = corridorSignalIds.indexOf(id);
      return at === -1 ? Number.MAX_SAFE_INTEGER : at;
    };
    return present.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }, [phaseSequence, corridorSignalIds]);
  const hasRows = (id: string) => phaseSequence.some((r) => r.signalId === id);

  const shown = signalId && signalIds.includes(signalId) ? [signalId] : signalIds;

  // The one sequence being edited; a null sequenceId is a new one.
  const [editing, setEditing] = useState<{ signalId: string; sequenceId: string | null } | null>(
    null,
  );
  const [notice, setNotice] = useState<{ text: string; change: SequenceChange } | null>(null);

  const saved = (text: string, change: SequenceChange) => {
    setEditing(null);
    setNotice({ text, change });
    onChanged();
  };
  const remove = (id: string, sequenceId: string, usedBy: readonly string[]) => {
    const change = deletePhaseSequence(id, sequenceId);
    setEditing(null);
    setNotice({
      text:
        `Deleted ${id}'s ${sequenceId}.` +
        (usedBy.length > 0
          ? ` ${usedBy.join(", ")} named it in PatternSignals' notes, so ${usedBy.length === 1 ? "it now falls" : "they now fall"} back to the signal's first sequence.`
          : ""),
      change,
    });
    onChanged();
  };
  const undo = () => {
    if (!notice) return;
    undoSequenceChange(notice.change);
    setNotice(null);
    onChanged();
  };
  const editor = (id: string, sequenceId: string | null) => (
    <PhaseSequenceEditor
      key={`${id}|${sequenceId ?? "new"}`}
      signalId={id}
      sequenceId={sequenceId}
      phaseSequence={phaseSequence}
      patternSignals={patternSignals}
      gtssPhases={phases.filter((p) => p.signalId === id)}
      onCancel={() => setEditing(null)}
      onSaved={saved}
    />
  );

  const patternLabels = useMemo(() => {
    const ids = Array.from(new Set(patternSignals.map((p) => p.patternId)));
    const short = shortenIds(ids);
    return new Map(ids.map((id, i) => [id, short[i]]));
  }, [patternSignals]);

  return (
    <Card>
      <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-grey-800">
            <Columns3 className="h-4 w-4 text-primary-600" />
            Ring &amp; barrier diagram
          </CardTitle>
          <Select
            value={signalId && signalIds.includes(signalId) ? signalId : ALL}
            onValueChange={(v) => onSignalChange(v === ALL ? "" : v)}
          >
            <SelectTrigger className="h-7 w-44 text-xs" aria-label="Signal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">
                All signals ({signalIds.length})
              </SelectItem>
              {signalIds.map((id) => (
                <SelectItem key={id} value={id} className="text-xs">
                  {id}
                  {hasRows(id) ? "" : " (no sequence)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-3">
        <p className="text-[11px] text-grey-500">
          Each row is a ring, read left to right in running order. Heavy lines are barriers; the
          phases between two barriers run concurrently across the rings. <span>#n</span> is the
          phase&rsquo;s position in its ring.
        </p>

        {notice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"
          >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{notice.text}</span>
            {!readOnly && (
              <Button variant="outline" onClick={undo} className="h-6 bg-white px-2 text-[11px]">
                <Undo2 className="mr-1 h-3 w-3" />
                Undo
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="h-6 w-6 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {shown.map((id) => {
          const diagrams = buildSequenceDiagrams(phaseSequence, id);
          const used = patternsUsingSequences(
            patternSignals,
            id,
            diagrams.map((d) => d.sequenceId),
          );
          const adding = editing?.signalId === id && editing.sequenceId === null;
          return (
            <section key={id} aria-label={`Signal ${id}`}>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-grey-800">
                <span className="font-mono">{id}</span>
                <span className="text-[11px] font-normal text-grey-500">
                  {diagrams.length === 0
                    ? "no sequence yet"
                    : `${diagrams.length} sequence${diagrams.length === 1 ? "" : "s"}`}
                </span>
                {!readOnly && !adding && (
                  <Button
                    variant="outline"
                    onClick={() => setEditing({ signalId: id, sequenceId: null })}
                    className="h-6 px-2 text-[11px] font-normal"
                  >
                    <Plus className="mr-0.5 h-3 w-3" />
                    Add sequence
                  </Button>
                )}
              </h3>
              {adding && <div className="mb-3">{editor(id, null)}</div>}
              {diagrams.length === 0 && !adding && (
                <p className="text-[11px] text-grey-500">
                  No ring structure in PhaseSequence.txt yet, so its splits have nothing to be laid
                  out on.
                </p>
              )}
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {diagrams.map((d) => {
                  const patterns = used.get(d.sequenceId) ?? [];
                  if (editing?.signalId === id && editing.sequenceId === d.sequenceId) {
                    return (
                      <div key={d.sequenceId} className="xl:col-span-2">
                        {editor(id, d.sequenceId)}
                      </div>
                    );
                  }
                  return (
                    <div key={d.sequenceId} className="rounded-lg border border-grey-200 p-2">
                      <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs">
                        <span className="font-mono font-semibold text-grey-800">
                          {d.sequenceId}
                        </span>
                        {patterns.length > 0 && (
                          <span
                            className="text-grey-500"
                            title="Read from the 'seq N' in each PatternSignals row's notes"
                          >
                            used in {patterns.map((p) => patternLabels.get(p) ?? p).join(", ")}
                          </span>
                        )}
                        {!readOnly && (
                          <span className="ml-auto flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              onClick={() => setEditing({ signalId: id, sequenceId: d.sequenceId })}
                              aria-label={`Edit ${id} ${d.sequenceId}`}
                              title="Edit this sequence"
                              className="h-6 w-6 p-0 text-grey-500"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => remove(id, d.sequenceId, patterns)}
                              aria-label={`Delete ${id} ${d.sequenceId}`}
                              title="Delete this sequence (you can undo it)"
                              className="h-6 w-6 p-0 text-grey-500 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        )}
                      </div>
                      <PhaseSequenceDiagram diagram={d} />
                      {d.problems.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {d.problems.map((p) => (
                            <li
                              key={p}
                              className="flex items-start gap-1 text-[11px] text-amber-700"
                            >
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
