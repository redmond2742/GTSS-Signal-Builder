import { useState, useEffect } from "react";
import { Detector } from "@shared/schema";
import { useDetectors } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronUp, ChevronDown } from "lucide-react";

type SortField = 'signalId' | 'detectorChannel' | 'phase' | 'detTechnologyType' | 'purpose';
type SortDirection = 'asc' | 'desc';
import DetectorModal from "./detector-modal";

interface DetectorsTableProps {
  triggerAdd?: number;
}

export default function DetectorsTable({ triggerAdd }: DetectorsTableProps) {
  const [editingDetector, setEditingDetector] = useState<Detector | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>('signalId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { detectors, signals } = useGTSSStore();
  
  // Auto-select first signal on mount
  useEffect(() => {
    if (signals.length > 0 && !selectedSignalId) {
      setSelectedSignalId(signals[0].signalId);
    }
  }, [signals, selectedSignalId]);
  const { toast } = useToast();
  const detectorHooks = useDetectors();

  // Handle triggers from parent component
  useEffect(() => {
    if (triggerAdd && triggerAdd > 0) {
      handleAdd();
    }
  }, [triggerAdd]);

  // Filter detectors by selected signal
  const filteredDetectors = selectedSignalId 
    ? detectors.filter(detector => detector.signalId === selectedSignalId)
    : [];

  // Get signal display name
  const getSignalDisplayName = (signalId: string) => {
    const signal = signals.find(s => s.signalId === signalId);
    return signal 
      ? `${signal.signalId} - ${signal.streetName1} & ${signal.streetName2}`
      : signalId;
  };

  const handleEdit = (detector: Detector) => {
    setEditingDetector(detector);
    setShowModal(true);
  };



  const handleAdd = () => {
    setEditingDetector(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingDetector(null);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleRowClick = (detector: Detector) => {
    setEditingDetector(detector);
    setShowModal(true);
  };

  const getSortedDetectors = () => {
    return [...filteredDetectors].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'signalId':
          aValue = a.signalId;
          bValue = b.signalId;
          break;
        case 'detectorChannel':
          aValue = a.detectorChannel;
          bValue = b.detectorChannel;
          break;
        case 'phase':
          aValue = a.phase || 0;
          bValue = b.phase || 0;
          break;
        case 'detTechnologyType':
          aValue = a.detTechnologyType;
          bValue = b.detTechnologyType;
          break;
        case 'purpose':
          aValue = a.purpose;
          bValue = b.purpose;
          break;
        default:
          aValue = a.signalId;
          bValue = b.signalId;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return sortDirection === 'asc' 
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });
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
        <CardHeader className="bg-grey-50 border-b border-grey-200 px-3 py-2">
          <div className="flex items-center space-x-2">
            <Select value={selectedSignalId} onValueChange={setSelectedSignalId}>
              <SelectTrigger className="w-80 h-7 text-xs">
                <SelectValue placeholder="Choose signal to view detectors" />
              </SelectTrigger>
              <SelectContent>
                {signals.map((signal) => (
                  <SelectItem key={signal.id} value={signal.signalId}>
                    {getSignalDisplayName(signal.signalId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSignalId && (
              <span className="text-xs text-grey-600">({filteredDetectors.length} detector(s))</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-grey-50 border-b border-grey-200">
                  <SortableHeader field="signalId">Signal ID</SortableHeader>
                  <SortableHeader field="channel">Channel</SortableHeader>
                  <SortableHeader field="phase">Phase</SortableHeader>
                  <SortableHeader field="technologyType">Technology</SortableHeader>
                  <SortableHeader field="purpose">Purpose</SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedSignalId ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4 text-xs text-grey-500">
                      Please select a signal above to view its detectors.
                    </TableCell>
                  </TableRow>
                ) : filteredDetectors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4 text-xs text-grey-500">
                      No detectors configured for this signal. Add your first detector to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  getSortedDetectors().map((detector) => (
                    <TableRow 
                      key={detector.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleRowClick(detector)}
                    >
                      <TableCell className="font-medium text-grey-900 text-xs py-1.5 px-2">{detector.signalId}</TableCell>
                      <TableCell className="text-grey-600 text-xs py-1.5 px-2">{detector.channel}</TableCell>
                      <TableCell className="text-grey-600 text-xs py-1.5 px-2">{detector.phase}</TableCell>
                      <TableCell className="py-1.5 px-2">
                        <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs py-0 px-1.5 h-4">
                          {detector.technologyType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-grey-600 text-xs py-1.5 px-2">{detector.purpose}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {showModal && (
        <DetectorModal
          detector={editingDetector}
          onClose={handleModalClose}
          preSelectedSignalId={editingDetector ? undefined : selectedSignalId}
        />
      )}
    </div>
  );
}
