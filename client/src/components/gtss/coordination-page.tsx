import CoordinationCell, { type CellType } from "@/components/gtss/coordination-cell";
import CorridorOrderCard, { type CorridorNotice } from "@/components/gtss/corridor-order-card";
import NewCorridorDialog from "@/components/gtss/new-corridor-dialog";
import type { PinLabelMode } from "@/components/gtss/corridors-map";
import CorridorsOverviewMap from "@/components/gtss/corridors-overview-map";
import CycleFitCard from "@/components/gtss/cycle-fit-card";
import TimeSpaceDiagram, {
  buildStops,
  type TimeSpaceStop,
} from "@/components/gtss/time-space-diagram";
import { useOffsetHistory } from "@/hooks/use-offset-history";
import PhaseSequenceCard from "@/components/gtss/phase-sequence-card";
import ProgressionPanel from "@/components/gtss/progression-panel";
import SplitBuilderCard from "@/components/gtss/split-builder-card";
import ScheduleCalendar from "@/components/gtss/schedule-calendar";
import { GTSSFileText } from "@/components/gtss/gtss-file-viewer";
import { useCoordinationIssues } from "@/hooks/use-coordination-issues";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  moveCorridorSignal,
  OFFSET_REFERENCES,
  renameSignalInCoordination,
  reverseDirection,
  isFreePattern,
  setPatternOffsetReference,
  sortBySequence,
  splitStartShift,
  undoReferenceChange,
  summarizeIssues,
  UNSCOPED,
  useGTSSStore,
  type CoordinationKey,
  type ParsedCoordination,
  type CorridorSignal,
  type OffsetReference,
  type PatternSignal,
  type ReferenceChange,
  type TrajectoryMode,
} from "gtss";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  GitBranch,
  Info,
  Redo2,
  Trash2,
  Undo2,
  Waypoints,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** One page per file. */
type View = CoordinationKey;

/** Columns rendered for each file, in the order the spec declares them. */
type Column = { key: string; label: string; type?: CellType };

