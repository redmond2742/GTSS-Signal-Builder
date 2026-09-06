import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import type { BasicTiming, Phase } from "@shared/schema";
import { useBasicTimings } from "gtss";
import { Save, X } from "lucide-react";
import { useMemo, useState } from "react";

// Importable timing fields and how to coerce a pasted cell into a stored value.
type FieldKind = "phase" | "number" | "recall" | "bool";
interface TimingField {
  key: string;
  label: string;
  kind: FieldKind;
  /** keywords used to auto-detect this field from a header/label cell */
  match: string[];
}

// Keyword lists are intentionally specific (no bare "min"/"max"/"red") so that
// real-world labels like "MAX 1" vs "Max 2"/"Max Init" or "Red Clr" vs
// "Red Revt" don't collide. Longest matching keyword wins.
const TIMING_FIELDS: TimingField[] = [
  { key: "phase", label: "Phase", kind: "phase", match: ["phase"] },
  { key: "minGreen", label: "Min Green", kind: "number", match: ["min green", "mingreen", "min grn"] },
  { key: "maxGreen", label: "Max Green", kind: "number", match: ["max green", "maxgreen", "max grn", "max 1"] },
  { key: "yellow", label: "Yellow", kind: "number", match: ["yellow", "yel clr", "yel", "ylw"] },
  { key: "allRed", label: "All Red", kind: "number", match: ["all red", "allred", "red clr"] },
  { key: "pedWalk", label: "Walk", kind: "number", match: ["walk", "ped walk", "wlk"] },
  { key: "pedClearance", label: "Ped Clearance", kind: "number", match: ["ped clear", "ped clr", "clearance", "pedclr", "fdw"] },
  { key: "leadingPedInterval", label: "Leading Ped", kind: "number", match: ["leading ped", "lpi", "lead ped"] },
  { key: "vehRecallType", label: "Veh Recall", kind: "recall", match: ["veh recall", "recall", "vehrecall"] },
  { key: "pedRecall", label: "Ped Recall", kind: "bool", match: ["ped recall", "pedrecall", "ped rcl"] },
];

const IGNORE = "__ignore__";

// Split a pasted blob into a 2D grid. Prefers tab; falls back to comma.
function parseGrid(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  return lines.map((line) => {
    const delim = line.includes("\t") ? "\t" : ",";
    return line.split(delim).map((c) => c.trim());
  });
}

function transpose(grid: string[][]): string[][] {
  const cols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  const out: string[][] = [];
  for (let c = 0; c < cols; c++) {
    out.push(grid.map((r) => r[c] ?? ""));
  }
  return out;
}

// Detect whether phases run across the COLUMNS (the common controller export:
// a "Param" column then "Phase 1..8" columns) vs down the ROWS.
function detectPhasesInColumns(grid: string[][]): boolean {
  if (grid.length < 2) return false;
  const header = grid[0];
  const phaseLike = header
    .slice(1)
    .filter((c) => /^(phase\s*)?\d+$/i.test(c.trim()));
  return phaseLike.length >= 2;
}

function autoDetectField(header: string): string {
  const h = header.toLowerCase().trim();
  let best = IGNORE;
  let bestLen = 0;
  for (const f of TIMING_FIELDS) {
    for (const kw of f.match) {
      if ((h === kw || h.includes(kw)) && kw.length > bestLen) {
        best = f.key;
        bestLen = kw.length;
      }
    }
  }
  return best;
}

