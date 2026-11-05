import { GTSSFileText } from "@/components/gtss/gtss-file-viewer";
import PreemptChannelForm from "@/components/gtss/preempt-channel-form";
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
  deletePreemptChannel,
  generatePreemptCSV,
  intersectionStreetNames,
  isLhtForSignalId,
  isStorageReadOnly,
  preemptChannelsFor,
  PREEMPT_FILENAME,
  undoPreemptChange,
  useGTSSStore,
  type PreemptChannel,
} from "gtss";
import { phaseColors, PreemptDiagram } from "gtss-diagram";
import { AlertTriangle, Info, Pencil, Plus, Siren, Trash2, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";

const ALL = "__all";

/** Signal IDs in the order people count them: 2 before 10. */
const naturalOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** "EMERGENCY · 120 s max", with every value if the channel's rows disagree. */
const channelSummary = (channel: PreemptChannel) =>
  [
    channel.types.join(" / "),
    channel.maxTimes.length > 0 ? `${channel.maxTimes.join(" / ")} s max` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Preempt channels, signal by signal: a small chart for each channel, drawn from
 * the phases preempt.txt names and the approaches GTSS has for them.
 */
export default function PreemptionPage() {
  const { preempts, signals, phases, approaches, refreshPreempts } = useGTSSStore();
  const readOnly = isStorageReadOnly();
  const [signalId, setSignalId] = useState("");
  const [editing, setEditing] = useState<{ signalId: string; channel: number | null } | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo: () => void } | null>(null);

  const gtss = useMemo(() => ({ phases, approaches }), [phases, approaches]);
  const known = useMemo(() => new Set(signals.map((s) => s.signalId)), [signals]);
  const withChannels = useMemo(
    () => Array.from(new Set(preempts.map((r) => r.signalId))).sort(naturalOrder),
    [preempts],
  );
  const allSignals = useMemo(
    () => Array.from(new Set([...withChannels, ...Array.from(known)])).sort(naturalOrder),
    [withChannels, known],
  );

  const active = allSignals.includes(signalId) ? signalId : "";
  const shown = active ? [active] : withChannels;

  const channelsBySignal = useMemo(() => {
    const bySignal = new Map(
      withChannels.map((id) => [id, preemptChannelsFor(preempts, id, gtss)]),
    );
    return bySignal;
  }, [withChannels, preempts, gtss]);

  const channelCount = Array.from(channelsBySignal.values()).reduce((n, c) => n + c.length, 0);
  // Phases that can't be drawn, counted once at the top: in the long list, one
  // amber line in one tile is easy to scroll past.
  const undrawable = Array.from(channelsBySignal.values())
    .flat()
    .flatMap((c) => c.movements)
    .filter((m) => m.problem !== null).length;

  const saved = (text: string, undo: () => void) => {
    setEditing(null);
    setNotice({ text, undo });
    refreshPreempts();
  };
  const remove = (id: string, channel: number) => {
    const change = deletePreemptChannel(id, channel);
    setEditing(null);
    setNotice({
      text: `Deleted channel ${channel} at signal ${id}.`,
      undo: () => undoPreemptChange(change),
    });
    refreshPreempts();
  };
  const undo = () => {
    if (!notice) return;
    notice.undo();
    setNotice(null);
    refreshPreempts();
  };

  const streetsOf = (id: string) => {
    const signal = signals.find((s) => s.signalId === id);
    return signal ? intersectionStreetNames(signal, approaches).join(" / ") : "";
  };
  const approachesOf = (id: string) =>
    approaches
      .filter((a) => a.signalId === id)
      .map((a) => ({ approachId: a.approachId, compassBearing: a.compassBearing ?? null }));

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-grey-800">
              <Siren className="h-4 w-4 text-primary-600" />
              Preempt channels
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                Beta
              </span>
              <span className="text-xs font-normal text-grey-500">
                {channelCount} channel{channelCount === 1 ? "" : "s"} at {withChannels.length}{" "}
                signal{withChannels.length === 1 ? "" : "s"}
              </span>
            </CardTitle>
            {allSignals.length > 0 && (
              <Select
                value={active || ALL}
                onValueChange={(v) => {
                  setSignalId(v === ALL ? "" : v);
                  setEditing(null);
                }}
              >
                <SelectTrigger className="h-7 w-48 text-xs" aria-label="Signal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-xs">
                    All with channels ({withChannels.length})
                  </SelectItem>
                  {allSignals.map((id) => (
                    <SelectItem key={id} value={id} className="text-xs">
                      {id}
                      {channelsBySignal.has(id) ? "" : " (no channels)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-3">
          <p className="text-[11px] text-grey-500">
            Each chart is one channel: an arrow for each phase it brings up, on the approach
            phases.txt puts that phase on, with north up. Colors and numbers are the phases&rsquo;,
            as on the phase diagram.
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

          {undrawable > 0 && !active && (
            <p className="flex items-start gap-1 text-[11px] text-amber-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {undrawable} phase{undrawable === 1 ? " has" : "s have"} no arrow, because GTSS
              doesn&rsquo;t give {undrawable === 1 ? "it" : "them"} a direction. Each is marked on
              its channel.
            </p>
          )}

          {preempts.length === 0 && !active && (
            <p className="text-xs text-grey-600">
              No preempt channels yet. Import a preempt file under Data Management &rarr; Import, or
              pick a signal above to add one.
            </p>
          )}

          {shown.map((id) => {
            const channels = channelsBySignal.get(id) ?? [];
            const adding = editing?.signalId === id && editing.channel === null;
            const streets = streetsOf(id);
            return (
              <section key={id} aria-label={`Signal ${id}`}>
                <h3 className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-grey-800">
                  <span className="font-mono">{id}</span>
                  {streets && <span className="text-xs font-normal text-grey-500">{streets}</span>}
                  {!known.has(id) && (
                    <span className="flex items-center gap-1 text-[11px] font-normal text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      not in signals.txt
                    </span>
                  )}
                  {!readOnly && !adding && (
                    <Button
                      variant="outline"
                      onClick={() => setEditing({ signalId: id, channel: null })}
                      className="h-6 px-2 text-[11px] font-normal"
                    >
                      <Plus className="mr-0.5 h-3 w-3" />
                      Add channel
                    </Button>
                  )}
                </h3>
                {channels.length === 0 && !adding && (
                  <p className="text-[11px] text-grey-500">No preempt channels at this signal.</p>
                )}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
                  {adding && (
                    <PreemptChannelForm
                      signalId={id}
                      channel={null}
                      preempts={preempts}
                      gtss={gtss}
                      isLht={isLhtForSignalId(id)}
                      onCancel={() => setEditing(null)}
                      onSaved={saved}
                    />
                  )}
                  {channels.map((c) =>
                    editing?.signalId === id && editing.channel === c.channel ? (
                      <PreemptChannelForm
                        key={c.channel}
                        signalId={id}
                        channel={c.channel}
                        preempts={preempts}
                        gtss={gtss}
                        isLht={isLhtForSignalId(id)}
                        onCancel={() => setEditing(null)}
                        onSaved={saved}
                      />
                    ) : (
                      <div key={c.channel} className="rounded-lg border border-grey-200 p-2">
                        <div className="flex items-center gap-1 text-xs">
                          <span className="font-semibold text-grey-800">Channel {c.channel}</span>
                          {!readOnly && (
                            <span className="ml-auto flex items-center">
                              <Button
                                variant="ghost"
                                onClick={() => setEditing({ signalId: id, channel: c.channel })}
                                aria-label={`Edit channel ${c.channel} at signal ${id}`}
                                title="Edit this channel"
                                className="h-5 w-5 p-0 text-grey-400"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => remove(id, c.channel)}
                                aria-label={`Delete channel ${c.channel} at signal ${id}`}
                                title="Delete this channel (you can undo it)"
                                className="h-5 w-5 p-0 text-grey-400 hover:text-red-600"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-grey-500">{channelSummary(c)}</div>
                        <div className="flex justify-center py-1">
                          <PreemptDiagram
                            phases={c.movements.map((m) => ({
                              phase: m.phase,
                              approachId: m.approachId,
                              movementType: m.movementType ?? "",
                            }))}
                            approaches={approachesOf(id)}
                            isLht={isLhtForSignalId(id)}
                            label={`Channel ${c.channel} at signal ${id}: ${c.movements
                              .map((m) =>
                                m.problem
                                  ? `phase ${m.phase}, ${m.problem}`
                                  : `phase ${m.phase}, ${m.direction} ${m.label}`,
                              )
                              .join("; ")}`}
                          />
                        </div>
                        <ul className="space-y-0.5 text-[11px]">
                          {c.movements.map((m, i) => (
                            <li
                              key={`${m.phase}-${m.approachId}-${i}`}
                              className="flex items-baseline gap-1"
                              title={m.street ?? undefined}
                            >
                              <span
                                className="font-mono font-semibold"
                                style={{ color: phaseColors[m.phase] ?? "#64748b" }}
                              >
                                φ{m.phase}
                              </span>
                              {m.problem ? (
                                <span className="text-amber-700">{m.problem}</span>
                              ) : (
                                <span className="text-grey-600">
                                  {m.direction} {m.label}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ),
                  )}
                </div>
              </section>
            );
          })}
        </CardContent>
      </Card>

      {preempts.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <GTSSFileText
              file={{
                id: "preempts",
                label: PREEMPT_FILENAME,
                content: generatePreemptCSV(preempts),
              }}
              heightClass="h-56"
              download
              caption={`The whole file: ${preempts.length} rows and a header, as Export writes it.`}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
