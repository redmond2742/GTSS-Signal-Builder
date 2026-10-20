import CorridorsMap from "@/components/gtss/corridors-map";
import GTSSFileViewer from "@/components/gtss/gtss-file-viewer";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  COORDINATION_ENTITIES,
  exportCoordinationAsZip,
  summarizeIssues,
  UNSCOPED,
  useGTSSStore,
  validateCoordination,
  type CoordinationIssue,
} from "gtss";
import { AlertTriangle, CheckCircle2, Download, Route, Waypoints } from "lucide-react";
import { useMemo, useState } from "react";

/** The sub-views: an overview plus one per file. */
type View = "overview" | (typeof COORDINATION_ENTITIES)[number]["key"];

/** Columns rendered for each file, in the order the spec declares them. */
const TABLE_COLUMNS: Record<string, readonly { key: string; label: string }[]> = {
  corridors: [
    { key: "corridorId", label: "Corridor" },
    { key: "name", label: "Name" },
    { key: "primaryDirection", label: "Direction" },
    { key: "description", label: "Description" },
  ],
  corridorSignals: [
    { key: "corridorId", label: "Corridor" },
    { key: "sequence", label: "Seq" },
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
    { key: "patternNumber", label: "No." },
    { key: "corridorId", label: "Corridor" },
    { key: "cycleLengthS", label: "Cycle (s)" },
    { key: "referencePoint", label: "Reference" },
    { key: "description", label: "Description" },
  ],
  patternSignals: [
    { key: "patternId", label: "Pattern" },
    { key: "signalId", label: "Signal" },
    { key: "offsetS", label: "Offset (s)" },
    { key: "coordinatedPhase", label: "Coord. phase" },
    { key: "notes", label: "Notes" },
  ],
  splits: [
    { key: "patternId", label: "Pattern" },
    { key: "signalId", label: "Signal" },
    { key: "phaseId", label: "Phase" },
    { key: "splitS", label: "Split (s)" },
  ],
  schedule: [
    { key: "scheduleId", label: "Schedule" },
    { key: "dayType", label: "Day type" },
    { key: "startTime", label: "Start" },
    { key: "endTime", label: "End" },
    { key: "patternId", label: "Pattern" },
    { key: "priority", label: "Priority" },
  ],
  phaseSequence: [
    { key: "signalId", label: "Signal" },
    { key: "sequenceId", label: "Sequence" },
    { key: "ring", label: "Ring" },
    { key: "position", label: "Pos" },
    { key: "phaseId", label: "Phase" },
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
  const { coordination, signals } = useGTSSStore();
  const [view, setView] = useState<View>("overview");
  const [corridorId, setCorridorId] = useState<string>("");
  const [hoveredSignalId, setHoveredSignalId] = useState<string | null>(null);

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
        <Card>
          <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
            <CardTitle className="text-base font-semibold text-grey-800">
              {COORDINATION_ENTITIES.find((e) => e.key === view)?.filename} (
              {coordination[view]?.length ?? 0})
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(coordination[view] as readonly object[]).map((row, i) => (
                    <TableRow key={i} className="text-xs">
                      {TABLE_COLUMNS[view].map((col) => (
                        <TableCell key={col.key} className="px-2 py-1">
                          {cell(readField(row, col.key))}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
