import { useState, useMemo, useEffect, useRef } from "react";
import { usePhases } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Save, Trash2, Download, ChevronUp, ChevronDown, Wand2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { getSignalDisplayName, handleColumnMajorTab } from "@/lib/utils";
import { guessPhaseDirectionMapping, isTypicallyThroughPhase } from "@/lib/agencyDefaults";
import { PhaseDiagram, phaseColors } from "./phase-diagram-svg";

interface PendingPhase {
  id?: string;
  phase: number;
  approachId: string;
  movementType: string;
  numOfLanes: number;
  isPedestrian: number; // 0 = none, 1 = assigned approach, 2 = opposite, 3 = diagonal, 4 = diagonal shifted 90°
  isOverlap: boolean;
}

interface BulkPhaseModalProps {
  onClose: () => void;
  preSelectedSignalId?: string;
  /** When true, render in-place (no Dialog wrapper). Defaults to false. */
  inline?: boolean;
}

// phaseColors is now imported from ./phase-diagram-svg so the diagram can be
// reused on the signal-details page next to the map.

// Movement type options
const movementTypes = [
  { value: "Through", label: "Through (T)" },
  { value: "Left Turn", label: "Left Turn (L)" },
  { value: "Left Through Shared", label: "Left Through Shared (LT)" },
  { value: "Permissive Phase", label: "Permissive Phase (TL)" },
  { value: "Flashing Yellow Arrow", label: "Flashing Yellow Arrow (FYA)" },
  { value: "U-Turn", label: "U-Turn (U)" },
  { value: "Right Turn", label: "Right Turn (R)" },
  { value: "Through-Right", label: "Through-Right (TR)" },
  { value: "Pedestrian", label: "Pedestrian (PED)" },
];

// Left turn phase mapping: Through phase -> Left turn phase
const leftTurnMapping: Record<number, number> = { 2: 5, 4: 7, 6: 1, 8: 3 };

// Get cardinal direction from bearing
const getDirectionFromBearing = (bearing: number | null): string => {
  if (bearing === null) return "";
  const normalized = ((bearing % 360) + 360) % 360;
  if (normalized >= 337.5 || normalized < 22.5) return "NB";
  if (normalized >= 22.5 && normalized < 67.5) return "NEB";
  if (normalized >= 67.5 && normalized < 112.5) return "EB";
  if (normalized >= 112.5 && normalized < 157.5) return "SEB";
  if (normalized >= 157.5 && normalized < 202.5) return "SB";
  if (normalized >= 202.5 && normalized < 247.5) return "SWB";
  if (normalized >= 247.5 && normalized < 292.5) return "WB";
  return "NWB";
};

const PHASE_COUNT_OPTIONS = [2, 4, 6, 8] as const;

