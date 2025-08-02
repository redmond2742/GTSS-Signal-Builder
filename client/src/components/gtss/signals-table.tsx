import { useState, useEffect } from "react";
import { Signal } from "@shared/schema";
import { useSignals } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, Map, List, Navigation, ChevronUp, ChevronDown } from "lucide-react";
import SignalModal from "./signal-modal";
import BulkSignalModal from "./bulk-signal-modal";
import { SignalsMap } from "@/components/ui/signals-map";

type SortField = 'signalId' | 'streetName1' | 'streetName2' | 'coordinates';
type SortDirection = 'asc' | 'desc';

export default function SignalsTable() {
  const [editingSignal, setEditingSignal] = useState<Signal | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [sortField, setSortField] = useState<SortField>('signalId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { signals } = useGTSSStore();
  const { toast } = useToast();
  const signalHooks = useSignals();

  const handleEdit = (signal: Signal) => {
    setEditingSignal(signal);
    setShowModal(true);
  };

  const handleDelete = (signalId: string) => {
    if (confirm("Are you sure you want to delete this signal? This will also delete all related phases and detectors.")) {
      try {
        signalHooks.delete(signalId);
        toast({
          title: "Success",
          description: "Signal deleted successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete signal",
          variant: "destructive",
        });
      }
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedSignals = () => {
    return [...signals].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'signalId':
          aValue = a.signalId;
          bValue = b.signalId;
          break;
        case 'streetName1':
          aValue = a.streetName1;
          bValue = b.streetName1;
          break;
        case 'streetName2':
          aValue = a.streetName2;
          bValue = b.streetName2;
          break;
        case 'coordinates':
          aValue = `${a.latitude},${a.longitude}`;
          bValue = `${b.latitude},${b.longitude}`;
          break;
        default:
          aValue = a.signalId;
          bValue = b.signalId;
      }

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  };

  const handleRowClick = (signal: Signal) => {
    handleEdit(signal);
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



  return (
    <div className="max-w-6xl">
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 flex flex-row items-center justify-between text-[13px]">
          <div className="flex space-x-2">
            <Button onClick={() => setShowBulkModal(true)} variant="outline" className="border-primary-200 text-primary-700 hover:bg-primary-50">
              <Navigation className="w-4 h-4 mr-2" />
              Add Multiple
            </Button>
            <Button onClick={handleAdd} className="bg-primary-600 hover:bg-primary-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Signal
            </Button>
          </div>
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
                      <SortableHeader field="signalId">Signal ID</SortableHeader>
                      <SortableHeader field="streetName1">Street 1</SortableHeader>
                      <SortableHeader field="streetName2">Street 2</SortableHeader>
                      <SortableHeader field="coordinates">Coordinates</SortableHeader>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-grey-500">
                          No signals configured. Add your first signal to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      getSortedSignals().map((signal) => (
                        <TableRow 
                          key={signal.id}
                          className="hover:bg-grey-50 cursor-pointer transition-colors"
                          onClick={() => handleRowClick(signal)}
                        >
                          <TableCell className="font-medium text-grey-900">{signal.signalId}</TableCell>
                          <TableCell className="text-grey-600">{signal.streetName1}</TableCell>
                          <TableCell className="text-grey-600">{signal.streetName2}</TableCell>
                          <TableCell className="text-grey-600">
                            {signal.latitude && signal.longitude 
                              ? `${signal.latitude.toFixed(4)}, ${signal.longitude.toFixed(4)}`
                              : 'Not set'
                            }
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
                    {!showModal && !showBulkModal && (
                      <SignalsMap 
                        signals={signals}
                        onSignalSelect={(signal) => handleEdit(signal)}
                        onSignalUpdate={async (signalId, updates) => {
                          try {
                            signalHooks.update(signalId, updates);
                            toast({
                              title: "Success",
                              description: "Signal updated successfully",
                            });
                          } catch (error) {
                            toast({
                              title: "Error", 
                              description: "Failed to update signal",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="w-full"
                      />
                    )}
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
      
      {showBulkModal && (
        <BulkSignalModal
          onClose={() => setShowBulkModal(false)}
        />
      )}
    </div>
  );
}