// Pull the first integer out of a cell, so "Phase 1" / "Ph 1" / "1" all → 1.
function parsePhaseNumber(raw: string): number {
  const m = (raw || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
}

const RECALL_VALUES = ["None", "Min", "Max", "Soft"] as const;
function coerceRecall(raw: string): "None" | "Min" | "Max" | "Soft" {
  const v = raw.trim().toLowerCase();
  const found = RECALL_VALUES.find((r) => r.toLowerCase() === v);
  if (found) return found;
  if (["minimum"].includes(v)) return "Min";
  if (["maximum", "maxrecall"].includes(v)) return "Max";
  return "None";
}
function coerceBool(raw: string): boolean {
  return ["yes", "y", "true", "1", "x", "on", "ped"].includes(raw.trim().toLowerCase());
}
function coerceNumber(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

interface TimingBulkImportProps {
  signalId: string;
  signalPhases: Phase[];
  existingTimings: BasicTiming[];
  onClose: () => void;
  onImported: () => void;
}

export default function TimingBulkImport({
  signalId,
  signalPhases,
  existingTimings,
  onClose,
  onImported,
}: TimingBulkImportProps) {
  const { toast } = useToast();
  const timingHooks = useBasicTimings();
  const [text, setText] = useState("");
  // "columns" = phases across the top (typical); "rows" = one phase per row.
  const [orientation, setOrientation] = useState<"columns" | "rows">("columns");
  const [orientationTouched, setOrientationTouched] = useState(false);
  const [hasHeader, setHasHeader] = useState(true);
  const [columnMap, setColumnMap] = useState<Record<number, string>>({});

  const rawGrid = useMemo(() => parseGrid(text), [text]);

  // Auto-pick orientation from the pasted shape until the user overrides it.
  const autoOrientation = useMemo<"columns" | "rows">(
    () => (detectPhasesInColumns(rawGrid) ? "columns" : "rows"),
    [rawGrid],
  );
  const effectiveOrientation = orientationTouched ? orientation : autoOrientation;

  // Normalize to the canonical "phases in rows" layout. When phases are in
  // columns we transpose so the per-column mapping logic is shared.
  const grid = useMemo(
    () => (effectiveOrientation === "columns" ? transpose(rawGrid) : rawGrid),
    [rawGrid, effectiveOrientation],
  );
  const colCount = useMemo(() => grid.reduce((m, r) => Math.max(m, r.length), 0), [grid]);

  // After a transpose the header row always exists (the parameter-name row);
  // in row mode it's the user's toggle.
  const headerPresent = effectiveOrientation === "columns" ? true : hasHeader;
  const dataRows = headerPresent ? grid.slice(1) : grid;

  const effectiveMap = useMemo(() => {
    const map: Record<number, string> = {};
    const usedFields = new Set<string>();
    for (let c = 0; c < colCount; c++) {
      if (columnMap[c] !== undefined) {
        map[c] = columnMap[c];
        if (map[c] !== IGNORE) usedFields.add(map[c]);
      }
    }
    for (let c = 0; c < colCount; c++) {
      if (map[c] !== undefined) continue;
      // After transposing, column 0 holds the phase labels ("Phase 1"…), so
      // seed it as the Phase column regardless of its header text ("Param").
      if (effectiveOrientation === "columns" && c === 0 && !usedFields.has("phase")) {
        map[c] = "phase";
        usedFields.add("phase");
        continue;
      }
      const header = headerPresent ? grid[0]?.[c] ?? "" : "";
      let guess = header ? autoDetectField(header) : IGNORE;
      if (guess !== IGNORE && usedFields.has(guess)) guess = IGNORE;
      map[c] = guess;
      if (guess !== IGNORE) usedFields.add(guess);
    }
    return map;
  }, [columnMap, colCount, headerPresent, grid, effectiveOrientation]);

  const phaseColIdx = useMemo(() => {
    const e = Object.entries(effectiveMap).find(([, f]) => f === "phase");
    return e ? Number(e[0]) : -1;
  }, [effectiveMap]);

  const setCol = (col: number, field: string) => {
    setColumnMap((prev) => {
      const next = { ...prev };
      if (field !== IGNORE) {
        for (let c = 0; c < colCount; c++) {
          if ((next[c] === field || effectiveMap[c] === field) && c !== col) next[c] = IGNORE;
        }
      }
      next[col] = field;
      return next;
    });
  };

  const phasesByNumber = useMemo(() => new Set(signalPhases.map((p) => p.phase)), [signalPhases]);

  const handleImport = () => {
    if (phaseColIdx < 0) {
      toast({ title: "Map the Phase column", description: "Assign one column to “Phase” so rows can be matched to phases.", variant: "destructive" });
      return;
    }
    if (dataRows.length === 0) {
      toast({ title: "Nothing to import", description: "Paste your timing table first.", variant: "destructive" });
      return;
    }

    let created = 0;
    let updated = 0;
    let skippedMissingPhase = 0;
    let skippedBadPhase = 0;

    for (const row of dataRows) {
      const phaseNum = parsePhaseNumber(row[phaseColIdx] ?? "");
      if (isNaN(phaseNum)) {
        skippedBadPhase++;
        continue;
      }
      if (!phasesByNumber.has(phaseNum)) {
        skippedMissingPhase++;
        continue;
      }

      const payload: Record<string, unknown> = {};
      for (let c = 0; c < colCount; c++) {
        const fieldKey = effectiveMap[c];
        if (!fieldKey || fieldKey === IGNORE || fieldKey === "phase") continue;
        const field = TIMING_FIELDS.find((f) => f.key === fieldKey);
        if (!field) continue;
        const raw = row[c] ?? "";
        if (field.kind === "number") payload[fieldKey] = coerceNumber(raw);
        else if (field.kind === "recall") payload[fieldKey] = coerceRecall(raw);
        else if (field.kind === "bool") payload[fieldKey] = coerceBool(raw);
      }

      const existing = existingTimings.find((t) => t.phase === phaseNum);
      if (existing) {
        timingHooks.update(existing.id, payload);
        updated++;
      } else {
        timingHooks.save({ signalId, phase: phaseNum, ...payload } as any);
        created++;
      }
    }

    const parts: string[] = [];
    if (created) parts.push(`Created ${created}`);
    if (updated) parts.push(`Updated ${updated}`);
    const extra: string[] = [];
    if (skippedMissingPhase) extra.push(`${skippedMissingPhase} skipped (phase not on this signal)`);
    if (skippedBadPhase) extra.push(`${skippedBadPhase} skipped (no phase number)`);

    if (created + updated === 0) {
      toast({ title: "Nothing imported", description: extra.join("; ") || "No matching phases found.", variant: "destructive" });
      return;
    }
    toast({ title: "Timings imported", description: [parts.join(", ") + " timing rows.", ...extra].join(" ") });
    onImported();
    onClose();
  };

  const mappedFieldCount = Object.values(effectiveMap).filter((f) => f !== IGNORE && f !== "phase").length;

  return (
    <div className="rounded-lg border border-grey-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Bulk Import Timings</h2>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClose}>
          <X className="w-3 h-3 mr-1" />Cancel
        </Button>
      </div>

      <p className="text-xs text-grey-600">
        Paste a table (tab- or comma-separated) copied from a spreadsheet or controller export.
        Choose how phases are laid out, then map each parameter to a timing field. Rows are
        matched to phases already configured on this signal; existing timings are updated.
      </p>

      {/* Orientation selector */}
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-grey-700">Layout:</span>
        <div className="flex gap-1">
          <Button
            type="button" size="sm"
            variant={effectiveOrientation === "columns" ? "default" : "outline"}
            className={`h-7 px-2 text-xs ${effectiveOrientation === "columns" ? "bg-primary-600 hover:bg-primary-700 text-white" : ""}`}
            onClick={() => { setOrientation("columns"); setOrientationTouched(true); setColumnMap({}); }}
          >
            Phases across top
          </Button>
          <Button
            type="button" size="sm"
            variant={effectiveOrientation === "rows" ? "default" : "outline"}
            className={`h-7 px-2 text-xs ${effectiveOrientation === "rows" ? "bg-primary-600 hover:bg-primary-700 text-white" : ""}`}
            onClick={() => { setOrientation("rows"); setOrientationTouched(true); setColumnMap({}); }}
          >
            One phase per row
          </Button>
        </div>
        {!orientationTouched && rawGrid.length > 0 && (
          <span className="text-grey-400">(auto-detected)</span>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setColumnMap({}); }}
        placeholder={"Param\tPhase 1\tPhase 2\tPhase 3\tPhase 4\nMIN GRN\t8\t12\t9\t10\nMAX 1\t38\t61\t35\t41\nYel Clr\t3.5\t4\t4\t4\nRed Clr\t1\t1\t1\t1\nWalk\t0\t7\t0\t7\nPed Clr\t0\t27\t0\t27"}
        className="w-full h-36 font-mono text-xs p-2 border border-grey-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        spellCheck={false}
        aria-label="Paste timing table here"
      />

      {effectiveOrientation === "rows" && (
        <label className="flex items-center gap-2 text-xs text-grey-700">
          <Checkbox checked={hasHeader} onCheckedChange={(v) => setHasHeader(Boolean(v))} />
          First row is a header
        </label>
      )}

      {colCount > 0 && (
        <>
          <p className="text-[11px] text-grey-500">
            {effectiveOrientation === "columns"
              ? "Each parameter row maps to a timing field; phases are read from the column headers."
              : "Each column maps to a timing field; one row per phase."}
          </p>
          <div className="border border-grey-200 rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-grey-50">
                  {Array.from({ length: colCount }).map((_, c) => (
                    <TableHead key={c} className="text-xs py-1.5 px-2 align-top">
                      <div className="flex flex-col gap-1 min-w-[110px]">
                        {headerPresent && (
                          <span className="text-[10px] text-grey-400 truncate" title={grid[0]?.[c]}>
                            {grid[0]?.[c] || `Column ${c + 1}`}
                          </span>
                        )}
                        <Select value={effectiveMap[c] ?? IGNORE} onValueChange={(v) => setCol(c, v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={IGNORE}>Ignore</SelectItem>
                            {TIMING_FIELDS.map((f) => (
                              <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataRows.slice(0, 10).map((row, r) => (
                  <TableRow key={r}>
                    {Array.from({ length: colCount }).map((_, c) => {
                      const isPhaseCol = c === phaseColIdx;
                      const phaseNum = isPhaseCol ? parsePhaseNumber(row[c] ?? "") : null;
                      const missing = isPhaseCol && !isNaN(phaseNum as number) && !phasesByNumber.has(phaseNum as number);
                      return (
                        <TableCell
                          key={c}
                          className={`py-1 px-2 text-xs ${effectiveMap[c] === IGNORE ? "text-grey-300" : "text-grey-700"} ${missing ? "text-red-500" : ""}`}
                          title={missing ? "Phase not configured on this signal — row will be skipped" : undefined}
                        >
                          {row[c] ?? ""}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {dataRows.length > 10 && (
            <p className="text-[11px] text-grey-400">Showing first 10 of {dataRows.length} rows.</p>
          )}
        </>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-grey-500">
          {phaseColIdx < 0
            ? "Map a column to “Phase” to enable import."
            : `${dataRows.length} phase row${dataRows.length !== 1 ? "s" : ""} · ${mappedFieldCount} field${mappedFieldCount !== 1 ? "s" : ""} mapped.`}
        </span>
        <Button
          onClick={handleImport}
          disabled={phaseColIdx < 0 || dataRows.length === 0}
          className="h-8 px-3 text-sm bg-primary-600 hover:bg-primary-700"
        >
          <Save className="w-4 h-4 mr-2" />
          Import Timings
        </Button>
      </div>
    </div>
  );
}