export default function BulkPhaseModal({ onClose, preSelectedSignalId, inline = false }: BulkPhaseModalProps) {
  const { signals, approaches: allApproaches, phases: existingPhases, agencyDefaults } = useGTSSStore();
  const { toast } = useToast();
  const phaseHooks = usePhases();
  const svgRef = useRef<SVGSVGElement>(null);

  const [selectedSignalId, setSelectedSignalId] = useState<string>(preSelectedSignalId || "");
  const [pendingPhases, setPendingPhases] = useState<PendingPhase[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [targetPhaseCount, setTargetPhaseCount] = useState<number>(
    agencyDefaults?.defaultPhaseCount ?? 8
  );

  // Sorting state. Default is `null` so the table preserves insertion order
  // — editing a row's phase number won't make it jump positions. The user
  // can still click a column header to sort manually; a third click on the
  // same header clears the sort back to insertion order.
  type SortField = 'phase' | 'approachId' | 'movementType' | 'numOfLanes' | 'isOverlap' | 'isPedestrian';
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Handle sort: 1st click → asc, 2nd click on same header → desc, 3rd → cleared.
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get phases. When sortField is null we return the array as-is so rows
  // keep their position while the user edits.
  const getSortedPhases = () => {
    if (sortField === null) return pendingPhases;
    return [...pendingPhases].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'phase':
          comparison = a.phase - b.phase;
          break;
        case 'approachId':
          comparison = (a.approachId || '').localeCompare(b.approachId || '');
          break;
        case 'movementType':
          comparison = a.movementType.localeCompare(b.movementType);
          break;
        case 'numOfLanes':
          comparison = a.numOfLanes - b.numOfLanes;
          break;
        case 'isOverlap':
          comparison = (a.isOverlap ? 1 : 0) - (b.isOverlap ? 1 : 0);
          break;
        case 'isPedestrian':
          comparison = (a.isPedestrian ? 1 : 0) - (b.isPedestrian ? 1 : 0);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  // Sortable header component
  const SortableHeader = ({ field, children, className = "" }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`text-xs py-2 cursor-pointer hover:bg-grey-100 transition-colors ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center justify-between">
        {children}
        <div className="flex flex-col ml-1">
          <ChevronUp
            className={`w-3 h-3 ${sortField === field && sortDirection === 'asc' ? 'text-primary-600' : 'text-grey-300'}`}
          />
          <ChevronDown
            className={`w-3 h-3 -mt-1 ${sortField === field && sortDirection === 'desc' ? 'text-primary-600' : 'text-grey-300'}`}
          />
        </div>
      </div>
    </TableHead>
  );

  // Get approaches for selected signal
  const signalApproaches = useMemo(() => {
    return allApproaches.filter(a => a.signalId === selectedSignalId);
  }, [allApproaches, selectedSignalId]);

  // Get intersection name for display
  const intersectionName = useMemo(() => {
    const signal = signals.find(s => s.signalId === selectedSignalId);
    if (!signal) return "";
    return getSignalDisplayName(signal, allApproaches);
  }, [signals, selectedSignalId, allApproaches]);

  // Download diagram as JPG - captures full diagram including labels
  const handleDownloadImage = () => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    // Clone the SVG and set explicit dimensions for export
    const svgClone = svg.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute('width', '340');
    svgClone.setAttribute('height', '384');

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2; // Higher resolution
      // Match viewBox dimensions: -20 0 340 384 means width=340, height=384
      canvas.width = 340 * scale;
      canvas.height = 384 * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // White background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw SVG at scale
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, 340, 384);

      // Convert to JPG and download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedSignalId || 'phase-diagram'}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.95);

      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  };

  // Get next available phase number
  const getNextAvailablePhaseNumber = (): number => {
    const usedPhases = new Set(pendingPhases.map(p => p.phase));
    for (let i = 1; i <= 8; i++) {
      if (!usedPhases.has(i)) return i;
    }
    return 1;
  };

  // Add a new phase row
  const handleAddPhase = () => {
    const nextPhase = getNextAvailablePhaseNumber();
    const defaultApproach = signalApproaches[0]?.approachId || "";

    setPendingPhases(prev => [
      ...prev,
      {
        phase: nextPhase,
        approachId: defaultApproach,
        movementType: "Through",
        numOfLanes: 1,
        isPedestrian: 1,
        isOverlap: false,
      }
    ]);
  };

  // Update a phase field
  const handlePhaseChange = (index: number, field: keyof PendingPhase, value: any) => {
    setPendingPhases(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // Auto-set Pedestrian mode (integer 0–4) from movement type:
      //  • Through / Through-Right / Pedestrian → 1 (assigned approach)
      //  • Permissive Phase → preserve current (don't reset a manually-set mode)
      //  • Anything else → 0 (none)
      if (field === 'movementType') {
        if (value === 'Through' || value === 'Through-Right' || value === 'Pedestrian') {
          updated[index].isPedestrian = 1;
        } else if (value === 'Permissive Phase') {
          // intentionally preserve
        } else {
          updated[index].isPedestrian = 0;
        }
      }

      return updated;
    });
  };

  // Delete a phase row
  const handleDeletePhase = (index: number) => {
    setPendingPhases(prev => prev.filter((_, i) => i !== index));
  };

  // Duplicate for opposite (creates left turn)
  const handleDuplicateToOpposite = (index: number) => {
    const currentPhase = pendingPhases[index];

    // Only works for Through phases 2, 4, 6, 8
    if (currentPhase.movementType !== "Through" || !leftTurnMapping[currentPhase.phase]) {
      toast({
        title: "Not Applicable",
        description: "Duplicate to opposite only works for Through phases 2, 4, 6, or 8",
        variant: "destructive",
      });
      return;
    }

    // Check if target phase already exists
    const targetPhase = leftTurnMapping[currentPhase.phase];
    if (pendingPhases.some(p => p.phase === targetPhase)) {
      toast({
        title: "Phase Exists",
        description: `Phase ${targetPhase} already exists in the list`,
        variant: "destructive",
      });
      return;
    }

    // Find the opposite approach (180 degrees away)
    const currentApproach = signalApproaches.find(a => a.approachId === currentPhase.approachId);
    let oppositeApproachId = currentPhase.approachId;

    if (currentApproach?.compassBearing !== null && currentApproach?.compassBearing !== undefined) {
      const oppositeBearing = (currentApproach.compassBearing + 180) % 360;
      // Find approach closest to opposite bearing
      let closestApproach = signalApproaches[0];
      let closestDiff = 360;

      for (const approach of signalApproaches) {
        if (approach.compassBearing !== null) {
          const diff = Math.abs(((approach.compassBearing - oppositeBearing + 180) % 360) - 180);
          if (diff < closestDiff) {
            closestDiff = diff;
            closestApproach = approach;
          }
        }
      }
      oppositeApproachId = closestApproach?.approachId || currentPhase.approachId;
    }

    const newPhase: PendingPhase = {
      phase: targetPhase,
      approachId: oppositeApproachId,
      movementType: "Left Turn",
      numOfLanes: 1,
      isPedestrian: 0,
      isOverlap: false,
    };

    setPendingPhases(prev => [...prev, newPhase]);

    toast({
      title: "Phase Duplicated",
      description: `Created Left Turn phase ${targetPhase} for opposite approach`,
    });
  };

  /**
   * Auto-assign approach IDs to phases using agency defaults.
   * - Phases with no approachId get assigned from the guess mapping.
   * - New phases needed by the mapping (not yet in pendingPhases) are created.
   * - Existing phases not in the mapping are left untouched.
   * @param overwrite - If true, overwrite even phases that already have an approachId.
   */
  const handleAutoAssign = (overwrite = false) => {
    if (!selectedSignalId) {
      toast({
        title: "No Signal Selected",
        description: "Please select a signal first",
        variant: "destructive",
      });
      return;
    }

    if (signalApproaches.length === 0) {
      toast({
        title: "No Approaches",
        description: "This signal has no approaches. Add approaches first in the Approaches tab.",
        variant: "destructive",
      });
      return;
    }

    // Get guess mapping: phaseNumber → approachId
    const mapping = guessPhaseDirectionMapping({
      phaseCount: targetPhaseCount,
      approaches: signalApproaches,
      agencyDefaults,
    });

    if (Object.keys(mapping).length === 0) {
      toast({
        title: "No Mapping Available",
        description: "Could not generate a mapping. Check that approaches have compass bearings set.",
        variant: "destructive",
      });
      return;
    }

    const mappingEntries = Object.entries(mapping)
      .map(([k, v]) => [Number(k), v] as [number, string])
      .sort((a, b) => a[0] - b[0]);

    const newPhaseFor = (phaseNum: number, approachId: string): PendingPhase => {
      const isThrough = isTypicallyThroughPhase(phaseNum);
      return {
        phase: phaseNum,
        approachId,
        movementType: isThrough ? "Through" : "Left Turn",
        numOfLanes: 1,
        isPedestrian: isThrough ? 1 : 0,
        isOverlap: false,
      };
    };

    if (overwrite) {
      // Re-assign All: rebuild the phase set to EXACTLY match the target count.
      // Phases already present keep their movement type / lanes / flags but get
      // the mapped approach; phases outside the mapping are removed; missing
      // ones are created. This makes re-clicking after changing the count
      // (e.g. 8 → 4) actually reduce the list.
      const next = mappingEntries.map(([phaseNum, approachId]) => {
        const existing = pendingPhases.find((p) => p.phase === phaseNum);
        return existing ? { ...existing, approachId } : newPhaseFor(phaseNum, approachId);
      });
      setPendingPhases(next);
      toast({
        title: "Phases Re-assigned",
        description: `Set ${next.length} phase${next.length !== 1 ? "s" : ""} to match the ${targetPhaseCount}-phase layout.`,
      });
      return;
    }

    // Auto-assign (non-destructive): fill unassigned phases + create missing
    // mapping phases, never removing anything the user already has.
    let assignedCount = 0;
    let createdCount = 0;
    const updated = [...pendingPhases];
    for (const [phaseNum, approachId] of mappingEntries) {
      const existingIndex = updated.findIndex((p) => p.phase === phaseNum);
      if (existingIndex >= 0) {
        if (!updated[existingIndex].approachId) {
          updated[existingIndex] = { ...updated[existingIndex], approachId };
          assignedCount++;
        }
      } else {
        updated.push(newPhaseFor(phaseNum, approachId));
        createdCount++;
      }
    }
    setPendingPhases(updated);

    const parts: string[] = [];
    if (assignedCount > 0) parts.push(`Assigned ${assignedCount} approach${assignedCount !== 1 ? "es" : ""}`);
    if (createdCount > 0) parts.push(`Created ${createdCount} phase${createdCount !== 1 ? "s" : ""}`);

    if (parts.length > 0) {
      toast({
        title: "Auto-Assign Complete",
        description: parts.join(", ") + " using agency defaults.",
      });
    } else {
      toast({
        title: "Nothing to Assign",
        description: "All mapped phases already have approaches. Use 'Re-assign All' to reset to the selected phase count.",
      });
    }
  };

  // Save all phases
  const handleSaveAll = async () => {
    if (!selectedSignalId) {
      toast({
        title: "No Signal Selected",
        description: "Please select a signal first",
        variant: "destructive",
      });
      return;
    }

    if (pendingPhases.length === 0) {
      toast({
        title: "No Phases",
        description: "Add at least one phase",
        variant: "destructive",
      });
      return;
    }

    // The same phase number is allowed on multiple approaches (e.g. a
    // pedestrian phase serving several crossings, or a shared phase across
    // different approach angles). We only block TRUE duplicates — identical
    // phase number AND approach — since those would be redundant records.
    const seen = new Set<string>();
    const trueDuplicates: string[] = [];
    for (const p of pendingPhases) {
      const key = `${p.phase}::${p.approachId || ""}`;
      if (seen.has(key)) {
        trueDuplicates.push(`Phase ${p.phase}${p.approachId ? ` @ ${p.approachId}` : " (no approach)"}`);
      }
      seen.add(key);
    }
    if (trueDuplicates.length > 0) {
      toast({
        title: "Duplicate Phase + Approach",
        description: `Each phase/approach pair must be unique. Duplicates: ${Array.from(new Set(trueDuplicates)).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      let updatedCount = 0;
      let createdCount = 0;

      for (const phase of pendingPhases) {
        if (phase.id) {
          // Update existing phase
          phaseHooks.update(phase.id, {
            phase: phase.phase,
            signalId: selectedSignalId,
            movementType: phase.movementType,
            approachId: phase.approachId || null,
            numOfLanes: phase.numOfLanes,
            isPedestrian: phase.isPedestrian,
            isOverlap: phase.isOverlap,
          });
          updatedCount++;
        } else {
          // Create new phase
          phaseHooks.save({
            phase: phase.phase,
            signalId: selectedSignalId,
            movementType: phase.movementType,
            approachId: phase.approachId || null,
            numOfLanes: phase.numOfLanes,
            isPedestrian: phase.isPedestrian,
            isOverlap: phase.isOverlap,
          });
          createdCount++;
        }
      }

      const messages = [];
      if (updatedCount > 0) messages.push(`Updated ${updatedCount}`);
      if (createdCount > 0) messages.push(`Created ${createdCount}`);

      toast({
        title: "Success",
        description: `${messages.join(", ")} phase${updatedCount + createdCount > 1 ? "s" : ""}`,
      });

      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save phases",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Load existing phases or reset when signal changes
  useEffect(() => {
    if (selectedSignalId) {
      // Check if this signal has existing phases
      const signalPhases = existingPhases.filter(p => p.signalId === selectedSignalId);

      if (signalPhases.length > 0) {
        // Load existing phases for editing
        setIsEditMode(true);
        const loadedPhases: PendingPhase[] = signalPhases.map(p => ({
          id: p.id,
          phase: p.phase,
          approachId: p.approachId || "",
          movementType: p.movementType,
          numOfLanes: p.numOfLanes || 1,
          // Coerce legacy boolean values to the new integer scheme on load.
          isPedestrian:
            typeof p.isPedestrian === "number"
              ? p.isPedestrian
              : (p.isPedestrian ? 1 : 0),
          isOverlap: p.isOverlap || false,
        }));
        setPendingPhases(loadedPhases);
      } else {
        // No existing phases
        setIsEditMode(false);
        setPendingPhases([]);
      }
    } else {
      setPendingPhases([]);
      setIsEditMode(false);
    }
  }, [selectedSignalId, existingPhases]);

  const titleText = isEditMode ? "Edit Phases" : "Add Multiple Phases";
  const titleBadge = pendingPhases.length > 0 && (
    <Badge variant="secondary" className={isEditMode ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}>
      {pendingPhases.length} phase{pendingPhases.length !== 1 ? "s" : ""}
    </Badge>
  );
  const signalSelector = (
    <Select value={selectedSignalId} onValueChange={setSelectedSignalId}>
      <SelectTrigger className="w-72">
        <SelectValue placeholder="Select a signal" />
      </SelectTrigger>
      <SelectContent>
        {signals.map((signal) => (
          <SelectItem key={signal.signalId} value={signal.signalId}>
            {getSignalDisplayName(signal, allApproaches)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const body = (
    <>
        <div className="space-y-4">
          {!selectedSignalId ? (
            <div className="p-8 text-center text-grey-500 text-sm">
              Select a signal to view and edit phases
            </div>
          ) : signalApproaches.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                This signal has no approaches configured. Please add approaches first to set phase directions.
              </p>
            </div>
          ) : (
            <>
              {/* Phase count + auto-assign toolbar */}
              <div className="flex flex-wrap items-center gap-3 p-3 bg-grey-50 border border-grey-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-grey-700 whitespace-nowrap">Phase count:</span>
                  <div className="flex gap-1">
                    {PHASE_COUNT_OPTIONS.map((count) => (
                      <Button
                        key={count}
                        type="button"
                        variant={targetPhaseCount === count ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTargetPhaseCount(count)}
                        className={`h-7 w-9 p-0 text-xs font-semibold ${
                          targetPhaseCount === count
                            ? "bg-primary-600 hover:bg-primary-700 text-white"
                            : "border-grey-200 text-grey-700 hover:bg-grey-100"
                        }`}
                      >
                        {count}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAutoAssign(false)}
                    className="h-7 text-xs border-primary-200 text-primary-700 hover:bg-primary-50 flex items-center gap-1"
                    disabled={signalApproaches.length === 0}
                    title="Auto-assign approaches to unassigned phases using agency defaults"
                  >
                    <Wand2 className="w-3 h-3" />
                    Auto-assign using Agency Defaults
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAutoAssign(true)}
                    className="h-7 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 flex items-center gap-1"
                    disabled={signalApproaches.length === 0}
                    title="Re-assign all phases (overwrites existing approach assignments)"
                  >
                    <Wand2 className="w-3 h-3" />
                    Re-assign All
                  </Button>
                </div>
              </div>

              {/* Phase Diagram - centered */}
              <div className="border border-grey-200 rounded-lg p-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-grey-500">Phase Diagram</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadImage}
                    className="h-6 text-xs px-2"
                    disabled={pendingPhases.length === 0}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download JPG
                  </Button>
                </div>
                <div className="h-72 max-w-md mx-auto">
                  <PhaseDiagram
                    phases={pendingPhases}
                    approaches={signalApproaches}
                    intersectionName={intersectionName}
                    intersectionId={selectedSignalId}
                    svgRef={svgRef}
                  />
                </div>
              </div>

              {/* Full-width Phases Table */}
              <div className="border border-grey-200 rounded-lg overflow-hidden">
                <div className="p-2 bg-grey-50 border-b border-grey-200 flex items-center justify-between">
                  <span className="text-xs font-medium text-grey-700">Phases</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddPhase}
                    className="h-7 text-xs"
                    disabled={signalApproaches.length === 0}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Phase
                  </Button>
                </div>

                {pendingPhases.length === 0 ? (
                  <div className="p-8 text-center text-grey-500 text-sm">
                    Click "Add Phase" to start building your phases
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    {/* Tab / Shift+Tab moves down each column instead of across rows */}
                    <Table onKeyDown={handleColumnMajorTab}>
                      <TableHeader>
                        <TableRow className="bg-grey-50">
                          <SortableHeader field="phase" className="w-24">Phase</SortableHeader>
                          <SortableHeader field="approachId">Approach</SortableHeader>
                          <SortableHeader field="movementType">Movement</SortableHeader>
                          <SortableHeader field="numOfLanes" className="w-16">Lanes</SortableHeader>
                          <SortableHeader field="isOverlap" className="w-20 text-center">Overlap</SortableHeader>
                          <SortableHeader field="isPedestrian" className="w-20 text-center">Ped</SortableHeader>
                          <TableHead className="w-12 text-xs py-2"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getSortedPhases().map((phase, visualRow) => {
                          const idx = pendingPhases.findIndex(p => p.id === phase.id && p.phase === phase.phase && p.approachId === phase.approachId);
                          return (
                          <TableRow key={idx}>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-4 h-4 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: phaseColors[phase.phase] }}
                                />
                                <Input
                                  type="number"
                                  min="1"
                                  max="8"
                                  value={phase.phase}
                                  onChange={(e) => handlePhaseChange(idx, 'phase', parseInt(e.target.value) || 1)}
                                  className="h-7 w-14 text-sm"
                                  data-tab-col={0}
                                  data-tab-row={visualRow}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Select
                                value={phase.approachId}
                                onValueChange={(value) => handlePhaseChange(idx, 'approachId', value)}
                              >
                                <SelectTrigger className="h-7 text-xs" data-tab-col={1} data-tab-row={visualRow}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {signalApproaches.map((approach) => (
                                    <SelectItem key={approach.approachId} value={approach.approachId}>
                                      {approach.approachId} - {getDirectionFromBearing(approach.compassBearing)} ({approach.compassBearing}°)
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Select
                                value={phase.movementType}
                                onValueChange={(value) => handlePhaseChange(idx, 'movementType', value)}
                              >
                                <SelectTrigger className="h-7 text-xs" data-tab-col={2} data-tab-row={visualRow}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {movementTypes.map((mt) => (
                                    <SelectItem key={mt.value} value={mt.value}>
                                      {mt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                type="number"
                                min="1"
                                max="8"
                                value={phase.numOfLanes}
                                onChange={(e) => handlePhaseChange(idx, 'numOfLanes', parseInt(e.target.value) || 1)}
                                className="h-7 w-12 text-sm"
                                data-tab-col={3}
                                data-tab-row={visualRow}
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-center">
                              <Checkbox
                                checked={phase.isOverlap}
                                onCheckedChange={(checked) => handlePhaseChange(idx, 'isOverlap', Boolean(checked))}
                                data-tab-col={4}
                                data-tab-row={visualRow}
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-center">
                              <Select
                                value={String(phase.isPedestrian ?? 0)}
                                onValueChange={(v) => handlePhaseChange(idx, 'isPedestrian', parseInt(v, 10))}
                              >
                                <SelectTrigger
                                  className="h-7 text-xs w-14 mx-auto"
                                  data-tab-col={5}
                                  data-tab-row={visualRow}
                                  title="Pedestrian crossing: 0 none · 1 assigned · 2 opposite · 3 diagonal · 4 diagonal 90°"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">0</SelectItem>
                                  <SelectItem value="1">1</SelectItem>
                                  <SelectItem value="2">2</SelectItem>
                                  <SelectItem value="3">3</SelectItem>
                                  <SelectItem value="4">4</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeletePhase(idx)}
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                title="Delete phase"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-grey-200">
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={!selectedSignalId || pendingPhases.length === 0 || isProcessing}
              className="bg-primary-600 hover:bg-primary-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {isProcessing
                ? "Saving..."
                : isEditMode
                  ? `Save ${pendingPhases.length} Phase${pendingPhases.length !== 1 ? "s" : ""}`
                  : `Create ${pendingPhases.length} Phase${pendingPhases.length !== 1 ? "s" : ""}`
              }
            </Button>
          </div>
        </div>
    </>
  );

  if (inline) {
    return (
      <div className="rounded-lg border border-grey-200 bg-white p-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span>{titleText}</span>
            {titleBadge}
          </h2>
          {signalSelector}
        </div>
        {body}
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]">
        {/* Header with title and signal selector */}
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="flex items-center gap-2">
              <span>{titleText}</span>
              {titleBadge}
            </DialogTitle>
            {signalSelector}
          </div>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