// Keyed by file so a file added to or dropped from the registry fails to compile here.
const TABLE_COLUMNS: Record<CoordinationKey, readonly Column[]> = {
  corridors: [
    { key: "corridorId", label: "Corridor" },
    { key: "name", label: "Name" },
    { key: "primaryDirection", label: "Direction" },
    { key: "description", label: "Description" },
    { key: "referenceClock", label: "Clock" },
    { key: "timezone", label: "Timezone" },
  ],
  corridorSignals: [
    { key: "corridorId", label: "Corridor" },
    { type: "number", key: "sequence", label: "Seq" },
    { key: "signalId", label: "Signal" },
    { key: "direction", label: "Direction" },
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
    { key: "corridorId", label: "Corridor" },
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
    { key: "progression", label: "Progression" },
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

/**
 * Coordination: import, view and validate. Read-only in this release — nothing
 * here creates, changes or deletes a row.
 */
interface CoordinationPageProps {
  /** The file to open on, e.g. when coming from Validation. Defaults to corridors.txt. */
  initialView?: CoordinationKey;
  /** Show the validation results (in Data Management). */
  onOpenValidation?: () => void;
}

export default function CoordinationPage({
  initialView,
  onOpenValidation,
}: CoordinationPageProps = {}) {
  const { coordination, signals, phases, approaches, basicTimings, agencies, refreshCoordination } =
    useGTSSStore();
  // Lookup mode blocks writes at the storage layer; reflect that in the UI
  // instead of offering edits that silently no-op.
  const readOnly = isStorageReadOnly();
  const [view, setView] = useState<View>(initialView ?? "corridors");
  const [showOnlyTableRows, setShowOnlyTableRows] = useState(false);
  const rowCount = (n: number) => `${n} row${n === 1 ? "" : "s"}`;
  const [corridorId, setCorridorId] = useState<string>("");
  const [hoveredSignalId, setHoveredSignalId] = useState<string | null>(null);
  const [pinLabel, setPinLabel] = useState<PinLabelMode>("sequence");
  const [splitPattern, setSplitPattern] = useState<string>("");
  const [tsPattern, setTsPattern] = useState<string>("");
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [showOpposite, setShowOpposite] = useState(true);
  const [trajectoryMode, setTrajectoryMode] = useState<TrajectoryMode>("stop-at-red");
  // Display units; converted to m/s for the geometry.
  const [splitSignal, setSplitSignal] = useState<string>("");
  // PhaseSequence view: "" shows every signal.
  const [seqSignal, setSeqSignal] = useState<string>("");
  const [notice, setNotice] = useState<SignalNotice | null>(null);
  const [newCorridorOpen, setNewCorridorOpen] = useState(false);
  const [corridorNotice, setCorridorNotice] = useState<CorridorNotice | null>(null);
  // The last offset-reference change, kept so it can be undone or turned into
  // "keep the greens where they were".
  const [referenceNotice, setReferenceNotice] = useState<{
    change: ReferenceChange;
    /** The stops as drawn before the change. */
    before: readonly TimeSpaceStop[];
    keptGreens: boolean;
  } | null>(null);
  // What corridors and their coordination rows are built from.
  const gtssData = useMemo(
    () => ({ signals, phases, approaches, basicTimings }),
    [signals, phases, approaches, basicTimings],
  );
  const splitGtss = useMemo(
    () => ({ phases, approaches, basicTimings }),
    [phases, approaches, basicTimings],
  );

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

  // Shown on the tabs and the validation button; the full list is in Data Management.
  const issues = useCoordinationIssues();
  const { errors, warnings } = summarizeIssues(issues);

  const totalRows = COORDINATION_ENTITIES.reduce(
    (sum, e) => sum + (coordination[e.key]?.length ?? 0),
    0,
  );

  const activeCorridorId = corridorId || coordination.corridors[0]?.corridorId || "";

  // Splits are the one file dense enough to need narrowing: 100 rows across
  // patterns and signals is unusable to scan, let alone edit. Patterns come
  // from Patterns.txt rather than from Splits.txt, so a pattern with no splits
  // yet can have them built.
  const splitPatterns = Array.from(
    new Set([
      ...coordination.patterns.filter((p) => !isFreePattern(p)).map((p) => p.patternId),
      ...coordination.splits.map((r) => r.patternId),
    ]),
  ).sort();
  const activeSplitPattern = splitPatterns.includes(splitPattern)
    ? splitPattern
    : (splitPatterns[0] ?? "");
  const splitSignals = Array.from(
    new Set(
      coordination.splits.filter((r) => r.patternId === activeSplitPattern).map((r) => r.signalId),
    ),
  ).sort();
  // The pattern's signals: its corridor's in order, then any others it has rows for.
  const splitSignalOptions = (() => {
    const corridorOfPattern =
      coordination.patterns.find((p) => p.patternId === activeSplitPattern)?.corridorId ?? null;
    const order = sortBySequence(
      coordination.corridorSignals.filter((cs) => cs.corridorId === corridorOfPattern),
    ).map((cs) => cs.signalId);
    const others = [
      ...coordination.patternSignals
        .filter((ps) => ps.patternId === activeSplitPattern)
        .map((ps) => ps.signalId),
      ...splitSignals,
    ].filter((id) => !order.includes(id));
    return Array.from(new Set([...order, ...others])).map((signalId) => ({
      signalId,
      hasSplits: splitSignals.includes(signalId),
    }));
  })();
  // The same signals in corridor order, then any outside the corridor.
  const splitSignalsInOrder = splitSignalOptions.filter((o) => o.hasSplits).map((o) => o.signalId);
  const activeSplitSignal = splitSignalOptions.some((o) => o.signalId === splitSignal)
    ? splitSignal
    : (splitSignalsInOrder[0] ?? splitSignalOptions[0]?.signalId ?? "");
  const selectedSplits = coordination.splits.filter(
    (r) => r.patternId === activeSplitPattern && r.signalId === activeSplitSignal,
  );

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

  // Speeds come from each approach's posted speed in GTSS. This is only for a
  // stretch where neither direction has one: 30 mph, or 50 km/h.
  const defaultSpeedMps = isMetric ? 50 / 3.6 : 30 * 0.44704;

  const tsStops = useMemo(
    () =>
      buildStops({
        corridorSignals: coordination.corridorSignals.filter(
          (cs) => cs.corridorId === tsCorridorId,
        ),
        signals,
        patternSignals: coordination.patternSignals.filter(
          (ps) => ps.patternId === activeTsPattern,
        ),
        splits: coordination.splits.filter((sp) => sp.patternId === activeTsPattern),
        phaseSequence: coordination.phaseSequence,
        pattern: tsPatternRow,
        basicTimings,
        phases,
        approaches,
        defaultSpeedMps,
        isMetricFor: isMetricForSignalId,
      }),
    [
      coordination,
      signals,
      phases,
      approaches,
      basicTimings,
      tsCorridorId,
      tsPatternRow,
      activeTsPattern,
      defaultSpeedMps,
    ],
  );

  // What the pattern's offsets are measured to; blank when its signals disagree.
  const tsReference: OffsetReference | "" = (() => {
    const refs = new Set(tsStops.filter((s) => !s.free).map((s) => s.offsetReference));
    if (refs.size === 0) return "BegGreen";
    return refs.size === 1 ? Array.from(refs)[0] : "";
  })();
  const tsReferenceAssumed =
    tsStops.some((s) => !s.free) &&
    tsStops.every((s) => s.free || s.offsetReferenceSource === "default");

  const changeReference = (reference: OffsetReference) => {
    if (!activeTsPattern) return;
    const change = setPatternOffsetReference(activeTsPattern, reference);
    if (!change) return;
    refreshCoordination();
    setReferenceNotice({ change, before: tsStops, keptGreens: false });
  };

  // Rewrite the offsets so each green starts where it did before the change.
  const keepGreensInPlace = () => {
    if (!referenceNotice) return;
    const { change, before } = referenceNotice;
    const cycle =
      coordination.patterns.find((p) => p.patternId === change.patternId)?.cycleLengthS ?? 0;
    const offsets = new Map(
      before
        .filter((s) => !s.free)
        .map((s) => {
          const stored = Math.round(
            s.offsetS - splitStartShift(change.reference, s.greenS, s.clearanceS),
          );
          return [s.signalId, cycle > 0 ? ((stored % cycle) + cycle) % cycle : stored] as const;
        }),
    );
    undoReferenceChange(change);
    const redone = setPatternOffsetReference(change.patternId, change.reference, offsets);
    refreshCoordination();
    if (redone) setReferenceNotice({ change: redone, before, keptGreens: true });
  };

  const undoReference = () => {
    if (!referenceNotice) return;
    undoReferenceChange(referenceNotice.change);
    refreshCoordination();
    setReferenceNotice(null);
  };
  const referenceName = (r: OffsetReference) =>
    OFFSET_REFERENCES.find((o) => o.value === r)?.label.toLowerCase() ?? r;

  // The corridor's direction and its reverse, to name the two bands.
  const tsCorridor = coordination.corridors.find((c) => c.corridorId === tsCorridorId);
  const tsForward =
    tsCorridor?.primaryDirection ??
    coordination.corridorSignals.find((cs) => cs.corridorId === tsCorridorId)?.direction ??
    null;
  const tsDirections = { forward: tsForward, opposite: reverseDirection(tsForward) };

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
          .map((f) =>
            (TABLE_COLUMNS[activeEntity.key].find((c) => c.key === f)?.label ?? f).toLowerCase(),
          ),
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

  // The active file as text: the whole of it, or just the rows the table shows
  // where the page narrows it (Splits and PhaseSequence follow their diagrams).
  const narrowed = tableRows.length !== (coordination[activeEntity.key] ?? []).length;
  const fileText = {
    id: activeEntity.key,
    label: activeEntity.filename,
    content:
      showOnlyTableRows && narrowed
        ? activeEntity.renderFrom(
            { [activeEntity.key]: tableRows } as unknown as ParsedCoordination,
            UNSCOPED,
          )
        : activeEntity.renderFrom(coordination, UNSCOPED),
  };

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
      coordination={coordination}
      gtss={gtssData}
      onNewCorridor={() => setNewCorridorOpen(true)}
      notice={corridorNotice}
      onNotice={setCorridorNotice}
    />
  );

  const newCorridorDialog = (
    <NewCorridorDialog
      open={newCorridorOpen}
      onOpenChange={setNewCorridorOpen}
      gtss={gtssData}
      coordination={coordination}
      timezoneOf={(agencyId) =>
        (agencies.find((a) => a.agencyId === agencyId) ?? agencies[0])?.agencyTimezone ?? null
      }
      onCreated={(id, notes) => {
        refreshCoordination();
        setCorridorId(id);
        setView("corridorSignals");
        setCorridorNotice({ tone: "info", lines: [`Created corridor ${id}.`, ...notes] });
      }}
    />
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
            {!readOnly && signals.length > 0 && (
              <>
                <p className="text-xs text-grey-500">Or start one from your GTSS signals:</p>
                <Button onClick={() => setNewCorridorOpen(true)} className="h-8 text-xs">
                  New corridor
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        {newCorridorDialog}
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-3">
      {newCorridorDialog}
      <Tabs
        value={view}
        onValueChange={(v) => {
          setView(v as View);
          setNotice(null);
          setShowOnlyTableRows(false);
        }}
        className="space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* One tab per file; scrolls sideways rather than wrapping on a narrow screen. */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            <TabsList
              aria-label="Coordination files"
              className="h-auto w-max justify-start gap-0.5"
            >
              {COORDINATION_ENTITIES.map((e) => {
                const fileIssues = issues.filter((i) => i.scope === e.key);
                const fileErrors = fileIssues.filter((i) => i.level === "error").length;
                return (
                  <TabsTrigger
                    key={e.key}
                    value={e.key}
                    className="px-2.5 py-1 text-xs"
                    title={
                      fileIssues.length
                        ? `${e.filename}: ${rowCount(coordination[e.key]?.length ?? 0)}, ${fileIssues.length} to check`
                        : `${e.filename}: ${rowCount(coordination[e.key]?.length ?? 0)}`
                    }
                  >
                    {e.filename}
                    <span className="ml-1 font-normal text-grey-400">
                      {coordination[e.key]?.length ?? 0}
                    </span>
                    {fileIssues.length > 0 && (
                      <span
                        className={`ml-1 h-1.5 w-1.5 rounded-full ${fileErrors > 0 ? "bg-red-500" : "bg-amber-500"}`}
                        aria-label={`${fileIssues.length} to check`}
                      />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* The full list lives in Data Management; this says whether to go and look. */}
            <Button
              variant="outline"
              onClick={onOpenValidation}
              disabled={!onOpenValidation}
              title="See every problem validation finds, file by file, in Data Management"
              className={`h-8 px-2 text-xs ${
                errors > 0
                  ? "border-red-300 text-red-700"
                  : warnings > 0
                    ? "border-amber-300 text-amber-700"
                    : "text-green-700"
              }`}
            >
              {errors + warnings === 0 ? (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              ) : (
                <AlertTriangle className="mr-1 h-3 w-3" />
              )}
              {errors + warnings === 0
                ? "No problems"
                : [
                    errors ? `${errors} error${errors === 1 ? "" : "s"}` : "",
                    warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "",
                  ]
                    .filter(Boolean)
                    .join(", ")}
            </Button>
          </div>
        </div>

        <TabsContent value={view} className="mt-0">
          <div className="space-y-3">
            {/* Every corridor at once on corridors.txt; one corridor, in order, on corridorSignals.txt. */}
            {view === "corridors" && coordination.corridors.length > 0 && (
              <CorridorsOverviewMap
                corridors={coordination.corridors}
                corridorSignals={coordination.corridorSignals}
                signals={signals}
                onOpenCorridor={(id) => {
                  setCorridorId(id);
                  setView("corridorSignals");
                }}
                onNewCorridor={readOnly ? undefined : () => setNewCorridorOpen(true)}
              />
            )}
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
                      <label className="flex items-center gap-1.5 text-xs text-grey-600">
                        <Checkbox
                          checked={showOpposite}
                          disabled={!showTrajectories}
                          onCheckedChange={(c) => setShowOpposite(c as boolean)}
                          aria-label="Show opposite direction"
                        />
                        Opposite direction
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
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-grey-500">Offset ref.</span>
                        <Select
                          value={tsReference}
                          onValueChange={(v) => changeReference(v as OffsetReference)}
                          disabled={readOnly || !activeTsPattern}
                        >
                          <SelectTrigger
                            className="h-7 w-36 text-xs"
                            aria-label="Offset reference"
                            title={
                              tsReferenceAssumed
                                ? "The files don't say what offsets are measured to, so begin of green is assumed. Pick one to write it to the pattern."
                                : "What each offset is measured to in the coordinated phase"
                            }
                          >
                            <SelectValue placeholder="Mixed" />
                          </SelectTrigger>
                          <SelectContent>
                            {OFFSET_REFERENCES.map((r) => (
                              <SelectItem key={r.value} value={r.value} className="text-xs">
                                {r.label}
                                {tsReferenceAssumed && r.value === "BegGreen" ? " (assumed)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
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
                    showOpposite={showOpposite}
                    trajectoryMode={trajectoryMode}
                    defaultSpeedMps={defaultSpeedMps}
                    isMetric={isMetric}
                    directions={tsDirections}
                    highlightedSignalId={hoveredSignalId}
                    editable={!readOnly}
                    onOffsetChange={(signalId, offsetS, options) =>
                      commitOffset(activeTsPattern, signalId, offsetS, options.coalesce)
                    }
                  />

                  {!readOnly &&
                    referenceNotice &&
                    referenceNotice.change.patternId === activeTsPattern && (
                      <div
                        role="status"
                        className="flex flex-wrap items-center gap-2 border-t border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900"
                      >
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          {referenceNotice.change.patternId} offsets are now measured to{" "}
                          {referenceName(referenceNotice.change.reference)}.{" "}
                          {referenceNotice.keptGreens
                            ? "Each offset was changed so its green stays where it was."
                            : "The numbers are unchanged, so any green whose reference moved has moved with it."}
                        </span>
                        {!referenceNotice.keptGreens && (
                          <Button
                            variant="outline"
                            onClick={keepGreensInPlace}
                            className="h-6 bg-white px-2 text-[11px]"
                          >
                            Keep greens in place
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          onClick={undoReference}
                          className="h-6 bg-white px-2 text-[11px]"
                        >
                          <Undo2 className="mr-1 h-3 w-3" />
                          Undo
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setReferenceNotice(null)}
                          aria-label="Dismiss"
                          className="h-6 w-6 p-0"
                        >
                          &times;
                        </Button>
                      </div>
                    )}
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
                  <ProgressionPanel
                    coordination={coordination}
                    patternId={activeTsPattern}
                    corridorId={tsCorridorId}
                    forwardDirection={tsForward}
                    signals={signals}
                    gtss={splitGtss}
                    readOnly={readOnly}
                    onChanged={refreshCoordination}
                  />
                </CardContent>
              </Card>
            )}

            {view === "splits" && (
              <SplitBuilderCard
                coordination={coordination}
                gtss={splitGtss}
                patternId={activeSplitPattern}
                patternOptions={splitPatterns}
                onPatternChange={setSplitPattern}
                signalId={activeSplitSignal}
                signalOptions={splitSignalOptions}
                onSignalChange={setSplitSignal}
                readOnly={readOnly}
                onChanged={refreshCoordination}
              />
            )}

            {view === "splits" && activeSplitPattern && (
              <CycleFitCard
                key={activeSplitPattern}
                coordination={coordination}
                patternId={activeSplitPattern}
                signalIds={splitSignalsInOrder}
                readOnly={readOnly}
                onChanged={refreshCoordination}
              />
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

            {/* The file itself, as it will be exported. */}
            <Card>
              <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-grey-800">
                  <FileText className="h-4 w-4 text-primary-600" />
                  {activeEntity.filename}
                  <span className="text-xs font-normal text-grey-500">as a text file</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <GTSSFileText
                  file={fileText}
                  heightClass="h-72"
                  download
                  caption={
                    showOnlyTableRows && narrowed
                      ? `The ${tableRows.length} rows in the table above, with the file's header.`
                      : `The whole file: ${rowCount((coordination[activeEntity.key] ?? []).length)} and a header, as Export writes it.`
                  }
                  actions={
                    narrowed ? (
                      <label className="flex items-center gap-1.5 text-xs text-grey-600">
                        <Checkbox
                          checked={showOnlyTableRows}
                          onCheckedChange={(c) => setShowOnlyTableRows(c === true)}
                          aria-label="Only the rows in the table above"
                        />
                        Only the rows above
                      </label>
                    ) : null
                  }
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
