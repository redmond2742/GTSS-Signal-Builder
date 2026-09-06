import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBasicTimingSchema, type BasicTiming, type InsertBasicTiming, type InsertPhase } from "@shared/schema";
import { getSignalDisplayName, useBasicTimings, useGTSSStore, usePhases } from "gtss";
import { AlertTriangle, CheckCircle, ClipboardPaste, Clock, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

interface ParsedTimingRow {
  phase: number;
  minGreen: number | null;
  maxGreen: number | null;
  yellow: number | null;
  allRed: number | null;
  pedWalk: number | null;
  pedClearance: number | null;
  hasData: boolean;
}

interface GridTimingRow {
  phase: number;
  minGreen: string;
  maxGreen: string;
  yellow: string;
  allRed: string;
  pedWalk: string;
  pedClearance: string;
  lpi: string;
  vehRecall: "None" | "Min" | "Max" | "Soft";
  pedRecall: boolean;
}

const createEmptyGridRow = (phase: number): GridTimingRow => ({
  phase,
  minGreen: "0",
  maxGreen: "0",
  yellow: "0",
  allRed: "0",
  pedWalk: "0",
  pedClearance: "0",
  lpi: "0",
  vehRecall: "None",
  pedRecall: false,
});

interface BasicTimingModalProps {
  timing: BasicTiming | null;
  onClose: () => void;
  preSelectedSignalId?: string;
}

export default function BasicTimingModal({ timing, onClose, preSelectedSignalId }: BasicTimingModalProps) {
  const { signals, phases, approaches } = useGTSSStore();
  const { toast } = useToast();
  const timingHooks = useBasicTimings();
  const phaseHooks = usePhases();
  const [isLoading, setIsLoading] = useState(false);

  // Grid-based manual entry state
  const [gridSignalId, setGridSignalId] = useState<string>(preSelectedSignalId || "");
  const [gridData, setGridData] = useState<GridTimingRow[]>([]);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<number>>(new Set());

  // Bulk import state
  const [activeTab, setActiveTab] = useState<"manual" | "bulk">("manual");
  const [bulkSignalId, setBulkSignalId] = useState<string>(preSelectedSignalId || "");
  const [pastedData, setPastedData] = useState<string>("");
  const [parsedTimings, setParsedTimings] = useState<ParsedTimingRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Load existing timing data when signal changes - only show phases that exist for signal
  useEffect(() => {
    setSelectedForDelete(new Set()); // Clear selections when signal changes
    if (gridSignalId) {
      // Get phases that exist for this signal
      const signalPhases = phases.filter(p => p.signalId === gridSignalId);
      const uniquePhaseNumbers = Array.from(new Set(signalPhases.map(p => p.phase))).sort((a, b) => a - b);

      if (uniquePhaseNumbers.length === 0) {
        setGridData([]);
        return;
      }

      const existingTimings = timingHooks.data.filter(t => t.signalId === gridSignalId);
      const newGridData = uniquePhaseNumbers.map(phaseNum => {
        const existingTiming = existingTimings.find(t => t.phase === phaseNum);
        if (existingTiming) {
          return {
            phase: phaseNum,
            minGreen: existingTiming.minGreen?.toString() || "",
            maxGreen: existingTiming.maxGreen?.toString() || "",
            yellow: existingTiming.yellow?.toString() || "",
            allRed: existingTiming.allRed?.toString() || "",
            pedWalk: existingTiming.pedWalk?.toString() || "",
            pedClearance: existingTiming.pedClearance?.toString() || "",
            lpi: existingTiming.leadingPedInterval?.toString() || "",
            vehRecall: (existingTiming.vehRecallType as "None" | "Min" | "Max" | "Soft") || "None",
            pedRecall: existingTiming.pedRecall || false,
          };
        }
        return createEmptyGridRow(phaseNum);
      });
      setGridData(newGridData);
    } else {
      setGridData([]);
    }
  }, [gridSignalId, timingHooks.data, phases]);

  // Toggle phase selection for deletion
  const toggleDeleteSelection = (phase: number) => {
    setSelectedForDelete(prev => {
      const newSet = new Set(prev);
      if (newSet.has(phase)) {
        newSet.delete(phase);
      } else {
        newSet.add(phase);
      }
      return newSet;
    });
  };

  // Delete selected timings
  const handleDeleteSelected = () => {
    if (selectedForDelete.size === 0) return;

    const phaseList = Array.from(selectedForDelete).sort((a, b) => a - b).join(", ");
    if (!confirm(`Delete timing data for phase(s) ${phaseList}?`)) return;

    const existingTimings = timingHooks.data.filter(t => t.signalId === gridSignalId);
    let deleted = 0;

    Array.from(selectedForDelete).forEach(phaseNum => {
      const timing = existingTimings.find(t => t.phase === phaseNum);
      if (timing) {
        timingHooks.delete(timing.id);
        deleted++;
      }
    });

    setSelectedForDelete(new Set());
    toast({
      title: "Success",
      description: `Deleted timing data for ${deleted} phase(s)`,
    });
  };

  const form = useForm<InsertBasicTiming>({
    resolver: zodResolver(insertBasicTimingSchema),
    defaultValues: {
      phase: 2,
      signalId: preSelectedSignalId || "",
      pedWalk: 0,
      pedClearance: 0,
      leadingPedInterval: 0,
      minGreen: 0,
      maxGreen: 0,
      yellow: 0,
      allRed: 0,
      vehRecallType: "None",
      pedRecall: false,
    },
  });

  useEffect(() => {
    if (timing) {
      form.reset({
        phase: timing.phase,
        signalId: timing.signalId,
        pedWalk: timing.pedWalk || undefined,
        pedClearance: timing.pedClearance || undefined,
        leadingPedInterval: timing.leadingPedInterval || undefined,
        minGreen: timing.minGreen || undefined,
        maxGreen: timing.maxGreen || undefined,
        yellow: timing.yellow || undefined,
        allRed: timing.allRed || undefined,
        vehRecallType: (timing.vehRecallType as "None" | "Min" | "Max" | "Soft") || "None",
        pedRecall: timing.pedRecall || false,
      });
    }
  }, [timing, form]);

  const selectedSignalId = form.watch("signalId");

  // Get phases for selected signal
  const signalPhases = phases.filter(p => p.signalId === selectedSignalId);
  const uniquePhaseNumbers = Array.from(new Set(signalPhases.map(p => p.phase))).sort((a, b) => a - b);

  const onSubmit = async (data: InsertBasicTiming) => {
    setIsLoading(true);
    try {
      if (timing) {
        timingHooks.update(timing.id, data);
        toast({
          title: "Success",
          description: "Basic timing updated successfully",
        });
      } else {
        timingHooks.save(data);
        toast({
          title: "Success",
          description: "Basic timing created successfully",
        });
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: timing ? "Failed to update timing" : "Failed to create timing",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    if (timing && confirm("Are you sure you want to delete this timing configuration?")) {
      timingHooks.delete(timing.id);
      onClose();
    }
  };

  // Update a single cell in the grid
  const updateGridCell = (phaseIndex: number, field: keyof GridTimingRow, value: string | boolean) => {
    setGridData(prev => {
      const newData = [...prev];
      newData[phaseIndex] = { ...newData[phaseIndex], [field]: value };
      return newData;
    });
  };

  // Save all grid data
  const handleGridSave = async () => {
    if (!gridSignalId) {
      toast({
        title: "Error",
        description: "Please select a signal first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const existingTimings = timingHooks.data.filter(t => t.signalId === gridSignalId);
      const existingPhaseMap = new Map(existingTimings.map(t => [t.phase, t]));

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of gridData) {
        // Check if row has any data
        const hasData = row.minGreen || row.maxGreen || row.yellow || row.allRed ||
          row.pedWalk || row.pedClearance || row.lpi ||
          row.vehRecall !== "None" || row.pedRecall;

        if (!hasData) {
          skipped++;
          continue;
        }

        const timingData: InsertBasicTiming = {
          phase: row.phase,
          signalId: gridSignalId,
          minGreen: row.minGreen ? parseFloat(row.minGreen) : undefined,
          maxGreen: row.maxGreen ? parseFloat(row.maxGreen) : undefined,
          yellow: row.yellow ? parseFloat(row.yellow) : undefined,
          allRed: row.allRed ? parseFloat(row.allRed) : undefined,
          pedWalk: row.pedWalk ? parseFloat(row.pedWalk) : undefined,
          pedClearance: row.pedClearance ? parseFloat(row.pedClearance) : undefined,
          leadingPedInterval: row.lpi ? parseFloat(row.lpi) : undefined,
          vehRecallType: row.vehRecall,
          pedRecall: row.pedRecall,
        };

        const existingTiming = existingPhaseMap.get(row.phase);
        if (existingTiming) {
          timingHooks.update(existingTiming.id, timingData);
          updated++;
        } else {
          timingHooks.save(timingData);
          created++;
        }
      }

      toast({
        title: "Success",
        description: `Saved timing data: ${created} created, ${updated} updated`,
      });

      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save timing data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Parse Excel timing data (tab-separated values)
  const parseExcelTimingData = (rawData: string): { timings: ParsedTimingRow[]; error: string | null } => {
    const lines = rawData.trim().split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return { timings: [], error: "Data must include a header row and at least one parameter row" };
    }

    // Parse header row to identify phase columns
    const headerCells = lines[0].split('\t').map(cell => cell.trim());

    const phaseColumns: { phase: number; index: number }[] = [];
    for (let i = 1; i < headerCells.length; i++) {
      const match = headerCells[i].match(/Phase\s*(\d+)/i);
      if (match) {
        phaseColumns.push({ phase: parseInt(match[1]), index: i });
      }
    }

    if (phaseColumns.length === 0) {
      return { timings: [], error: "Could not find phase columns in header. Expected format: 'Phase 1', 'Phase 2', etc." };
    }

    // Create a map to collect values per phase
    const phaseData: Map<number, Partial<ParsedTimingRow>> = new Map();
    phaseColumns.forEach(pc => {
      phaseData.set(pc.phase, { phase: pc.phase });
    });

    // Field mapping (Excel row name -> schema field)
    const fieldMapping: { [key: string]: keyof ParsedTimingRow } = {
      "min green": "minGreen",
      "max1": "maxGreen",
      "yellow clr": "yellow",
      "yellow": "yellow",
      "red clr": "allRed",
      "all red": "allRed",
      "walk": "pedWalk",
      "ped clearance": "pedClearance",
    };

    // Parse each data row
    for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
      const cells = lines[lineIdx].split('\t').map(cell => cell.trim());
      const paramName = cells[0]?.toLowerCase() || "";

      const schemaField = fieldMapping[paramName];
      if (!schemaField) {
        continue; // Gracefully ignore unknown fields
      }

      phaseColumns.forEach(pc => {
        const rawValue = cells[pc.index];
        const numValue = parseFloat(rawValue);
        const value = isNaN(numValue) ? null : numValue;

        const existing = phaseData.get(pc.phase)!;
        (existing as Record<string, unknown>)[schemaField] = value;
      });
    }

    // Convert map to array and determine which phases have data
    const timings: ParsedTimingRow[] = [];
    phaseData.forEach((data, phase) => {
      const hasData = !!(
        (data.minGreen && data.minGreen > 0) ||
        (data.maxGreen && data.maxGreen > 0) ||
        (data.yellow && data.yellow > 0) ||
        (data.allRed && data.allRed > 0) ||
        (data.pedWalk && data.pedWalk > 0) ||
        (data.pedClearance && data.pedClearance > 0)
      );

      timings.push({
        phase,
        minGreen: data.minGreen ?? null,
        maxGreen: data.maxGreen ?? null,
        yellow: data.yellow ?? null,
        allRed: data.allRed ?? null,
        pedWalk: data.pedWalk ?? null,
        pedClearance: data.pedClearance ?? null,
        hasData,
      });
    });

    timings.sort((a, b) => a.phase - b.phase);

    return { timings, error: null };
  };

  // Handle bulk import
  const handleBulkImport = async () => {
    if (!bulkSignalId) {
      toast({
        title: "Error",
        description: "Please select a signal first",
        variant: "destructive",
      });
      return;
    }

    const timingsToImport = parsedTimings.filter(t => t.hasData);

    if (timingsToImport.length === 0) {
      toast({
        title: "Warning",
        description: "No phases with timing data to import",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);

    try {
      // Get existing phases and timings for this signal
      const existingSignalPhases = phases.filter(p => p.signalId === bulkSignalId);
      const existingPhaseNumbers = new Set(existingSignalPhases.map(p => p.phase));
      const existingTimings = timingHooks.data.filter(t => t.signalId === bulkSignalId);
      const existingTimingMap = new Map(existingTimings.map(t => [t.phase, t]));

      let phasesCreated = 0;
      let timingsCreated = 0;
      let timingsUpdated = 0;

      for (const timing of timingsToImport) {
        // Create phase if it doesn't exist
        if (!existingPhaseNumbers.has(timing.phase)) {
          const newPhase: InsertPhase = {
            phase: timing.phase,
            signalId: bulkSignalId,
            movementType: "Through", // Default movement type
          };
          phaseHooks.save(newPhase);
          existingPhaseNumbers.add(timing.phase);
          phasesCreated++;
        }

        const existingTiming = existingTimingMap.get(timing.phase);

        const timingData: InsertBasicTiming = {
          phase: timing.phase,
          signalId: bulkSignalId,
          minGreen: timing.minGreen ?? undefined,
          maxGreen: timing.maxGreen ?? undefined,
          yellow: timing.yellow ?? undefined,
          allRed: timing.allRed ?? undefined,
          pedWalk: timing.pedWalk ?? undefined,
          pedClearance: timing.pedClearance ?? undefined,
          leadingPedInterval: existingTiming?.leadingPedInterval ?? undefined,
          vehRecallType: (existingTiming?.vehRecallType as "None" | "Min" | "Max" | "Soft") ?? "None",
          pedRecall: existingTiming?.pedRecall ?? false,
        };

        if (existingTiming) {
          timingHooks.update(existingTiming.id, timingData);
          timingsUpdated++;
        } else {
          timingHooks.save(timingData);
          timingsCreated++;
        }
      }

      const messages = [];
      if (phasesCreated > 0) messages.push(`${phasesCreated} phases created`);
      if (timingsCreated > 0) messages.push(`${timingsCreated} timings created`);
      if (timingsUpdated > 0) messages.push(`${timingsUpdated} timings updated`);

      toast({
        title: "Success",
        description: `Imported: ${messages.join(", ")}`,
      });

      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to import timing data",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleParseData = () => {
    const result = parseExcelTimingData(pastedData);
    setParsedTimings(result.timings);
    setParseError(result.error);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-auto fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {timing ? "Edit Basic Timing" : "Add Basic Timing"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "manual" | "bulk")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="mt-4 space-y-4">
            {/* Signal Selector */}
            <div>
              <Label>Signal *</Label>
              <Select value={gridSignalId} onValueChange={setGridSignalId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select signal" />
                </SelectTrigger>
                <SelectContent>
                  {signals.map((signal) => (
                    <SelectItem key={signal.signalId} value={signal.signalId}>
                      {getSignalDisplayName(signal, approaches)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timing Grid */}
            {gridSignalId && gridData.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No phases have been added for this signal. Add approaches/phases first before configuring timing.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-10 text-center">
                          <span className="sr-only">Select</span>
                        </TableHead>
                        <TableHead className="w-16 text-center font-semibold">Phase</TableHead>
                        <TableHead className="w-20 text-center">Min Grn</TableHead>
                        <TableHead className="w-20 text-center">Max Grn</TableHead>
                        <TableHead className="w-16 text-center">Yellow</TableHead>
                        <TableHead className="w-16 text-center">All Red</TableHead>
                        <TableHead className="w-16 text-center">Walk</TableHead>
                        <TableHead className="w-20 text-center">Ped Clr</TableHead>
                        <TableHead className="w-16 text-center">LPI</TableHead>
                        <TableHead className="w-24 text-center">Veh Recall</TableHead>
                        <TableHead className="w-20 text-center">Ped Recall</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gridData.map((row, index) => (
                        <TableRow key={row.phase} className={`${index % 2 === 0 ? "bg-white" : "bg-muted/20"} ${selectedForDelete.has(row.phase) ? "bg-red-50" : ""}`}>
                          <TableCell className="p-1 text-center">
                            <Checkbox
                              checked={selectedForDelete.has(row.phase)}
                              onCheckedChange={() => toggleDeleteSelection(row.phase)}
                            />
                          </TableCell>
                          <TableCell className="text-center font-medium">{row.phase}</TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              className="h-8 text-center text-sm"
                              value={row.minGreen}
                              onChange={(e) => updateGridCell(index, "minGreen", e.target.value)}
                              placeholder="-"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              className="h-8 text-center text-sm"
                              value={row.maxGreen}
                              onChange={(e) => updateGridCell(index, "maxGreen", e.target.value)}
                              placeholder="-"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              className="h-8 text-center text-sm"
                              value={row.yellow}
                              onChange={(e) => updateGridCell(index, "yellow", e.target.value)}
                              placeholder="-"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              className="h-8 text-center text-sm"
                              value={row.allRed}
                              onChange={(e) => updateGridCell(index, "allRed", e.target.value)}
                              placeholder="-"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              className="h-8 text-center text-sm"
                              value={row.pedWalk}
                              onChange={(e) => updateGridCell(index, "pedWalk", e.target.value)}
                              placeholder="-"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              className="h-8 text-center text-sm"
                              value={row.pedClearance}
                              onChange={(e) => updateGridCell(index, "pedClearance", e.target.value)}
                              placeholder="-"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              className="h-8 text-center text-sm"
                              value={row.lpi}
                              onChange={(e) => updateGridCell(index, "lpi", e.target.value)}
                              placeholder="-"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Select
                              value={row.vehRecall}
                              onValueChange={(v) => updateGridCell(index, "vehRecall", v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="None">None</SelectItem>
                                <SelectItem value="Min">Min</SelectItem>
                                <SelectItem value="Max">Max</SelectItem>
                                <SelectItem value="Soft">Soft</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-1 text-center">
                            <Switch
                              checked={row.pedRecall}
                              onCheckedChange={(v) => updateGridCell(index, "pedRecall", v)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between border-t pt-4">
              <div>
                {selectedForDelete.size > 0 && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete {selectedForDelete.size} Timing{selectedForDelete.size > 1 ? "s" : ""}
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleGridSave}
                  disabled={isLoading || !gridSignalId || gridData.length === 0}
                  className="bg-primary-600 hover:bg-primary-700"
                >
                  {isLoading ? "Saving..." : "Save All Timings"}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bulk" className="mt-4 space-y-6">
            {/* Signal Selector */}
            <div>
              <Label>Signal *</Label>
              <Select value={bulkSignalId} onValueChange={setBulkSignalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select signal" />
                </SelectTrigger>
                <SelectContent>
                  {signals.map((signal) => (
                    <SelectItem key={signal.signalId} value={signal.signalId}>
                      {getSignalDisplayName(signal, approaches)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Paste Area */}
            <div>
              <Label className="flex items-center gap-2">
                <ClipboardPaste className="w-4 h-4" />
                Paste Excel Data
              </Label>
              <p className="text-sm text-muted-foreground mb-2">
                Copy timing data from Excel and paste below. Expected format: rows for parameters (Min Green, Max1, Yellow Clr, etc.) with columns for each phase.
              </p>
              <Textarea
                placeholder="Paste Excel data here (tab-separated)..."
                value={pastedData}
                onChange={(e) => setPastedData(e.target.value)}
                className="min-h-[150px] font-mono text-sm"
              />
            </div>

            {/* Parse Button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleParseData}
              disabled={!pastedData.trim()}
            >
              Parse Data
            </Button>

            {/* Error Display */}
            {parseError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}

            {/* Preview Table */}
            {parsedTimings.length > 0 && !parseError && (() => {
              const existingPhaseNumbers = bulkSignalId
                ? new Set(phases.filter(p => p.signalId === bulkSignalId).map(p => p.phase))
                : new Set<number>();
              const phasesToCreate = parsedTimings.filter(t => t.hasData && !existingPhaseNumbers.has(t.phase)).length;

              return (
                <div className="border rounded-lg">
                  <div className="p-3 border-b bg-muted/50">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="font-medium">
                        Preview - {parsedTimings.filter(t => t.hasData).length} phases with data
                        {bulkSignalId && phasesToCreate > 0 && (
                          <span className="text-blue-600 ml-2">({phasesToCreate} new phases will be created)</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phase</TableHead>
                        <TableHead>Min Green</TableHead>
                        <TableHead>Max Green</TableHead>
                        <TableHead>Yellow</TableHead>
                        <TableHead>All Red</TableHead>
                        <TableHead>Walk</TableHead>
                        <TableHead>Ped Clr</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedTimings.map((t) => {
                        const phaseExists = existingPhaseNumbers.has(t.phase);
                        const status = !t.hasData
                          ? "Skip (no data)"
                          : bulkSignalId
                            ? phaseExists
                              ? "Update"
                              : "Create phase + timing"
                            : "Import";
                        return (
                          <TableRow key={t.phase} className={!t.hasData ? "opacity-50" : ""}>
                            <TableCell>{t.phase}</TableCell>
                            <TableCell>{t.minGreen ?? "-"}</TableCell>
                            <TableCell>{t.maxGreen ?? "-"}</TableCell>
                            <TableCell>{t.yellow ?? "-"}</TableCell>
                            <TableCell>{t.allRed ?? "-"}</TableCell>
                            <TableCell>{t.pedWalk ?? "-"}</TableCell>
                            <TableCell>{t.pedClearance ?? "-"}</TableCell>
                            <TableCell className={!phaseExists && t.hasData && bulkSignalId ? "text-blue-600 font-medium" : ""}>
                              {status}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              );
            })()}

            {/* Import Button */}
            {parsedTimings.filter(t => t.hasData).length > 0 && !parseError && (
              <div className="space-y-3 border-t pt-4">
                {!bulkSignalId && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>Please select a signal above before importing.</AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleBulkImport}
                    disabled={isImporting || !bulkSignalId}
                    className="bg-primary-600 hover:bg-primary-700"
                  >
                    {isImporting ? "Importing..." : `Import ${parsedTimings.filter(t => t.hasData).length} Phases`}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
