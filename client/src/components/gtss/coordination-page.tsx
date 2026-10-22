import CoordinationCell, { type CellType } from "@/components/gtss/coordination-cell";
import CorridorsMap from "@/components/gtss/corridors-map";
import TimeSpaceDiagram, { buildStops } from "@/components/gtss/time-space-diagram";
import RingBarrierChart from "@/components/gtss/ring-barrier-chart";
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
  summarizeIssues,
  UNSCOPED,
  useGTSSStore,
  validateCoordination,
  type CoordinationIssue,
} from "gtss";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  GitBranch,
  Route,
  Trash2,
  Waypoints,
} from "lucide-react";
import { useMemo, useState } from "react";

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

/** Read one declared column off a row. The eight row types have no index
 *  signature, so the cast is contained here rather than claiming every row is
 *  a Record<string, unknown>. */
const readField = (row: object, key: string): unknown => (row as Record<string, unknown>)[key];

const cell = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return <span className="text-grey-400">&mdash;</span>;
  }
  return String(value);
};

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
  const [splitPattern, setSplitPattern] = useState<string>("");
  const [tsPattern, setTsPattern] = useState<string>("");
  const [showTrajectories, setShowTrajectories] = useState(true);
  // Display units; converted to m/s for the geometry.
  const [speed, setSpeed] = useState<string>("30");
  const [splitSignal, setSplitSignal] = useState<string>("");

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
  const corridorMembers = useMemo(
    () => coordination.corridorSignals.filter((cs) => cs.corridorId === activeCorridorId),
    [coordination.corridorSignals, activeCorridorId],
  );

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
  const selectedSignalSequence = coordination.phaseSequence.filter(
    (r) => r.signalId === activeSplitSignal,
  );
  const selectedCycle =
    coordination.patterns.find((p) => p.patternId === activeSplitPattern)?.cycleLengthS ?? null;

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

  const patternSignalsEntity = COORDINATION_ENTITIES.find((e) => e.key === "patternSignals")!;

  const setOffset = (signalId: string, next: number) => {
    const row = coordination.patternSignals.find(
      (ps) => ps.patternId === activeTsPattern && ps.signalId === signalId,
    );
    if (!row) return;
    patternSignalsEntity.updateRow(patternSignalsEntity.identityOf(row), { offsetS: next });
    refreshCoordination();
  };

  const activeEntity =
    COORDINATION_ENTITIES.find((e) => e.key === view) ?? COORDINATION_ENTITIES[0];

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
          <Select value={view} onValueChange={(v) => setView(v as View)}>
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
          <Card>
            <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-grey-800">
                  <Route className="h-4 w-4 text-primary-600" />
                  Corridor
                </CardTitle>
                {coordination.corridors.length > 1 && (
                  <Select value={activeCorridorId} onValueChange={setCorridorId}>
                    <SelectTrigger className="h-7 w-56 text-xs" aria-label="Corridor">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {coordination.corridors.map((c) => (
                        <SelectItem key={c.corridorId} value={c.corridorId} className="text-xs">
                          {c.corridorId}
                          {c.name ? ` — ${c.name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-3">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                <CorridorsMap
                  corridorSignals={corridorMembers}
                  signals={signals}
                  highlightedSignalId={hoveredSignalId}
                  className="h-[360px] w-full"
                />
                <div className="max-h-[360px] overflow-y-auto rounded-lg border border-grey-200">
                  <Table>
                    <TableHeader className="sticky top-0 bg-grey-50">
                      <TableRow>
                        <TableHead className="h-8 px-2 text-xs">Seq</TableHead>
                        <TableHead className="h-8 px-2 text-xs">Signal</TableHead>
                        <TableHead className="h-8 px-2 text-xs">Dir</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...corridorMembers]
                        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
                        .map((cs) => (
                          <TableRow
                            key={`${cs.corridorId}-${cs.sequence}-${cs.signalId}`}
                            onMouseEnter={() => setHoveredSignalId(cs.signalId)}
                            onMouseLeave={() => setHoveredSignalId(null)}
                            className="text-xs"
                          >
                            <TableCell className="px-2 py-1 font-mono">
                              {cell(cs.sequence)}
                            </TableCell>
                            <TableCell className="px-2 py-1 font-medium">{cs.signalId}</TableCell>
                            <TableCell className="px-2 py-1">{cell(cs.direction)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

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
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <TimeSpaceDiagram
                  stops={tsStops}
                  cycleLengthS={tsPatternRow?.cycleLengthS ?? 0}
                  showTrajectories={showTrajectories}
                  speedMps={speedMps}
                  isMetric={isMetric}
                  highlightedSignalId={hoveredSignalId}
                />

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
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
              <CardTitle className="text-base font-semibold text-grey-800">
                {COORDINATION_ENTITIES.find((e) => e.key === view)?.filename} (
                {view === "splits" ? selectedSplits.length : (coordination[view]?.length ?? 0)})
              </CardTitle>
            </CardHeader>
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
                    {(view === "splits"
                      ? (selectedSplits as readonly object[])
                      : (coordination[view] as readonly object[])
                    ).map((row) => {
                      const rowId = activeEntity.identityOf(row);
                      return (
                        <TableRow key={rowId} className="text-xs">
                          {TABLE_COLUMNS[view].map((col) => (
                            <TableCell key={col.key} className="px-2 py-1">
                              <CoordinationCell
                                value={readField(row, col.key)}
                                locked={activeEntity.keyFields.includes(col.key)}
                                type={col.type ?? "text"}
                                label={col.label}
                                readOnly={readOnly}
                                onCommit={(next) => {
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
