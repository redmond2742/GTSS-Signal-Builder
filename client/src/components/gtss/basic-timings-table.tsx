import { useState, useEffect } from "react";
import { BasicTiming } from "@shared/schema";
import { useBasicTimings } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronUp, ChevronDown, MapPin } from "lucide-react";
import SignalsMap from "@/components/ui/signals-map";
import BasicTimingModal from "./basic-timing-modal";
import { getSignalDisplayName } from "@/lib/utils";

type SortField = 'phase' | 'minGreen' | 'maxGreen' | 'yellow' | 'allRed' | 'vehRecallType';
type SortDirection = 'asc' | 'desc';

interface BasicTimingsTableProps {
  triggerAdd?: number;
}

export default function BasicTimingsTable({ triggerAdd }: BasicTimingsTableProps) {
  const [editingTiming, setEditingTiming] = useState<BasicTiming | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>('phase');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { basicTimings, signals, approaches } = useGTSSStore();

  // Auto-select first signal on mount
  useEffect(() => {
    if (signals.length > 0 && !selectedSignalId) {
      setSelectedSignalId(signals[0].signalId);
    }
  }, [signals, selectedSignalId]);

  const timingHooks = useBasicTimings();

  // Handle triggers from parent component
  useEffect(() => {
    if (triggerAdd && triggerAdd > 0) {
      handleAdd();
    }
  }, [triggerAdd]);

  // Filter timings by selected signal
  const filteredTimings = selectedSignalId
    ? basicTimings.filter(timing => timing.signalId === selectedSignalId)
    : [];

  const handleAdd = () => {
    setEditingTiming(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingTiming(null);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleRowClick = (timing: BasicTiming) => {
    setEditingTiming(timing);
    setShowModal(true);
  };

  const getSortedTimings = () => {
    return [...filteredTimings].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'phase':
          aValue = a.phase;
          bValue = b.phase;
          break;
        case 'minGreen':
          aValue = a.minGreen || 0;
          bValue = b.minGreen || 0;
          break;
        case 'maxGreen':
          aValue = a.maxGreen || 0;
          bValue = b.maxGreen || 0;
          break;
        case 'yellow':
          aValue = a.yellow || 0;
          bValue = b.yellow || 0;
          break;
        case 'allRed':
          aValue = a.allRed || 0;
          bValue = b.allRed || 0;
          break;
        case 'vehRecallType':
          aValue = a.vehRecallType || 'None';
          bValue = b.vehRecallType || 'None';
          break;
        default:
          aValue = a.phase;
          bValue = b.phase;
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

  const formatTime = (value: number | null) => {
    if (value === null) return '-';
    return `${value}s`;
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

  const getRecallBadgeColor = (type: string | null) => {
    switch (type) {
      case 'Max': return 'bg-red-100 text-red-800';
      case 'Min': return 'bg-yellow-100 text-yellow-800';
      case 'Soft': return 'bg-blue-100 text-blue-800';
      default: return 'bg-grey-100 text-grey-800';
    }
  };

  return (
    <div className="max-w-6xl">
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 flex flex-row items-center justify-start px-3 py-2">
          <div className="flex space-x-2 items-center">
            {signals.length === 0 ? (
              <div className="p-2 bg-warning-50 border border-warning-200 rounded-md">
                <p className="text-xs text-warning-700">
                  No signals configured. Please add signals before creating timing configurations.
                </p>
              </div>
            ) : (
              <>
                <Select value={selectedSignalId} onValueChange={setSelectedSignalId}>
                  <SelectTrigger className="w-80 h-7 text-xs">
                    <SelectValue placeholder="Choose signal to view timings" />
                  </SelectTrigger>
                  <SelectContent>
                    {signals.map((signal) => (
                      <SelectItem key={signal.signalId} value={signal.signalId}>
                        {getSignalDisplayName(signal, approaches)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSignalId && (
                  <span className="text-xs text-grey-600">({filteredTimings.length} timing(s))</span>
                )}
              </>
            )}
          </div>
          {selectedSignalId && (() => {
            const selectedSignal = signals.find(s => s.signalId === selectedSignalId);
            return (
              <div className="flex-1 ml-4 h-20">
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
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-grey-50 border-b border-grey-200">
                  <SortableHeader field="phase">Phase</SortableHeader>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider py-1.5 px-2">Ped Walk</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider py-1.5 px-2">Ped Clear</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider py-1.5 px-2">LPI</TableHead>
                  <SortableHeader field="minGreen">Min Green</SortableHeader>
                  <SortableHeader field="maxGreen">Max Green</SortableHeader>
                  <SortableHeader field="yellow">Yellow</SortableHeader>
                  <SortableHeader field="allRed">All-Red</SortableHeader>
                  <SortableHeader field="vehRecallType">Veh Recall</SortableHeader>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider py-1.5 px-2">Ped Recall</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedSignalId ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-4 text-xs text-grey-500">
                      Please select a signal above to view its timing configurations.
                    </TableCell>
                  </TableRow>
                ) : filteredTimings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-4 text-xs text-grey-500">
                      No timing configurations for this signal. Add your first timing to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  getSortedTimings().map((timing) => (
                    <TableRow
                      key={timing.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleRowClick(timing)}
                    >
                      <TableCell className="font-medium text-grey-900 text-xs py-1.5 px-2">
                        <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs py-0 px-1.5 h-4">
                          {timing.phase}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-grey-600 text-xs py-1.5 px-2">{formatTime(timing.pedWalk)}</TableCell>
                      <TableCell className="text-grey-600 text-xs py-1.5 px-2">{formatTime(timing.pedClearance)}</TableCell>
                      <TableCell className="text-grey-600 text-xs py-1.5 px-2">{formatTime(timing.leadingPedInterval)}</TableCell>
                      <TableCell className="text-grey-600 text-xs py-1.5 px-2">{formatTime(timing.minGreen)}</TableCell>
                      <TableCell className="text-grey-600 text-xs py-1.5 px-2">{formatTime(timing.maxGreen)}</TableCell>
                      <TableCell className="text-grey-600 text-xs py-1.5 px-2">{formatTime(timing.yellow)}</TableCell>
                      <TableCell className="text-grey-600 text-xs py-1.5 px-2">{formatTime(timing.allRed)}</TableCell>
                      <TableCell className="py-1.5 px-2">
                        <Badge variant="secondary" className={`text-xs py-0 px-1.5 h-4 ${getRecallBadgeColor(timing.vehRecallType)}`}>
                          {timing.vehRecallType || 'None'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 px-2">
                        {timing.pedRecall ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs py-0 px-1.5 h-4">Yes</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-grey-100 text-grey-600 text-xs py-0 px-1.5 h-4">No</Badge>
                        )}
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
        <BasicTimingModal
          timing={editingTiming}
          onClose={handleModalClose}
          preSelectedSignalId={editingTiming ? undefined : selectedSignalId}
        />
      )}
    </div>
  );
}
