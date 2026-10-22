import CoordinationCell, { type CellType } from "@/components/gtss/coordination-cell";
import CorridorOrderCard from "@/components/gtss/corridor-order-card";
import type { PinLabelMode } from "@/components/gtss/corridors-map";
import TimeSpaceDiagram, { buildStops } from "@/components/gtss/time-space-diagram";
import { useOffsetHistory } from "@/hooks/use-offset-history";
import PhaseSequenceCard from "@/components/gtss/phase-sequence-card";
import RingBarrierChart from "@/components/gtss/ring-barrier-chart";
import ScheduleCalendar from "@/components/gtss/schedule-calendar";
import GTSSFileViewer from "@/components/gtss/gtss-file-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  COORDINATION_ENTITIES,
  isMetricForSignalId,
  isStorageReadOnly,
  exportCoordinationAsZip,
  moveCorridorSignal,
  renameSignalInCoordination,
  sequenceForPattern,
  sortBySequence,
  summarizeIssues,
  UNSCOPED,
  useGTSSStore,
  validateCoordination,
  type CoordinationIssue,
  type CorridorSignal,
  type PatternSignal,
  type TrajectoryMode,
} from "gtss";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  GitBranch,
  Info,
  Redo2,
  Trash2,
  Undo2,
  Waypoints,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** The sub-views: an overview plus one per file. */
type View = "overview" | (typeof COORDINATION_ENTITIES)[number]["key"];

/** Columns rendered for each file, in the order the spec declares them. */
type Column = { key: string; label: string; type?: CellType };

const TABLE_COLUMNS: Record<string, readonly Column[]> = {
  corridors: [
    { key: "corridorId", label: "Corridor" },
    { key: "name", label: "Name" },
    { key: "primaryDirection", label: "Direction" },
    { key: "description", label: "Description" },
  ],
  corridorSignals: [
    { key: "corridorId", label: "Corridor" },
    { type: "number", key: "sequence", label: "Seq" },
    { key: "signalId", label: "Signal" },
    { key: "direction", label: "Direction" },
  ],
  coordination: [
    { key: "coordinationId", label: "Coordination" },
    { key: "name", label: "Name" },
    { key: "referenceClock", label: "Clock" },
    { key: "timezone", label: "Timezone" },
    { key: "description", label: "Description" },
  ],
  patterns: [
    { key: "patternId", label: "Pattern" },
    { type: "number", key: "patternNumber", label: "No." },
    { key: "corridorId", label: "Corridor" },
    { type: "number", key: "cycleLengthS", label: "Cycle (s)" },
    { key: "referencePoint", label: "Reference" },
    { key: "description", label: "Description" },
  ],
  patternSignals: [
    { key: "patternId", label: "Pattern" },
    { key: "signalId", label: "Signal" },
    { type: "number", key: "offsetS", label: "Offset (s)" },
    { type: "number", key: "coordinatedPhase", label: "Coord. phase" },
    { key: "notes", label: "Notes" },
  ],
  splits: [
    { key: "patternId", label: "Pattern" },
    { key: "signalId", label: "Signal" },
    { type: "number", key: "phaseId", label: "Phase" },
    { type: "number", key: "splitS", label: "Split (s)" },
  ],
  schedule: [
    { key: "scheduleId", label: "Schedule" },
    { key: "dayType", label: "Day type" },
    { key: "startTime", label: "Start" },
    { key: "endTime", label: "End" },
    { key: "patternId", label: "Pattern" },
    { type: "number", key: "priority", label: "Priority" },
  ],
  phaseSequence: [
    { key: "signalId", label: "Signal" },
    { key: "sequenceId", label: "Sequence" },
    { type: "number", key: "ring", label: "Ring" },
    { type: "number", key: "position", label: "Pos" },
    { type: "number", key: "phaseId", label: "Phase" },
    { key: "barrierId", label: "Barrier" },
  ],
};

/**
 * Key columns that are edited as an OPERATION rather than a patch, because each
 * is part of the row's identity and so editing it moves the row.
 *
 * - corridorSignals `sequence`: moves the stop and renumbers the corridor.
 * - the signal id of PatternSignals, Splits and PhaseSequence: re-points the row
 *   at another signal, refusing a move that would duplicate an existing row.
 */
