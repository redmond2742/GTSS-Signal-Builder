import { useState, useEffect } from "react";
import { Approach } from "@shared/schema";
import { useApproaches } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronUp, ChevronDown, MapPin } from "lucide-react";
import SignalsMap from "@/components/ui/signals-map";
import ApproachModal from "./approach-modal";

type SortField = 'signalId' | 'approachId' | 'streetName' | 'compassBearing' | 'postedSpeed';
type SortDirection = 'asc' | 'desc';

interface ApproachesTableProps {
  triggerAdd?: number;
}

export default function ApproachesTable({ triggerAdd }: ApproachesTableProps) {
  const [editingApproach, setEditingApproach] = useState<Approach | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>('approachId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { approaches, signals } = useGTSSStore();

  // Auto-select first signal on mount
  useEffect(() => {
    if (signals.length > 0 && !selectedSignalId) {
      setSelectedSignalId(signals[0].signalId);
    }
  }, [signals, selectedSignalId]);

  const approachHooks = useApproaches();

  // Handle triggers from parent component
  useEffect(() => {
    if (triggerAdd && triggerAdd > 0) {
      handleAdd();
    }
  }, [triggerAdd]);

  // Filter approaches by selected signal
  const filteredApproaches = selectedSignalId
    ? approaches.filter(approach => approach.signalId === selectedSignalId)
    : [];

  // Get signal display name
  const getSignalDisplayName = (signalId: string) => {
    const signal = signals.find(s => s.signalId === signalId);
    return signal
      ? `${signal.signalId} - ${signal.streetName1} & ${signal.streetName2}`
      : signalId;
  };

  const handleEdit = (approach: Approach) => {
    setEditingApproach(approach);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingApproach(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingApproach(null);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleRowClick = (approach: Approach) => {
    setEditingApproach(approach);
    setShowModal(true);
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

  const getSortedApproaches = () => {
    return [...filteredApproaches].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'signalId':
          comparison = naturalCompare(a.signalId, b.signalId);
          break;
        case 'approachId':
          comparison = naturalCompare(a.approachId, b.approachId);
          break;
        case 'streetName':
          comparison = a.streetName.localeCompare(b.streetName);
          break;
        case 'compassBearing':
          comparison = (a.compassBearing || 0) - (b.compassBearing || 0);
          break;
        case 'postedSpeed':
          comparison = (a.postedSpeed || 0) - (b.postedSpeed || 0);
          break;
        default:
          comparison = naturalCompare(a.approachId, b.approachId);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const getBearingDirection = (bearing: number | null) => {
    if (bearing === null) return '';
    if (bearing >= 337.5 || bearing < 22.5) return 'N';
    if (bearing >= 22.5 && bearing < 67.5) return 'NE';
    if (bearing >= 67.5 && bearing < 112.5) return 'E';
    if (bearing >= 112.5 && bearing < 157.5) return 'SE';
    if (bearing >= 157.5 && bearing < 202.5) return 'S';
    if (bearing >= 202.5 && bearing < 247.5) return 'SW';
    if (bearing >= 247.5 && bearing < 292.5) return 'W';
    if (bearing >= 292.5 && bearing < 337.5) return 'NW';
    return '';
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
        <CardHeader className="bg-grey-50 border-b border-grey-200 flex flex-row items-center justify-start px-3 py-2">
          <div className="flex space-x-2 items-center">
            {signals.length === 0 ? (
              <div className="p-2 bg-warning-50 border border-warning-200 rounded-md">
                <p className="text-xs text-warning-700">
                  No signals configured. Please add signals before creating approaches.
                </p>
              </div>
            ) : (
              <>
                <Select value={selectedSignalId} onValueChange={setSelectedSignalId}>
                  <SelectTrigger className="w-80 h-7 text-xs">
                    <SelectValue placeholder="Choose signal to view approaches" />
                  </SelectTrigger>
                  <SelectContent>
                    {signals.map((signal) => (
                      <SelectItem key={signal.signalId} value={signal.signalId}>
                        {getSignalDisplayName(signal.signalId)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSignalId && (
                  <span className="text-xs text-grey-600">({filteredApproaches.length} approach(es))</span>
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
                  <SortableHeader field="approachId">Approach ID</SortableHeader>
                  <SortableHeader field="streetName">Street Name</SortableHeader>
                  <SortableHeader field="compassBearing">Bearing</SortableHeader>
                  <SortableHeader field="postedSpeed">Speed (mph)</SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedSignalId ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-xs text-grey-500">
                      Please select a signal above to view its approaches.
                    </TableCell>
                  </TableRow>
                ) : filteredApproaches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-xs text-grey-500">
                      No approaches configured for this signal. Add your first approach to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  getSortedApproaches().map((approach) => (
                    <TableRow
                      key={approach.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleRowClick(approach)}
                    >
                      <TableCell className="font-medium text-grey-900 text-xs py-1.5 px-2">{approach.approachId}</TableCell>
                      <TableCell className="text-grey-600 text-xs py-1.5 px-2">{approach.streetName}</TableCell>
                      <TableCell className="py-1.5 px-2">
                        {approach.compassBearing !== null ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs py-0 px-1.5 h-4">
                            {approach.compassBearing}° {getBearingDirection(approach.compassBearing)}
                          </Badge>
                        ) : (
                          <span className="text-grey-400 text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2">
                        {approach.postedSpeed !== null ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs py-0 px-1.5 h-4">
                            {approach.postedSpeed} mph
                          </Badge>
                        ) : (
                          <span className="text-grey-400 text-xs">-</span>
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
        <ApproachModal
          approach={editingApproach}
          onClose={handleModalClose}
          preSelectedSignalId={editingApproach ? undefined : selectedSignalId}
        />
      )}
    </div>
  );
}
