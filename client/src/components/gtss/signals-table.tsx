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
import { Plus, Edit, Trash2, Map, List, Navigation, ChevronUp, ChevronDown, Eye, MapPin, Edit3 } from "lucide-react";
import SignalModal from "./signal-modal";
import BulkSignalModal from "./bulk-signal-modal";
import SignalsMap from "@/components/ui/signals-map";
import { getDerivedStreetNames } from "@/lib/utils";



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

  const { signals, approaches, navigateToSignalDetails } = useGTSSStore();
  const { toast } = useToast();
  const signalHooks = useSignals();

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

  const handleSignalUpdate = (signalId: string, updates: Partial<Signal>) => {
    try {
      const updatedSignal = signalHooks.update(signalId, updates);
      if (updatedSignal) {
        toast({
          title: "Success",
          description: "Signal updated successfully",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update signal",
        variant: "destructive",
      });
    }
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
    // Navigate to signal details view for creating a new signal
    navigateToSignalDetails(null);
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

  // Natural sort comparison - handles numeric parts in strings properly
  // e.g., "SIG-1", "SIG-2", "SIG-11" instead of "SIG-1", "SIG-11", "SIG-2"
  const naturalCompare = (a: string, b: string): number => {
    const aParts = a.split(/(\d+)/);
    const bParts = b.split(/(\d+)/);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || '';
      const bPart = bParts[i] || '';

      // Check if both parts are numeric
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

  const getSortedSignals = () => {
    return [...signals].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'signalId':
          comparison = naturalCompare(a.signalId, b.signalId);
          break;
        case 'streetName1':
          comparison = a.streetName1.localeCompare(b.streetName1);
          break;
        case 'streetName2':
          comparison = a.streetName2.localeCompare(b.streetName2);
          break;
        case 'coordinates':
          comparison = `${a.latitude},${a.longitude}`.localeCompare(`${b.latitude},${b.longitude}`);
          break;
        default:
          comparison = naturalCompare(a.signalId, b.signalId);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
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
        <div className="h-48 sm:h-64 relative z-0">
          {signals.length === 0 ? (
            <div className="w-full h-full bg-grey-50 flex items-center justify-center">
              <div className="text-center text-grey-500">
                <MapPin className="w-6 h-6 mx-auto mb-1 text-grey-400" />
                <p className="text-xs">No signals to display</p>
              </div>
            </div>
          ) : (
            <div className="w-full h-full relative z-0">
              <SignalsMap 
                signals={signals} 
                onSignalSelect={(signal) => navigateToSignalDetails(signal.signalId)}
                onSignalUpdate={handleSignalUpdate}
                className="w-full h-full"
              />
            </div>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-xs text-grey-500">
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
                        className="hover:bg-grey-50 cursor-pointer transition-colors"
                        onClick={() => navigateToSignalDetails(signal.signalId)}
                        data-testid={`row-signal-${signal.signalId}`}
                      >
                        <TableCell className="font-medium text-grey-900 text-xs py-1.5 px-2">{signal.signalId}</TableCell>
                        <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                          {getDerivedStreetNames(signal.signalId, approaches).streetName1 || signal.streetName1 || '-'}
                        </TableCell>
                        <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                          {getDerivedStreetNames(signal.signalId, approaches).streetName2 || signal.streetName2 || '-'}
                        </TableCell>
                        <TableCell className="text-grey-600 text-xs py-1.5 px-2">
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
