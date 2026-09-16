import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SignalsMap from "@/components/ui/signals-map";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  crosswalkLengthCode,
  getSignalDisplayName,
  isLhtForSignalId,
  isMetricForSignalId,
  useGTSSStore,
  usePhases,
} from "gtss";
import { Phase } from "gtss/schema";
import { AlertTriangle, ChevronDown, ChevronUp, MapPin, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import BulkPhaseModal from "./bulk-phase-modal";
import { formatMovementType } from "./movement-types";
import PhaseModal from "./phase-modal";

type SortField = "phase" | "signalId" | "movementType" | "approachId" | "numOfLanes";
type SortDirection = "asc" | "desc";

interface PhasesTableProps {
  triggerAdd?: number;
  triggerBulk?: number;
}

export default function PhasesTable({ triggerAdd, triggerBulk }: PhasesTableProps) {
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [sortField, setSortField] = useState<SortField>("phase");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const {
    signals,
    phases,
    approaches,
    basicTimings,
    selectedSignalIdForTables,
    setSelectedSignalIdForTables,
  } = useGTSSStore();
  const { deepLinkTarget, setDeepLinkTarget } = useGTSSStore();

  // Use shared signal selection from store
  const filterSignal = selectedSignalIdForTables;
  const setFilterSignal = setSelectedSignalIdForTables;
  const { toast } = useToast();
  const phaseHooks = usePhases();
  // const svgRef = useRef<SVGSVGElement>(null);

  // Download diagram as JPG
  /*
  const handleDownloadImage = () => {
    if (!svgRef.current) return;
    downloadSvgAsJpg(svgRef.current, phaseDiagramFileName(filterSignal));
  };
*/
  // Handle triggers from parent component. Capture initial values so the
  // modal doesn't auto-open when the table re-mounts after navigation.
  const initialTriggerAdd = useRef(triggerAdd);
  const initialTriggerBulk = useRef(triggerBulk);

  useEffect(() => {
    if (triggerAdd !== initialTriggerAdd.current && triggerAdd && triggerAdd > 0) {
      handleAdd();
    }
  }, [triggerAdd]);

  useEffect(() => {
    if (triggerBulk !== initialTriggerBulk.current && triggerBulk && triggerBulk > 0) {
      setShowBulkModal(true);
    }
  }, [triggerBulk]);

  // Auto-select first signal on mount
  useEffect(() => {
    if (signals.length > 0 && !filterSignal) {
      setFilterSignal(signals[0].signalId);
    }
  }, [signals, filterSignal]);

  // Handle deep link to a specific phase: open modal for that phase
  useEffect(() => {
    if (deepLinkTarget?.type === "phase" && deepLinkTarget.id) {
      const phase = phases.find((p) => p.id === deepLinkTarget.id);
      if (phase) {
        setFilterSignal(phase.signalId);
        setEditingPhase(phase);
        setShowModal(true);
        setDeepLinkTarget({ type: null, id: null });
      }
    }
  }, [deepLinkTarget, phases]);

  const filteredPhases = phases.filter((phase) => phase.signalId === filterSignal);
  const orphanPhases = phases.filter(
    (phase) => !signals.some((signal) => signal.signalId === phase.signalId),
  );
  //  const signalApproaches = approaches.filter(a => a.signalId === filterSignal);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Natural sort comparison - handles numeric parts in strings properly
  const naturalCompare = (a: string, b: string): number => {
    const aParts = a.split(/(\d+)/);
    const bParts = b.split(/(\d+)/);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || "";
      const bPart = bParts[i] || "";

      const aNum = parseInt(aPart, 10);
      const bNum = parseInt(bPart, 10);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        if (aNum !== bNum) return aNum - bNum;
      } else {
        if (aPart !== bPart) return aPart.localeCompare(bPart);
      }
    }
    return 0;
  };

  const getSortedPhases = () => {
    return [...filteredPhases].sort((a, b) => {
      let comparison;

      switch (sortField) {
        case "phase":
          comparison = a.phase - b.phase;
          break;
        case "signalId":
          comparison = naturalCompare(a.signalId, b.signalId);
          break;
        case "movementType":
          comparison = a.movementType.localeCompare(b.movementType);
          break;
        case "approachId":
          comparison = naturalCompare(a.approachId || "", b.approachId || "");
          break;
        case "numOfLanes":
          comparison = (a.numOfLanes || 1) - (b.numOfLanes || 1);
          break;
        default:
          comparison = a.phase - b.phase;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  };

  const handleRowClick = (phase: Phase) => {
    setEditingPhase(phase);
    setShowModal(true);
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="text-xs font-medium text-grey-500 uppercase tracking-wider cursor-pointer hover:bg-grey-100 transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center justify-between">
        {children}
        <div className="flex flex-col ml-1">
          <ChevronUp
            className={`w-3 h-3 ${sortField === field && sortDirection === "asc" ? "text-primary-600" : "text-grey-300"}`}
          />
          <ChevronDown
            className={`w-3 h-3 -mt-1 ${sortField === field && sortDirection === "desc" ? "text-primary-600" : "text-grey-300"}`}
          />
        </div>
      </div>
    </TableHead>
  );

  const handleDeleteOrphanPhases = () => {
    if (orphanPhases.length === 0) {
      return;
    }

    if (
      !confirm(
        `Delete ${orphanPhases.length} orphaned phase${orphanPhases.length > 1 ? "s" : ""}? This action cannot be undone.`,
      )
    ) {
      return;
    }

    orphanPhases.forEach((phase) => phaseHooks.delete(phase.id));
    if (filterSignal && !signals.some((signal) => signal.signalId === filterSignal)) {
      setFilterSignal(signals[0]?.signalId || "");
    }
    toast({
      title: "Orphaned phases removed",
      description: `${orphanPhases.length} phase${orphanPhases.length > 1 ? "s" : ""} deleted.`,
    });
  };

  const handleAdd = () => {
    setEditingPhase(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingPhase(null);
  };

  return (
    <div className="max-w-6xl h-full">
      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="phases-split"
        className="flex-1 min-h-[420px] rounded-lg border border-grey-200 bg-white overflow-hidden"
      >
        <ResizablePanel defaultSize={40} minSize={12} className="relative z-0">
          {signals.length === 0 ? (
            <div className="w-full h-full bg-grey-50 flex items-center justify-center">
              <div className="text-center text-grey-500">
                <MapPin className="w-6 h-6 mx-auto mb-1 text-grey-400" />
                <p className="text-xs">No signals to display</p>
              </div>
            </div>
          ) : (
            <div className="w-full h-full relative z-0">
              {filterSignal ? (
                <SignalsMap
                  signals={signals.filter((s) => s.signalId === filterSignal)}
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full bg-grey-100 flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-grey-400" />
                </div>
              )}
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="bg-grey-200 hover:bg-primary-300 transition-colors"
        />
        <ResizablePanel defaultSize={60} minSize={20} className="flex flex-col min-h-0">
          <Card className="rounded-none border-0 flex flex-col h-full min-h-0">
            <CardHeader className="bg-grey-50 p-0" />
            <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
              {orphanPhases.length > 0 && (
                <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex items-start gap-2 text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    <div>
                      <p className="text-xs font-medium">Orphaned phases detected</p>
                      <p className="text-xs text-amber-700">
                        {orphanPhases.length} phase{orphanPhases.length > 1 ? "s" : ""} reference
                        deleted signals.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteOrphanPhases}
                    className="h-7 px-2 text-xs text-amber-700 border-amber-200 hover:bg-amber-100"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete Orphans
                  </Button>
                </div>
              )}
              {signals.length > 0 && (
                <div className="px-4 py-3 border-b border-grey-100 flex items-center gap-3">
                  <div className="text-xs font-medium text-grey-700">Filter by Signals</div>
                  <div className="flex-1">
                    <Select value={filterSignal} onValueChange={setFilterSignal}>
                      <SelectTrigger className="w-full h-8 text-sm">
                        <SelectValue placeholder="Select Signal" />
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
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-grey-50 border-b border-grey-200">
                      <SortableHeader field="signalId">Signal ID</SortableHeader>
                      <SortableHeader field="phase">Phase</SortableHeader>
                      <SortableHeader field="movementType">Movement</SortableHeader>
                      <SortableHeader field="approachId">Approach</SortableHeader>
                      <SortableHeader field="numOfLanes">Lanes</SortableHeader>
                      <TableHead
                        className="text-xs font-medium text-grey-500 uppercase tracking-wider text-center"
                        title="Pedestrian crossing: 0 none · 1 assigned · 2 both · 3 opposite · 4 diagonal · 5 other diagonal · 6 both diagonals (X) · 7 all directions (4 crosswalks + X)">
                        Ped
                      </TableHead>
                      <TableHead
                        className="text-xs font-medium text-grey-500 uppercase tracking-wider"
                        title="Crosswalk length. A measured value, otherwise the estimate phases.txt carries: LE-# from lanes, TE-# from ped clearance time."
                      >
                        CW
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPhases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-grey-500">
                          {filterSignal === "all"
                            ? "No phases configured. Add your first phase to get started."
                            : "No phases found for the selected signal."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      getSortedPhases().map((phase) => (
                        <TableRow
                          key={phase.id}
                          className="hover:bg-grey-50 cursor-pointer transition-colors"
                          onClick={() => handleRowClick(phase)}
                        >
                          <TableCell className="font-medium text-grey-900 text-xs py-1 px-2">
                            {phase.signalId}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1 px-2">
                            {phase.phase}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1 px-2">
                            {formatMovementType(
                              phase.movementType,
                              isLhtForSignalId(phase.signalId),
                            )}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1 px-2">
                            {phase.approachId || "-"}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1 px-2">
                            {phase.numOfLanes}
                          </TableCell>
                          <TableCell
                            className="text-grey-600 text-xs py-1 px-2 text-center"
                            title="Pedestrian crossing: 0 none · 1 assigned · 2 both · 3 opposite · 4 diagonal · 5 other diagonal · 6 both diagonals (X) · 7 all directions (4 crosswalks + X)"
                          >
                            {phase.isPedestrian ?? 0}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1 px-2">
                            {crosswalkLengthCode(
                              phase,
                              phases.filter((p) => p.signalId === phase.signalId),
                              basicTimings.filter((t) => t.signalId === phase.signalId),
                              approaches.filter((a) => a.signalId === phase.signalId),
                              isMetricForSignalId(phase.signalId),
                            ) || "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </ResizablePanel>
      </ResizablePanelGroup>

      {showModal && (
        <PhaseModal
          phase={editingPhase}
          onClose={handleModalClose}
          preSelectedSignalId={filterSignal !== "all" ? filterSignal : undefined}
        />
      )}

      {showBulkModal && (
        <BulkPhaseModal
          onClose={() => setShowBulkModal(false)}
          preSelectedSignalId={filterSignal !== "all" ? filterSignal : undefined}
        />
      )}
    </div>
  );
}