const OPERATION_COLUMNS: Record<string, string> = {
  corridorSignals: "sequence",
  patternSignals: "signalId",
  splits: "signalId",
  phaseSequence: "signalId",
};
const isOperationColumn = (view: string, columnKey: string) =>
  OPERATION_COLUMNS[view] === columnKey;

/** PatternSignals, where the offsets live. */
const PATTERN_SIGNALS = COORDINATION_ENTITIES.find((e) => e.key === "patternSignals")!;

/** The files whose signal id is part of the row key. */
type SignalKeyedFile = "patternSignals" | "splits" | "phaseSequence";

/** What the bar above the table says about the last signal-id edit. */
interface SignalNotice {
  view: string;
  tone: "error" | "info";
  text: string;
  /** Offer to carry the change to the rest of the file, or to every file. */
  offer?: { file: SignalKeyedFile; from: string; to: string };
}

/** "a", "a and b", "a, b and c". */
const joinWords = (words: readonly string[]) =>
  words.length < 2
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/** Read one declared column off a row. The eight row types have no index
 *  signature, so the cast is contained here rather than claiming every row is
 *  a Record<string, unknown>. */
const readField = (row: object, key: string): unknown => (row as Record<string, unknown>)[key];

/**
 * What happened to the last signal-id edit, and the offer to carry it further.
 * Sits above the table's scroll area so it stays in view while you work down it.
 */
