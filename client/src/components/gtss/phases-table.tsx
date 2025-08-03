import { useState, useEffect } from "react";
import { Phase, InsertPhase } from "@shared/schema";
import { usePhases } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Map, ChevronUp, ChevronDown } from "lucide-react";
import PhaseModal from "./phase-modal";
import VisualPhaseEditor from "./visual-phase-editor";

type SortField = 'phase' | 'signalId' | 'movementType' | 'bearing';
type SortDirection = 'asc' | 'desc';

export default function PhasesTable() {
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showVisualEditor, setShowVisualEditor] = useState(false);
  const [filterSignal, setFilterSignal] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>('phase');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { signals, phases } = useGTSSStore();
  const { toast } = useToast();
  const phaseHooks = usePhases();

  // Auto-select first signal on mount
  useEffect(() => {
    if (signals.length > 0 && !filterSignal) {
      setFilterSignal(signals[0].signalId);
    }
  }, [signals, filterSignal]);

  const filteredPhases = phases.filter(phase => phase.signalId === filterSignal);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedPhases = () => {
    return [...filteredPhases].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'phase':
          aValue = a.phase;
          bValue = b.phase;
          break;
        case 'signalId':
          aValue = a.signalId;
          bValue = b.signalId;
          break;
        case 'movementType':
          aValue = a.movementType;
          bValue = b.movementType;
          break;
        case 'bearing':
          aValue = a.compassBearing || 0;
          bValue = b.compassBearing || 0;
          break;
        default:
          aValue = a.phase;
          bValue = b.phase;
      }

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
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

  const handleEdit = (phase: Phase) => {
    setEditingPhase(phase);
    setShowModal(true);
  };





  const handleAdd = () => {
    setEditingPhase(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingPhase(null);
  };

  const handleVisualEditorClose = () => {
    setShowVisualEditor(false);
  };

  const handleBulkPhasesCreate = async (phases: InsertPhase[]) => {
    try {
      for (const phaseData of phases) {
        phaseHooks.save(phaseData);
      }
      // Don't show toast or close the visual editor to allow rapid phase creation
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create some phases",
        variant: "destructive",
      });
    }
  };

  const getSignalInfo = (signalId: string) => {
    const signal = signals.find(s => s.signalId === signalId);
    return signal ? `${signal.signalId} - ${signal.streetName1} & ${signal.streetName2}` : signalId;
  };



  return (
    <div className="max-w-6xl">
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 flex flex-row items-center justify-between px-3 py-2">
          <div>
          </div>
          <div className="flex space-x-2">
            {signals.length === 0 ? (
              <div className="p-2 bg-warning-50 border border-warning-200 rounded-md">
                <p className="text-xs text-warning-700">
                  No signals configured. Please add signals before creating phases.
                </p>
              </div>
            ) : (
              <>
                <Select value={filterSignal} onValueChange={setFilterSignal}>
                  <SelectTrigger className="w-80 h-7 text-xs">
                    <SelectValue placeholder="Filter by Signal" />
                  </SelectTrigger>
                  <SelectContent>
                    {signals.map((signal) => (
                      <SelectItem key={signal.signalId} value={signal.signalId}>
                        {getSignalInfo(signal.signalId)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAdd} className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700">
                  <Plus className="w-3 h-3 mr-1" />
                  Add Phase
                </Button>
                {filterSignal && (
                  <Button 
                    onClick={() => setShowVisualEditor(true)} 
                    variant="outline"
                    className="h-7 px-2 text-xs border-success-200 text-success-600 hover:bg-success-50"
                  >
                    <Map className="w-3 h-3 mr-1" />
                    Visual Editor
                  </Button>
                )}
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-grey-50 border-b border-grey-200">
                  <SortableHeader field="phase">Phase</SortableHeader>
                  <SortableHeader field="signalId">Signal ID</SortableHeader>
                  <SortableHeader field="movementType">Movement</SortableHeader>
                  <SortableHeader field="bearing">Bearing</SortableHeader>

                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPhases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-grey-500">
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
                      <TableCell className="font-medium text-grey-900">{phase.phase}</TableCell>
                      <TableCell className="text-grey-600">{phase.signalId}</TableCell>
                      <TableCell className="text-grey-600">
                        <div className="flex items-center space-x-2">
                          <span>{phase.movementType}</span>
                          {phase.isOverlap && (
                            <Badge variant="secondary" className="bg-orange-100 text-orange-800 text-xs">
                              Overlap
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-grey-600">
                        {phase.compassBearing ? `${phase.compassBearing}°` : 'N/A'}
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

      {showVisualEditor && filterSignal !== "all" && (
        <Dialog open onOpenChange={handleVisualEditorClose}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle>Visual Phase Editor</DialogTitle>
            </DialogHeader>
            <VisualPhaseEditor
              signal={signals.find(s => s.signalId === filterSignal)!}
              onPhasesCreate={handleBulkPhasesCreate}
              onClose={handleVisualEditorClose}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
