import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Signal } from "@shared/schema";
import { useSignals } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, Map, List, Navigation, ChevronUp, ChevronDown, Eye, MapPin, Edit3 } from "lucide-react";
import SignalModal from "./signal-modal";
import BulkSignalModal from "./bulk-signal-modal";
import { SignalsMap } from "@/components/ui/signals-map";



type SortField = 'signalId' | 'streetName1' | 'streetName2' | 'coordinates';
type SortDirection = 'asc' | 'desc';

interface SignalsTableProps {
  triggerAdd?: number;
  triggerBulk?: number;
}

export default function SignalsTable({ triggerAdd, triggerBulk }: SignalsTableProps) {
  const [editingSignal, setEditingSignal] = useState<Signal | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [sortField, setSortField] = useState<SortField>('signalId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { signals } = useGTSSStore();
  const { toast } = useToast();
  const signalHooks = useSignals();
  const [, navigate] = useLocation();

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
      className="text-xs font-medium text-grey-500 uppercase tracking-wider cursor-pointer hover:bg-grey-100 transition-colors py-1.5 px-2"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center justify-between">
        {children}
        <div className="flex flex-col ml-1">
          <ChevronUp 
            className={`w-2 h-2 ${sortField === field && sortDirection === 'asc' ? 'text-primary-600' : 'text-grey-300'}`} 
          />
          <ChevronDown 
            className={`w-2 h-2 -mt-0.5 ${sortField === field && sortDirection === 'desc' ? 'text-primary-600' : 'text-grey-300'}`} 
          />
        </div>
      </div>
    </TableHead>
  );



  return (
    <div className="max-w-6xl">
      <div className="mb-4 bg-white rounded-lg border border-grey-200 overflow-hidden">
        <div className="h-32 relative">
          {signals.length === 0 ? (
            <div className="w-full h-full bg-grey-50 flex items-center justify-center">
              <div className="text-center text-grey-500">
                <MapPin className="w-6 h-6 mx-auto mb-1 text-grey-400" />
                <p className="text-xs">No signals to display</p>
              </div>
            </div>
          ) : (
            <SignalsMap signals={signals} />
          )}
        </div>
      </div>
      <Card>

        <CardContent className="p-0">
          <div className="w-full">
            {/* Signals Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-grey-50 border-b border-grey-200">
                    <SortableHeader field="signalId">Signal ID</SortableHeader>
                    <SortableHeader field="streetName1">Street 1</SortableHeader>
                    <SortableHeader field="streetName2">Street 2</SortableHeader>
                    <SortableHeader field="coordinates">Coordinates</SortableHeader>
                    <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider py-1.5 px-2">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-xs text-grey-500">
                        <div className="flex flex-col items-center space-y-2">
                          <MapPin className="w-8 h-8 text-grey-300" />
                          <p>No traffic signals configured</p>
                          <p className="text-grey-400">Add your first signal to get started</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    getSortedSignals().map((signal) => (
                      <TableRow 
                        key={signal.id}
                        className="hover:bg-grey-50 transition-colors"
                      >
                        <TableCell className="font-medium text-grey-900 text-xs py-1.5 px-2">{signal.signalId}</TableCell>
                        <TableCell className="text-grey-600 text-xs py-1.5 px-2">{signal.streetName1}</TableCell>
                        <TableCell className="text-grey-600 text-xs py-1.5 px-2">{signal.streetName2}</TableCell>
                        <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                          {signal.latitude && signal.longitude 
                            ? `${signal.latitude.toFixed(4)}, ${signal.longitude.toFixed(4)}`
                            : 'Not set'
                          }
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <div className="flex items-center space-x-1">
                            <Button
                              variant="ghost" 
                              size="sm"
                              onClick={() => navigate(`/signal/${signal.signalId}`)}
                              className="h-6 w-6 p-0 text-primary-600 hover:text-primary-700 hover:bg-primary-50"
                            >
                              <Edit3 className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(signal)}
                              className="h-6 w-6 p-0 text-grey-600 hover:text-grey-700 hover:bg-grey-100"
                            >
                              <MapPin className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
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
