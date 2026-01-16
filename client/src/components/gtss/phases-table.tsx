import { useState, useEffect, useRef } from "react";
import { Phase } from "@shared/schema";
import { usePhases } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronUp, ChevronDown, AlertTriangle, Trash2, MapPin, Download } from "lucide-react";
import SignalsMap from "@/components/ui/signals-map";
import { Button } from "@/components/ui/button";
import PhaseModal from "./phase-modal";
import BulkPhaseModal from "./bulk-phase-modal";
import PhaseDiagram from "./phase-diagram";
import { getSignalDisplayName } from "@/lib/utils";

type SortField = 'phase' | 'signalId' | 'movementType' | 'approachId' | 'numOfLanes';
type SortDirection = 'asc' | 'desc';

interface PhasesTableProps {
  triggerAdd?: number;
  triggerBulk?: number;
}

export default function PhasesTable({ triggerAdd, triggerBulk }: PhasesTableProps) {
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [filterSignal, setFilterSignal] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>('phase');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { signals, phases, approaches } = useGTSSStore();
  const { toast } = useToast();
  const phaseHooks = usePhases();
  const svgRef = useRef<SVGSVGElement>(null);

  // Download diagram as JPG
  const handleDownloadImage = () => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    const svgClone = svg.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute('width', '340');
    svgClone.setAttribute('height', '360');

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = 340 * scale;
      canvas.height = 360 * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, 340, 360);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filterSignal || 'phase-diagram'}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.95);

      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  };

  // Handle triggers from parent component
  useEffect(() => {
    if (triggerAdd && triggerAdd > 0) {
      handleAdd();
    }
  }, [triggerAdd]);

  useEffect(() => {
    if (triggerBulk && triggerBulk > 0) {
      setShowBulkModal(true);
    }
  }, [triggerBulk]);

  // Auto-select first signal on mount
  useEffect(() => {
    if (signals.length > 0 && !filterSignal) {
      setFilterSignal(signals[0].signalId);
    }
  }, [signals, filterSignal]);

  const filteredPhases = phases.filter(phase => phase.signalId === filterSignal);
  const orphanPhases = phases.filter(phase => !signals.some(signal => signal.signalId === phase.signalId));
  const signalApproaches = approaches.filter(a => a.signalId === filterSignal);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Natural sort comparison - handles numeric parts in strings properly
  const naturalCompare = (a: string, b: string): number => {
    const aParts = a.split(/(\d+)/);
    const bParts = b.split(/(\d+)/);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || '';
      const bPart = bParts[i] || '';

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
      let comparison = 0;

      switch (sortField) {
        case 'phase':
          comparison = a.phase - b.phase;
          break;
        case 'signalId':
          comparison = naturalCompare(a.signalId, b.signalId);
          break;
        case 'movementType':
          comparison = a.movementType.localeCompare(b.movementType);
          break;
        case 'approachId':
          comparison = naturalCompare(a.approachId || '', b.approachId || '');
          break;
        case 'numOfLanes':
          comparison = (a.numOfLanes || 1) - (b.numOfLanes || 1);
          break;
        default:
          comparison = a.phase - b.phase;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
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
            className={`w-3 h-3 ${sortField === field && sortDirection === 'asc' ? 'text-primary-600' : 'text-grey-300'}`} 
          />
          <ChevronDown 
            className={`w-3 h-3 -mt-1 ${sortField === field && sortDirection === 'desc' ? 'text-primary-600' : 'text-grey-300'}`} 
          />
        </div>
      </div>
    </TableHead>
  );

  const handleDeleteOrphanPhases = () => {
    if (orphanPhases.length === 0) {
      return;
    }

    if (!confirm(`Delete ${orphanPhases.length} orphaned phase${orphanPhases.length > 1 ? "s" : ""}? This action cannot be undone.`)) {
      return;
    }

    orphanPhases.forEach((phase) => phaseHooks.delete(phase.id));
    if (filterSignal && !signals.some(signal => signal.signalId === filterSignal)) {
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
    <div className="max-w-6xl">
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 p-3">
          {signals.length === 0 ? (
            <div className="p-2 bg-warning-50 border border-warning-200 rounded-md">
              <p className="text-xs text-warning-700">
                No signals configured. Please add signals before creating phases.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
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
              {filterSignal && (
                <div className="flex items-stretch gap-3">
                  {filteredPhases.length > 0 && (() => {
                    const selectedSignal = signals.find(s => s.signalId === filterSignal);
                    const signalName = selectedSignal ? getSignalDisplayName(selectedSignal, approaches) : filterSignal;
                    return (
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className="text-sm font-semibold text-grey-700 mb-1 text-center">
                          {signalName}
                        </div>
                        <div className="w-72 h-72 border border-grey-300 rounded-md overflow-hidden bg-white">
                          <PhaseDiagram
                            phases={filteredPhases}
                            approaches={signalApproaches}
                            svgRef={svgRef}
                            compact
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadImage}
                          className="mt-2 h-7 text-xs"
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Download JPG
                        </Button>
                      </div>
                    );
                  })()}
                  {(() => {
                    const selectedSignal = signals.find(s => s.signalId === filterSignal);
                    return (
                      <div className="flex-1 h-72">
                        {selectedSignal && selectedSignal.latitude && selectedSignal.longitude ? (
                          <div className="w-full h-full border border-grey-300 rounded-md overflow-hidden bg-white relative z-0">
                            <SignalsMap signals={[selectedSignal]} className="w-full h-full" />
                          </div>
                        ) : (
                          <div className="w-full h-full border border-grey-300 rounded-md bg-grey-100 flex items-center justify-center">
                            <MapPin className="w-6 h-6 text-grey-400" />
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {orphanPhases.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2 text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="text-xs font-medium">Orphaned phases detected</p>
                  <p className="text-xs text-amber-700">
                    {orphanPhases.length} phase{orphanPhases.length > 1 ? "s" : ""} reference deleted signals.
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-grey-50 border-b border-grey-200">
                  <SortableHeader field="signalId">Signal ID</SortableHeader>
                  <SortableHeader field="phase">Phase</SortableHeader>
                  <SortableHeader field="movementType">Movement</SortableHeader>
                  <SortableHeader field="approachId">Approach</SortableHeader>
                  <SortableHeader field="numOfLanes">Lanes</SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPhases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-grey-500">
                      {filterSignal === "all"
                        ? "No phases configured. Add your first phase to get started."
                        : "No phases found for the selected signal."
                      }
                    </TableCell>
                  </TableRow>
                ) : (
                  getSortedPhases().map((phase) => (
                    <TableRow
                      key={phase.id}
                      className="hover:bg-grey-50 cursor-pointer transition-colors"
                      onClick={() => handleRowClick(phase)}
                    >
                      <TableCell className="font-medium text-grey-900 text-xs py-1 px-2">{phase.signalId}</TableCell>
                      <TableCell className="text-grey-600 text-xs py-1 px-2">{phase.phase}</TableCell>
                      <TableCell className="text-grey-600 text-xs py-1 px-2">
                        <div className="flex items-center space-x-1">
                          <span>{phase.movementType}</span>
                          {phase.isOverlap && (
                            <Badge variant="secondary" className="bg-orange-100 text-orange-800" style={{ fontSize: '10px', padding: '1px 4px' }}>
                              Overlap
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-grey-600 text-xs py-1 px-2">
                        {phase.approachId || '-'}
                      </TableCell>
                      <TableCell className="text-grey-600 text-xs py-1 px-2">
                        {phase.numOfLanes}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