function SignalNoticeBar({
  notice,
  remaining,
  filename,
  onRestOfFile,
  onEverywhere,
  onDismiss,
}: {
  notice: SignalNotice;
  remaining: number;
  filename: string;
  onRestOfFile: (offer: NonNullable<SignalNotice["offer"]>) => void;
  onEverywhere: (offer: NonNullable<SignalNotice["offer"]>) => void;
  onDismiss: () => void;
}) {
  const { offer } = notice;
  const isError = notice.tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs ${
        isError
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
    >
      {isError ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Info className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        {notice.text}
        {offer && remaining > 0 && (
          <>
            {" "}
            {remaining} other row{remaining === 1 ? "" : "s"} in {filename} still use {offer.from}.
          </>
        )}
      </span>
      {offer && remaining > 0 && (
        <>
          <Button
            variant="outline"
            onClick={() => onRestOfFile(offer)}
            className="h-6 bg-white px-2 text-[11px]"
          >
            Change {remaining === 1 ? "it" : `those ${remaining}`} too
          </Button>
          <Button
            variant="outline"
            onClick={() => onEverywhere(offer)}
            title="Every coordination file, and the reference points that name this signal"
            className="h-6 bg-white px-2 text-[11px]"
          >
            Change in all coordination files
          </Button>
        </>
      )}
      <Button variant="ghost" onClick={onDismiss} className="h-6 px-2 text-[11px]">
        Dismiss
      </Button>
    </div>
  );
}

function IssueList({ issues }: { issues: readonly CoordinationIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4" />
        No problems found.
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {issues.map((issue) => (
        <li key={issue.id} className="flex items-start gap-2 text-xs">
          <AlertTriangle
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
              issue.level === "error" ? "text-red-600" : "text-amber-600"
            }`}
          />
          <span className={issue.level === "error" ? "text-red-700" : "text-grey-700"}>
            {issue.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Coordination: import, view and validate. Read-only in this release — nothing
 * here creates, changes or deletes a row.
 */
export default function CoordinationPage() {
  const { coordination, signals, refreshCoordination } = useGTSSStore();
  // Lookup mode blocks writes at the storage layer; reflect that in the UI
  // instead of offering edits that silently no-op.
  const readOnly = isStorageReadOnly();
  const [view, setView] = useState<View>("overview");
  const [corridorId, setCorridorId] = useState<string>("");
  const [hoveredSignalId, setHoveredSignalId] = useState<string | null>(null);
  const [pinLabel, setPinLabel] = useState<PinLabelMode>("sequence");
  const [splitPattern, setSplitPattern] = useState<string>("");
  const [tsPattern, setTsPattern] = useState<string>("");
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [trajectoryMode, setTrajectoryMode] = useState<TrajectoryMode>("stop-at-red");
  // Display units; converted to m/s for the geometry.
  const [speed, setSpeed] = useState<string>("30");
  const [splitSignal, setSplitSignal] = useState<string>("");
  // PhaseSequence view: "" shows every signal.
  const [seqSignal, setSeqSignal] = useState<string>("");
  const [notice, setNotice] = useState<SignalNotice | null>(null);

  // Writing one offset is the only thing undo and redo need to be able to do.
  const writeOffset = (patternId: string, signalId: string, offsetS: number | null): boolean => {
    const row = (PATTERN_SIGNALS.read() as PatternSignal[]).find(
      (r) => r.patternId === patternId && r.signalId === signalId,
    );
    if (!row) return false;
    PATTERN_SIGNALS.updateRow(PATTERN_SIGNALS.identityOf(row), { offsetS });
    refreshCoordination();
    return true;
  };
  const offsetHistory = useOffsetHistory(writeOffset);
  const { undo: undoEdit, redo: redoEdit } = offsetHistory;

  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z (or Ctrl+Y) on the PatternSignals page. In a
  // text box they are left alone: there they undo typing, which is what you want.
  useEffect(() => {
    if (view !== "patternSignals") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const wantsUndo = key === "z" && !e.shiftKey;
      const wantsRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!wantsUndo && !wantsRedo) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target !== null &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
      if (typing) return;
      e.preventDefault();
      const edit = wantsUndo ? undoEdit() : redoEdit();
      if (edit) setTsPattern(edit.patternId); // show the pattern the change was in
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, undoEdit, redoEdit]);

  const signalIds = useMemo(() => new Set(signals.map((s) => s.signalId)), [signals]);
  const issues = useMemo(
    () => validateCoordination(coordination, signalIds),
    [coordination, signalIds],
  );
  const { errors, warnings } = summarizeIssues(issues);

  const totalRows = COORDINATION_ENTITIES.reduce(
    (sum, e) => sum + (coordination[e.key]?.length ?? 0),
    0,
  );

  const activeCorridorId = corridorId || coordination.corridors[0]?.corridorId || "";

  // Splits are the one file dense enough to need narrowing: 100 rows across
  // patterns and signals is unusable to scan, let alone edit.
  const splitPatterns = Array.from(new Set(coordination.splits.map((r) => r.patternId))).sort();
  const activeSplitPattern = splitPattern || splitPatterns[0] || "";
  const splitSignals = Array.from(
    new Set(
      coordination.splits.filter((r) => r.patternId === activeSplitPattern).map((r) => r.signalId),
    ),
  ).sort();
  const activeSplitSignal = splitSignals.includes(splitSignal)
    ? splitSignal
    : (splitSignals[0] ?? "");
  const selectedSplits = coordination.splits.filter(
    (r) => r.patternId === activeSplitPattern && r.signalId === activeSplitSignal,
  );
  // A signal can have several sequences (lead/lag variants of the same phases),
  // and they order the phases differently. Use the one this pattern runs, as
  // named in PatternSignals' notes; if the notes don't say, fall back to the
  // first listed and say so rather than present a guess as fact.
  const signalSequenceIds = Array.from(
    new Set(
      coordination.phaseSequence
        .filter((r) => r.signalId === activeSplitSignal)
        .map((r) => r.sequenceId),
    ),
  );
  const namedSequence = sequenceForPattern(
    coordination.patternSignals,
    coordination.phaseSequence,
    activeSplitPattern,
    activeSplitSignal,
  );
  const chartSequence = namedSequence ?? signalSequenceIds[0] ?? null;
  const selectedSignalSequence = coordination.phaseSequence.filter(
    (r) => r.signalId === activeSplitSignal && r.sequenceId === chartSequence,
  );
  const sequenceCaption =
    signalSequenceIds.length > 1 && chartSequence
      ? namedSequence
        ? `Phase order from ${chartSequence}, the sequence named in this pattern's notes.`
        : `Phase order from ${chartSequence}, the first of ${signalSequenceIds.length} sequences listed. PatternSignals doesn't say which this pattern uses.`
      : null;
  const selectedCycle =
    coordination.patterns.find((p) => p.patternId === activeSplitPattern)?.cycleLengthS ?? null;

  const corridorSignalIds = sortBySequence(
    coordination.corridorSignals.filter((cs) => cs.corridorId === activeCorridorId),
  ).map((cs) => cs.signalId);

  // --- time-space -------------------------------------------------------
  const tsPatterns = Array.from(
    new Set(coordination.patternSignals.map((r) => r.patternId)),
  ).sort();
  const activeTsPattern = tsPattern || tsPatterns[0] || "";
  const tsPatternRow = coordination.patterns.find((p) => p.patternId === activeTsPattern);
  const tsCorridorId = tsPatternRow?.corridorId ?? coordination.corridors[0]?.corridorId ?? "";
  const isMetric = isMetricForSignalId(signals[0]?.signalId);

  const tsStops = useMemo(
    () =>
      buildStops(
        coordination.corridorSignals.filter((cs) => cs.corridorId === tsCorridorId),
        signals,
        coordination.patternSignals.filter((ps) => ps.patternId === activeTsPattern),
        coordination.splits.filter((sp) => sp.patternId === activeTsPattern),
      ),
    [coordination, signals, tsCorridorId, activeTsPattern],
  );

  // mph or km/h in the box, metres per second in the maths.
  const speedMps = (() => {
    const v = Number(speed);
    if (!Number.isFinite(v) || v <= 0) return isMetric ? 30 / 3.6 : 30 * 0.44704;
    return isMetric ? v / 3.6 : v * 0.44704;
  })();

  // Every way of changing an offset goes through here — drag, arrow keys, the
  // buttons, the number box, the table — so undo means the same thing for all.
  // `coalesce` folds a quick run of nudges into one step.
  const commitOffset = (
    patternId: string,
    signalId: string,
    next: number | null,
    coalesce = false,
  ) => {
    const row = (PATTERN_SIGNALS.read() as PatternSignal[]).find(
      (r) => r.patternId === patternId && r.signalId === signalId,
    );
    if (!row) return;
    const from = row.offsetS ?? null;
    if (from === next) return;
    if (writeOffset(patternId, signalId, next)) {
      offsetHistory.record({ patternId, signalId, from, to: next }, { coalesce });
    }
  };

  const setOffset = (signalId: string, next: number) =>
    commitOffset(activeTsPattern, signalId, next, true);

  const undoOffset = () => {
    const edit = undoEdit();
    if (edit) setTsPattern(edit.patternId);
  };
  const redoOffset = () => {
    const edit = redoEdit();
    if (edit) setTsPattern(edit.patternId);
  };

  const showOffset = (n: number | null) => (n === null ? "blank" : `${n}s`);
  const offsetStatus = (() => {
    const note = offsetHistory.note;
    if (!note) return null;
    const { kind, edit } = note;
    if (kind === "undo")
      return `Undid it: ${edit.signalId} offset is back to ${showOffset(edit.from)}.`;
    if (kind === "redo")
      return `Redid it: ${edit.signalId} offset ${showOffset(edit.from)} \u2192 ${showOffset(edit.to)}.`;
    // A quick run of nudges is one step; say where the whole run went.
    const last = offsetHistory.nextUndo;
    return last && last.signalId === edit.signalId && last.patternId === edit.patternId
      ? `${last.signalId} offset ${showOffset(last.from)} \u2192 ${showOffset(last.to)}.`
      : `${edit.signalId} offset is back where it started.`;
  })();

  // Typing a position into a Seq cell moves that stop there and renumbers the
  // rest. Patching the number in place would collide with a neighbour, which is
  // why the generic editor locks it; "move to" is the safe form of the same edit.
  const moveStopTo = (row: CorridorSignal, position: number | string | null) => {
    if (position === null || position === "") return;
    const target = Number(position);
    if (!Number.isFinite(target)) return;
    const members = sortBySequence(
      coordination.corridorSignals.filter((cs) => cs.corridorId === row.corridorId),
    );
    const from = members.indexOf(row);
    if (from < 0) return;
    const to = Math.min(Math.max(Math.round(target) - 1, 0), members.length - 1);
    if (moveCorridorSignal(row.corridorId, from, to)) refreshCoordination();
  };

  const activeEntity =
    COORDINATION_ENTITIES.find((e) => e.key === view) ?? COORDINATION_ENTITIES[0];

  // A selection that no longer matches any row (the signal was renamed) means
  // "all", for the table as well as for the dropdown that set it.
  const activeSeqSignal = coordination.phaseSequence.some((r) => r.signalId === seqSignal)
    ? seqSignal
    : "";

  // Keep the diagram selections on a signal when it is renamed.
  const followSignal = (from: string, to: string) => {
    if (seqSignal === from) setSeqSignal(to);
    if (splitSignal === from) setSplitSignal(to);
  };

  // Editing a signal id moves the row (the id is part of its key). A move that
  // would land on an existing row is refused, so a typo can't overwrite data.
  const changeRowSignal = (row: object, next: string | number | null) => {
    const from = String(readField(row, "signalId"));
    const to = String(next ?? "").trim();
    const result = activeEntity.changeRowSignal?.(activeEntity.identityOf(row), to);

    if (result === "blank") {
      setNotice({ view, tone: "error", text: "A signal ID can't be blank. Nothing was changed." });
    } else if (result === "duplicate") {
      const sameKey = joinWords(
        activeEntity.keyFields
          .filter((f) => f !== "signalId")
          .map((f) => (TABLE_COLUMNS[view]?.find((c) => c.key === f)?.label ?? f).toLowerCase()),
      );
      setNotice({
        view,
        tone: "error",
        text: `${activeEntity.filename} already has a row for ${to} with the same ${sameKey}, so this row was left on ${from}.`,
      });
    } else if (result === "ok") {
      refreshCoordination();
      const stillOnOld = activeEntity
        .read()
        .some((r) => readField(r as object, "signalId") === from);
      setNotice(
        stillOnOld
          ? {
              view,
              tone: "info",
              text: `Changed ${from} to ${to} on this row.`,
              offer: { file: view as SignalKeyedFile, from, to },
            }
          : null,
      );
    }
  };

  const changeRestOfFile = (offer: NonNullable<SignalNotice["offer"]>) => {
    const entity = COORDINATION_ENTITIES.find((e) => e.key === offer.file);
    const report = entity?.changeSignalInFile?.(offer.from, offer.to) ?? { changed: 0, skipped: 0 };
    refreshCoordination();
    followSignal(offer.from, offer.to);
    setNotice({
      view,
      tone: report.skipped > 0 ? "error" : "info",
      text:
        `Changed ${report.changed} more row${report.changed === 1 ? "" : "s"} from ${offer.from} to ${offer.to}.` +
        (report.skipped > 0
          ? ` ${report.skipped} stayed on ${offer.from} because ${offer.to} already has a row with the same key.`
          : ""),
    });
  };

  const changeEverywhere = (offer: NonNullable<SignalNotice["offer"]>) => {
    const report = renameSignalInCoordination(offer.from, offer.to);
    refreshCoordination();
    followSignal(offer.from, offer.to);
    setNotice({
      view,
      tone: report.skipped > 0 ? "error" : "info",
      text:
        `Changed ${report.changed} more row${report.changed === 1 ? "" : "s"} across the coordination files from ${offer.from} to ${offer.to}` +
        (report.referencePoints > 0
          ? `, and ${report.referencePoints} reference point${report.referencePoints === 1 ? "" : "s"}.`
          : ".") +
        (report.skipped > 0
          ? ` ${report.skipped} stayed on ${offer.from} because ${offer.to} already has a row with the same key, so reference points were left alone.`
          : ""),
    });
  };

  // The rows the table shows. Splits and PhaseSequence are dense enough that
  // the diagram's selection narrows the table too.
  const tableRows = (
    view === "splits"
      ? selectedSplits
      : view === "phaseSequence" && activeSeqSignal
        ? coordination.phaseSequence.filter((r) => r.signalId === activeSeqSignal)
        : (coordination[activeEntity.key] ?? [])
  ) as readonly object[];

  const corridorCard = (
    <CorridorOrderCard
      corridors={coordination.corridors}
      corridorSignals={coordination.corridorSignals}
      signals={signals}
      corridorId={activeCorridorId}
      onCorridorChange={setCorridorId}
      labelMode={pinLabel}
      onLabelModeChange={setPinLabel}
      hoveredSignalId={hoveredSignalId}
      onHover={setHoveredSignalId}
      readOnly={readOnly}
      onChanged={refreshCoordination}
    />
  );

  const rawFiles = useMemo(
    () =>
      COORDINATION_ENTITIES.map((e) => ({
        id: e.key,
        label: e.filename,
        content: e.renderFrom(coordination, UNSCOPED),
      })),
    [coordination],
  );

  if (totalRows === 0) {
    return (
      <div className="max-w-6xl">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Waypoints className="h-10 w-10 text-grey-300" />
            <p className="text-sm font-medium text-grey-700">No coordination data yet</p>
            <p className="max-w-md text-xs text-grey-500">
              Import a coordination package &mdash; <code>corridors.txt</code>,{" "}
              <code>Patterns.txt</code>, <code>Splits.txt</code> and the rest &mdash; from{" "}
              <strong>Data Management &rsaquo; Import</strong>. A zip containing them works too.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-grey-500">View</span>
          <Select
            value={view}
            onValueChange={(v) => {
              setView(v as View);
              setNotice(null);
            }}
          >
            <SelectTrigger className="h-8 w-64 text-xs" aria-label="Coordination file">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overview" className="text-xs">
                Overview &amp; validation
              </SelectItem>
              {COORDINATION_ENTITIES.map((e) => (
                <SelectItem key={e.key} value={e.key} className="text-xs">
                  {e.filename} ({coordination[e.key]?.length ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {errors > 0 && (
            <Badge variant="outline" className="border-red-300 text-xs text-red-700">
              {errors} error{errors === 1 ? "" : "s"}
            </Badge>
          )}
          {warnings > 0 && (
            <Badge variant="outline" className="border-amber-300 text-xs text-amber-700">
              {warnings} warning{warnings === 1 ? "" : "s"}
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={() => exportCoordinationAsZip()}
            className="h-8 px-2 text-xs"
          >
            <Download className="mr-1 h-3 w-3" />
            Export package
          </Button>
        </div>
      </div>

      {view === "overview" ? (
        <div className="space-y-3">
          {corridorCard}

          <Card>
            <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
              <CardTitle className="text-base font-semibold text-grey-800">Validation</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <IssueList issues={issues} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
              <CardTitle className="text-base font-semibold text-grey-800">
                Coordination files
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <GTSSFileViewer files={rawFiles} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          {view === "corridorSignals" && coordination.corridors.length > 0 && corridorCard}

          {view === "phaseSequence" && coordination.phaseSequence.length > 0 && (
            <PhaseSequenceCard
              phaseSequence={coordination.phaseSequence}
              patternSignals={coordination.patternSignals}
              corridorSignalIds={corridorSignalIds}
              signalId={activeSeqSignal}
              onSignalChange={setSeqSignal}
            />
          )}

          {view === "schedule" && coordination.schedule.length > 0 && (
            <ScheduleCalendar
              coordination={coordination}
              corridorId={activeCorridorId}
              onCorridorChange={setCorridorId}
            />
          )}

          {view === "patternSignals" && tsPatterns.length > 0 && (
            <Card>
              <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-grey-800">
                    <GitBranch className="h-4 w-4 text-primary-600" />
                    Time&ndash;space
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-grey-600">
                      <Checkbox
                        checked={showTrajectories}
                        onCheckedChange={(c) => setShowTrajectories(c as boolean)}
                        aria-label="Show vehicle trajectories"
                      />
                      Trajectories
                    </label>
                    <Select
                      value={trajectoryMode}
                      onValueChange={(v) => setTrajectoryMode(v as TrajectoryMode)}
                      disabled={!showTrajectories}
                    >
                      <SelectTrigger className="h-7 w-36 text-xs" aria-label="Vehicle path style">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stop-at-red" className="text-xs">
                          Stop at red
                        </SelectItem>
                        <SelectItem value="green-wave" className="text-xs">
                          Green wave only
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-xs text-grey-600">
                      Speed
                      <Input
                        type="number"
                        min={1}
                        value={speed}
                        onChange={(e) => setSpeed(e.target.value)}
                        aria-label={`Travel speed in ${isMetric ? "km/h" : "mph"}`}
                        className="h-7 w-16 px-1 text-xs"
                      />
                      <span className="text-grey-400">{isMetric ? "km/h" : "mph"}</span>
                    </label>
                    <Select value={activeTsPattern} onValueChange={setTsPattern}>
                      <SelectTrigger className="h-7 w-44 text-xs" aria-label="Time-space pattern">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tsPatterns.map((id) => (
                          <SelectItem key={id} value={id} className="text-xs">
                            {id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          disabled={!offsetHistory.canUndo}
                          onClick={undoOffset}
                          aria-label="Undo offset change"
                          title={
                            offsetHistory.nextUndo
                              ? `Undo: ${offsetHistory.nextUndo.signalId} offset back to ${showOffset(offsetHistory.nextUndo.from)} (Ctrl/\u2318+Z)`
                              : "Nothing to undo"
                          }
                          className="h-7 px-2 text-xs"
                        >
                          <Undo2 className="mr-1 h-3 w-3" />
                          Undo
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!offsetHistory.canRedo}
                          onClick={redoOffset}
                          aria-label="Redo offset change"
                          title={
                            offsetHistory.nextRedo
                              ? `Redo: ${offsetHistory.nextRedo.signalId} offset to ${showOffset(offsetHistory.nextRedo.to)} (Shift+Ctrl/\u2318+Z)`
                              : "Nothing to redo"
                          }
                          className="h-7 px-2 text-xs"
                        >
                          <Redo2 className="mr-1 h-3 w-3" />
                          Redo
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <TimeSpaceDiagram
                  stops={tsStops}
                  cycleLengthS={tsPatternRow?.cycleLengthS ?? 0}
                  showTrajectories={showTrajectories}
                  trajectoryMode={trajectoryMode}
                  speedMps={speedMps}
                  isMetric={isMetric}
                  highlightedSignalId={hoveredSignalId}
                  editable={!readOnly}
                  onOffsetChange={(signalId, offsetS, options) =>
                    commitOffset(activeTsPattern, signalId, offsetS, options.coalesce)
                  }
                />

                {!readOnly && (
                  <div
                    role="status"
                    className="flex items-center gap-2 border-t border-grey-200 bg-grey-50 px-3 py-1.5 text-xs text-grey-600"
                  >
                    <span className="min-w-0 flex-1">
                      {offsetStatus ??
                        "Drag a signal\u2019s green sideways to change its offset, or focus its row and use the arrow keys (Shift for 5 s)."}
                    </span>
                    {offsetHistory.canUndo && (
                      <Button
                        variant="outline"
                        onClick={undoOffset}
                        className="h-6 bg-white px-2 text-[11px]"
                      >
                        <Undo2 className="mr-1 h-3 w-3" />
                        Undo
                      </Button>
                    )}
                  </div>
                )}

                {/* Offsets, adjustable against the diagram above. Nudging by a
                    second redraws immediately, which is the point: you are
                    tuning the band, not editing a number in isolation. */}
                <div className="flex flex-wrap gap-2 border-t border-grey-200 p-3">
                  {tsStops.map((stop) => (
                    <div
                      key={stop.signalId}
                      onMouseEnter={() => setHoveredSignalId(stop.signalId)}
                      onMouseLeave={() => setHoveredSignalId(null)}
                      className="flex items-center gap-1 rounded border border-grey-200 px-2 py-1"
                    >
                      <span className="font-mono text-[11px] text-grey-700">{stop.signalId}</span>
                      {stop.free ? (
                        <span className="text-[11px] italic text-grey-400">free</span>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            disabled={readOnly}
                            onClick={() => setOffset(stop.signalId, stop.offsetS - 1)}
                            aria-label={`Decrease ${stop.signalId} offset`}
                            className="h-5 w-5 p-0 text-xs"
                          >
                            &minus;
                          </Button>
                          <Input
                            type="number"
                            value={stop.offsetS}
                            readOnly={readOnly}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (Number.isFinite(n)) setOffset(stop.signalId, n);
                            }}
                            aria-label={`${stop.signalId} offset in seconds`}
                            className="h-6 w-14 px-1 text-center text-xs"
                          />
                          <Button
                            variant="ghost"
                            disabled={readOnly}
                            onClick={() => setOffset(stop.signalId, stop.offsetS + 1)}
                            aria-label={`Increase ${stop.signalId} offset`}
                            className="h-5 w-5 p-0 text-xs"
                          >
                            +
                          </Button>
                          <span className="text-[10px] text-grey-400">s</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {view === "splits" && splitPatterns.length > 0 && (
            <Card>
              <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base font-semibold text-grey-800">
                    Ring &amp; barrier
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={activeSplitPattern} onValueChange={setSplitPattern}>
                      <SelectTrigger className="h-7 w-44 text-xs" aria-label="Pattern">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {splitPatterns.map((id) => (
                          <SelectItem key={id} value={id} className="text-xs">
                            {id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={activeSplitSignal} onValueChange={setSplitSignal}>
                      <SelectTrigger className="h-7 w-36 text-xs" aria-label="Signal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {splitSignals.map((id) => (
                          <SelectItem key={id} value={id} className="text-xs">
                            {id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <RingBarrierChart
                  splits={selectedSplits}
                  phaseSequence={selectedSignalSequence}
                  cycleLengthS={selectedCycle}
                  signalId={activeSplitSignal}
                  patternId={activeSplitPattern}
                />
                {sequenceCaption && (
                  <p className="px-3 pb-2 text-[11px] text-grey-500">{sequenceCaption}</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
              <CardTitle className="text-base font-semibold text-grey-800">
                {COORDINATION_ENTITIES.find((e) => e.key === view)?.filename} ({tableRows.length})
              </CardTitle>
            </CardHeader>
            {notice && notice.view === view && (
              <SignalNoticeBar
                notice={notice}
                remaining={
                  notice.offer
                    ? (coordination[notice.offer.file] as readonly { signalId: string }[]).filter(
                        (r) => r.signalId === notice.offer?.from,
                      ).length
                    : 0
                }
                filename={activeEntity.filename}
                onRestOfFile={changeRestOfFile}
                onEverywhere={changeEverywhere}
                onDismiss={() => setNotice(null)}
              />
            )}
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-grey-50">
                    <TableRow>
                      {TABLE_COLUMNS[view].map((col) => (
                        <TableHead key={col.key} className="h-8 px-2 text-xs font-medium">
                          {col.label}
                        </TableHead>
                      ))}
                      {!readOnly && <TableHead className="h-8 w-10 px-2" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableRows.map((row) => {
                      const rowId = activeEntity.identityOf(row);
                      return (
                        <TableRow key={rowId} className="text-xs">
                          {TABLE_COLUMNS[view].map((col) => (
                            <TableCell key={col.key} className="px-2 py-1">
                              <CoordinationCell
                                value={readField(row, col.key)}
                                locked={
                                  activeEntity.keyFields.includes(col.key) &&
                                  !isOperationColumn(view, col.key)
                                }
                                type={col.type ?? "text"}
                                label={
                                  !isOperationColumn(view, col.key)
                                    ? col.label
                                    : col.key === "sequence"
                                      ? `${col.label} (position)`
                                      : `${col.label} (this row)`
                                }
                                readOnly={readOnly}
                                onCommit={(next) => {
                                  if (isOperationColumn(view, col.key)) {
                                    if (col.key === "sequence") {
                                      // `view` narrowed this to corridorSignals.
                                      moveStopTo(row as CorridorSignal, next);
                                    } else {
                                      changeRowSignal(row, next);
                                    }
                                    return;
                                  }
                                  if (view === "patternSignals" && col.key === "offsetS") {
                                    // Through the same door as the diagram, so undo covers it.
                                    const ps = row as PatternSignal;
                                    commitOffset(
                                      ps.patternId,
                                      ps.signalId,
                                      typeof next === "number" ? next : null,
                                    );
                                    return;
                                  }
                                  activeEntity.updateRow(rowId, { [col.key]: next });
                                  refreshCoordination();
                                }}
                              />
                            </TableCell>
                          ))}
                          {!readOnly && (
                            <TableCell className="px-2 py-1">
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  activeEntity.deleteRow(rowId);
                                  refreshCoordination();
                                }}
                                aria-label={`Delete row ${rowId}`}
                                className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
