import PhaseSequenceDiagram from "@/components/gtss/phase-sequence-diagram";
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
  patternsUsingSequences,
  type PatternSignal,
  type PhaseSequenceEntry,
} from "gtss";
import { AlertTriangle, Columns3 } from "lucide-react";
import { useMemo } from "react";

interface PhaseSequenceCardProps {
  phaseSequence: readonly PhaseSequenceEntry[];
  patternSignals: readonly PatternSignal[];
  /** Corridor signals in travel order; used to order the cards and to name any that have no rows. */
  corridorSignalIds: readonly string[];
  /** "" means every signal. */
  signalId: string;
  onSignalChange: (signalId: string) => void;
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
 * phases) gets one diagram each, because they genuinely differ.
 */
export default function PhaseSequenceCard({
  phaseSequence,
  patternSignals,
  corridorSignalIds,
  signalId,
  onSignalChange,
}: PhaseSequenceCardProps) {
  const signalIds = useMemo(() => {
    const present = Array.from(new Set(phaseSequence.map((r) => r.signalId)));
    const rank = (id: string) => {
      const at = corridorSignalIds.indexOf(id);
      return at === -1 ? Number.MAX_SAFE_INTEGER : at;
    };
    return present.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }, [phaseSequence, corridorSignalIds]);

  const shown = signalId && signalIds.includes(signalId) ? [signalId] : signalIds;

  const patternLabels = useMemo(() => {
    const ids = Array.from(new Set(patternSignals.map((p) => p.patternId)));
    const short = shortenIds(ids);
    return new Map(ids.map((id, i) => [id, short[i]]));
  }, [patternSignals]);

  // In the corridor but with no ring structure to draw.
  const undrawable = corridorSignalIds.filter((id) => !signalIds.includes(id));

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

        {shown.map((id) => {
          const diagrams = buildSequenceDiagrams(phaseSequence, id);
          const used = patternsUsingSequences(
            patternSignals,
            id,
            diagrams.map((d) => d.sequenceId),
          );
          return (
            <section key={id} aria-label={`Signal ${id}`}>
              <h3 className="mb-1 flex items-baseline gap-2 text-sm font-semibold text-grey-800">
                <span className="font-mono">{id}</span>
                <span className="text-[11px] font-normal text-grey-500">
                  {diagrams.length} sequence{diagrams.length === 1 ? "" : "s"}
                </span>
              </h3>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {diagrams.map((d) => {
                  const patterns = used.get(d.sequenceId) ?? [];
                  return (
                    <div key={d.sequenceId} className="rounded-lg border border-grey-200 p-2">
                      <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs">
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

        {undrawable.length > 0 && !signalId && (
          <p className="flex items-start gap-1 text-[11px] text-amber-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            No PhaseSequence rows for {undrawable.join(", ")}, so{" "}
            {undrawable.length === 1 ? "it has" : "they have"} no ring structure to draw.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
