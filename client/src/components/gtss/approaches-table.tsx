import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SignalsMap, { approachColors } from "@/components/ui/signals-map";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGTSSStore } from "@/store/gtss-store";
import { Approach } from "@shared/schema";
import { getSignalDisplayName, useApproaches } from "gtss";
import { ChevronDown, ChevronUp, MapPin, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ApproachModal from "./approach-modal";
import BulkApproachModal from "./bulk-approach-modal";

type SortField = 'signalId' | 'approachId' | 'streetName' | 'compassBearing' | 'postedSpeed';
type SortDirection = 'asc' | 'desc';

interface ApproachesTableProps {
  triggerAdd?: number;
  triggerBulk?: number;
}

export default function ApproachesTable({ triggerAdd, triggerBulk }: ApproachesTableProps) {
  const [editingApproach, setEditingApproach] = useState<Approach | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [sortField, setSortField] = useState<SortField>('approachId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { approaches, signals, selectedSignalIdForTables, setSelectedSignalIdForTables } = useGTSSStore();

  // Use shared signal selection from store
  const selectedSignalId = selectedSignalIdForTables;
  const setSelectedSignalId = setSelectedSignalIdForTables;

  // Auto-select first signal on mount if none selected
  useEffect(() => {
    if (signals.length > 0 && !selectedSignalId) {
      setSelectedSignalId(signals[0].signalId);
    }
  }, [signals, selectedSignalId, setSelectedSignalId]);

  const approachHooks = useApproaches();

  // Handle triggers from parent component. Capture initial values so the
  // modal doesn't auto-open when the table re-mounts after navigation.
  const initialTriggerAdd = useRef(triggerAdd);
  const initialTriggerBulk = useRef(triggerBulk);

  useEffect(() => {
    if (triggerAdd !== initialTriggerAdd.current && triggerAdd && triggerAdd > 0) {
      handleAdd();
    }
  }, [triggerAdd]);

  useEffect(() => {
    if (triggerBulk !== initialTriggerBulk.current && triggerBulk && triggerBulk > 0) {
      setShowBulkModal(true);
    }
  }, [triggerBulk]);

  // Filter approaches by selected signal
  const filteredApproaches = selectedSignalId
    ? approaches.filter(approach => approach.signalId === selectedSignalId)
    : [];


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
        <CardHeader className="bg-grey-50 border-b border-grey-200 p-3">
          {signals.length === 0 ? (
            <div className="p-2 bg-warning-50 border border-warning-200 rounded-md">
              <p className="text-xs text-warning-700">
                No signals configured. Please add signals before creating approaches.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Select value={selectedSignalId} onValueChange={setSelectedSignalId}>
                  <SelectTrigger className="flex-1 h-8 text-sm">
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
                {selectedSignalId && (
                  <span className="text-xs text-grey-600 whitespace-nowrap">({filteredApproaches.length} approach{filteredApproaches.length !== 1 ? 'es' : ''})</span>
                )}
                <Button
                  onClick={() => setShowBulkModal(true)}
                  className="h-8 px-3 text-xs bg-primary-600 hover:bg-primary-700 flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Approaches</span>
                </Button>
              </div>
              {selectedSignalId && (() => {
                const selectedSignal = signals.find(s => s.signalId === selectedSignalId);
                return (
                  <div className="w-full h-72">
                    {selectedSignal && selectedSignal.latitude && selectedSignal.longitude ? (
                      <div className="w-full h-full border border-grey-300 rounded-md overflow-hidden bg-white relative z-0">
                        <SignalsMap
                          signals={[selectedSignal]}
                          approaches={filteredApproaches}
                          className="w-full h-full"
                        />
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
                  (() => {
                    const approachesWithBearing = filteredApproaches.filter(a => a.compassBearing !== null);
                    return getSortedApproaches().map((approach) => {
                      const colorIndex = approachesWithBearing.findIndex(a => a.id === approach.id);
                      const color = colorIndex >= 0 ? approachColors[colorIndex % approachColors.length] : undefined;
                      return (
                        <TableRow
                          key={approach.id}
                          className="cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => handleRowClick(approach)}
                        >
                          <TableCell className="font-medium text-grey-900 text-xs py-1.5 px-2">{approach.approachId}</TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">{approach.streetName}</TableCell>
                          <TableCell className="py-1.5 px-2">
                            {approach.compassBearing !== null && color ? (
                              <Badge
                                variant="secondary"
                                className="text-xs py-0 px-1.5 h-4 text-white"
                                style={{ backgroundColor: color }}
                              >
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
                      );
                    });
                  })()
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

      {showBulkModal && (
        <BulkApproachModal
          onClose={() => setShowBulkModal(false)}
          preSelectedSignalId={selectedSignalId}
        />
      )}
    </div>
  );
}
