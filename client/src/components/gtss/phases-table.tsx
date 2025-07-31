import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Phase, InsertPhase } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Map } from "lucide-react";
import PhaseModal from "./phase-modal";
import VisualPhaseEditor from "./visual-phase-editor";

export default function PhasesTable() {
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showVisualEditor, setShowVisualEditor] = useState(false);
  const [filterSignal, setFilterSignal] = useState<string>("all");
  const { signals, phases, setPhases, deletePhase, addPhase } = useGTSSStore();
  const { toast } = useToast();

  const { data: phasesData, isLoading } = useQuery<Phase[]>({
    queryKey: ["/api/phases"],
  });

  const deletePhaseMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/phases/${id}`);
    },
    onSuccess: (_, id) => {
      deletePhase(id);
      queryClient.invalidateQueries({ queryKey: ["/api/phases"] });
      toast({
        title: "Success",
        description: "Phase deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete phase",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (phasesData) {
      setPhases(phasesData);
    }
  }, [phasesData, setPhases]);

  const filteredPhases = filterSignal === "all" 
    ? phases 
    : phases.filter(phase => phase.signalId === filterSignal);

  const handleEdit = (phase: Phase) => {
    setEditingPhase(phase);
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this phase?")) {
      deletePhaseMutation.mutate(id);
    }
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
        const response = await apiRequest("POST", "/api/phases", phaseData);
        const phase = await response.json();
        addPhase(phase);
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/phases"] });
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

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-6xl">
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-grey-800">Signal Phases</CardTitle>
            <p className="text-sm text-grey-600">Configure movement phases for each signal</p>
          </div>
          <div className="flex space-x-3">
            <Select value={filterSignal} onValueChange={setFilterSignal}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by Signal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Signals</SelectItem>
                {signals.map((signal) => (
                  <SelectItem key={signal.signalId} value={signal.signalId}>
                    {getSignalInfo(signal.signalId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} className="bg-primary-600 hover:bg-primary-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Phase
            </Button>
            {filterSignal !== "all" && (
              <Button 
                onClick={() => setShowVisualEditor(true)} 
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-50"
              >
                <Map className="w-4 h-4 mr-2" />
                Visual Editor
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-grey-50 border-b border-grey-200">
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Phase</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Signal ID</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Movement</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Bearing</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPhases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-grey-500">
                      {filterSignal === "all" 
                        ? "No phases configured. Add your first phase to get started."
                        : "No phases found for the selected signal."
                      }
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPhases.map((phase) => (
                    <TableRow key={phase.id}>
                      <TableCell className="font-medium text-grey-900">{phase.phase}</TableCell>
                      <TableCell className="text-grey-600">{phase.signalId}</TableCell>
                      <TableCell className="text-grey-600">{phase.movementType}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={phase.isPedestrian ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"}>
                          {phase.isPedestrian ? "Pedestrian" : "Vehicle"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-grey-600">{phase.compassBearing || "—"}°</TableCell>
                      <TableCell className="space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(phase)}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(phase.id)}
                          className="text-red-600 hover:text-red-700"
                          disabled={deletePhaseMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
