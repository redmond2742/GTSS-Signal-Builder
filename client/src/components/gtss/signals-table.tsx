import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Signal } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, Map, List } from "lucide-react";
import SignalModal from "./signal-modal";
import { SignalsMap } from "@/components/ui/signals-map";

export default function SignalsTable() {
  const [editingSignal, setEditingSignal] = useState<Signal | null>(null);
  const [showModal, setShowModal] = useState(false);
  const { signals, setSignals, addSignal, updateSignal, deleteSignal } = useGTSSStore();
  const { toast } = useToast();

  const { data: signalsData, isLoading } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
  });

  const deleteSignalMutation = useMutation({
    mutationFn: async (signalId: string) => {
      await apiRequest("DELETE", `/api/signals/${signalId}`);
    },
    onSuccess: (_, signalId) => {
      deleteSignal(signalId);
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/phases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/detectors"] });
      toast({
        title: "Success",
        description: "Signal deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete signal",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (signalsData) {
      setSignals(signalsData);
    }
  }, [signalsData, setSignals]);

  const handleEdit = (signal: Signal) => {
    setEditingSignal(signal);
    setShowModal(true);
  };

  const handleDelete = (signalId: string) => {
    if (confirm("Are you sure you want to delete this signal? This will also delete all related phases and detectors.")) {
      deleteSignalMutation.mutate(signalId);
    }
  };

  const handleAdd = () => {
    setEditingSignal(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingSignal(null);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-6xl">
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-grey-800">Signal Locations</CardTitle>
            <p className="text-sm text-grey-600">Manage traffic signal installation locations</p>
          </div>
          <Button onClick={handleAdd} className="bg-primary-600 hover:bg-primary-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Signal
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="list" className="w-full">
            <div className="flex items-center justify-between px-6 py-3 border-b border-grey-200">
              <TabsList className="grid w-fit grid-cols-2">
                <TabsTrigger value="list" className="text-xs">
                  <List className="w-4 h-4 mr-2" />
                  List View
                </TabsTrigger>
                <TabsTrigger value="map" className="text-xs">
                  <Map className="w-4 h-4 mr-2" />
                  Map View
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="list" className="mt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-grey-50 border-b border-grey-200">
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Signal ID</TableHead>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Street 1</TableHead>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Street 2</TableHead>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Coordinates</TableHead>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Control Type</TableHead>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-grey-500">
                          No signals configured. Add your first signal to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      signals.map((signal) => (
                        <TableRow key={signal.id}>
                          <TableCell className="font-medium text-grey-900">{signal.signalId}</TableCell>
                          <TableCell className="text-grey-600">{signal.streetName1}</TableCell>
                          <TableCell className="text-grey-600">{signal.streetName2}</TableCell>
                          <TableCell className="text-grey-600">{signal.cntLat.toFixed(4)}, {signal.cntLon.toFixed(4)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              {signal.controlType}
                            </Badge>
                          </TableCell>
                          <TableCell className="space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(signal)}
                              className="text-primary-600 hover:text-primary-700"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(signal.signalId)}
                              className="text-red-600 hover:text-red-700"
                              disabled={deleteSignalMutation.isPending}
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
            </TabsContent>
            
            <TabsContent value="map" className="mt-0">
              <div className="p-6">
                {signals.length === 0 ? (
                  <div className="h-96 bg-grey-50 border border-grey-200 rounded-lg flex items-center justify-center">
                    <div className="text-center text-grey-500">
                      <Map className="w-12 h-12 mx-auto mb-3 text-grey-400" />
                      <h3 className="font-medium mb-1">No Signals to Display</h3>
                      <p className="text-sm">Add signal locations to see them on the map</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-grey-600">
                        Showing {signals.length} signal{signals.length !== 1 ? 's' : ''} on map
                      </p>
                      <div className="text-xs text-grey-500">
                        Click markers for details
                      </div>
                    </div>
                    <SignalsMap 
                      signals={signals}
                      onSignalSelect={(signal) => handleEdit(signal)}
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {showModal && (
        <SignalModal
          signal={editingSignal}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
