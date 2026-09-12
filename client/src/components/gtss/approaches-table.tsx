import { approachColorFor } from "@/components/gtss/approach-colors";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SignalsMap from "@/components/ui/signals-map";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSignalDisplayName, useGTSSStore } from "gtss";
import { Approach } from "gtss/schema";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ApproachModal from "./approach-modal";
import BulkApproachModal from "./bulk-approach-modal";

type SortField = "signalId" | "approachId" | "streetName" | "compassBearing" | "postedSpeed";
type SortDirection = "asc" | "desc";

interface ApproachesTableProps {
  triggerAdd?: number;
  triggerBulk?: number;
}

export default function ApproachesTable({ triggerAdd, triggerBulk }: ApproachesTableProps) {
  const [editingApproach, setEditingApproach] = useState<Approach | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [sortField, setSortField] = useState<SortField>("approachId");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const { approaches, signals, selectedSignalIdForTables, setSelectedSignalIdForTables, agency } =
    useGTSSStore();
  const isMetric = agency?.agencyIsMetric ?? false;
  const speedUnit = isMetric ? "km/h" : "mph";
  const { deepLinkTarget, setDeepLinkTarget } = useGTSSStore();

  // Use shared signal selection from store
  const selectedSignalId = selectedSignalIdForTables;
  const setSelectedSignalId = setSelectedSignalIdForTables;

  // Auto-select first signal on mount if none selected
  useEffect(() => {
    if (signals.length > 0 && !selectedSignalId) {
      setSelectedSignalId(signals[0].signalId);
    }
  }, [signals, selectedSignalId, setSelectedSignalId]);

  // If the app was deep-linked to a specific approach, open it
  useEffect(() => {
    if (deepLinkTarget?.type === "approach" && deepLinkTarget.id) {
      const approach = approaches.find((a) => a.id === deepLinkTarget.id);
      if (approach) {
        setSelectedSignalId(approach.signalId);
        setEditingApproach(approach);
        setShowModal(true);
        setDeepLinkTarget({ type: null, id: null });
      }
    }
  }, [deepLinkTarget, approaches]);

  // const approachHooks = useApproaches();

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
    ? approaches.filter((approach) => approach.signalId === selectedSignalId)
    : [];
  /*
  const handleEdit = (approach: Approach) => {
    setEditingApproach(approach);
    setShowModal(true);
  };
*/
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
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
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
      const aPart = aParts[i] || "";
      const bPart = bParts[i] || "";

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
      let comparison;

      switch (sortField) {
        case "signalId":
          comparison = naturalCompare(a.signalId, b.signalId);
          break;
        case "approachId":
          comparison = naturalCompare(a.approachId, b.approachId);
          break;
        case "streetName":
          comparison = a.streetName.localeCompare(b.streetName);
          break;
        case "compassBearing":
          comparison = (a.compassBearing || 0) - (b.compassBearing || 0);
          break;
        case "postedSpeed":
          comparison = (a.postedSpeed || 0) - (b.postedSpeed || 0);
          break;
        default:
          comparison = naturalCompare(a.approachId, b.approachId);
          break;
      }

      if (sortDirection === "asc") {
        return comparison;
      } else {
        return -comparison;
      }
    });
  };

  const getBearingDirection = (bearing: number | null) => {
    if (bearing === null) return "";
    if (bearing >= 337.5 || bearing < 22.5) return "N";
    if (bearing >= 22.5 && bearing < 67.5) return "NE";
    if (bearing >= 67.5 && bearing < 112.5) return "E";
    if (bearing >= 112.5 && bearing < 157.5) return "SE";
    if (bearing >= 157.5 && bearing < 202.5) return "S";
    if (bearing >= 202.5 && bearing < 247.5) return "SW";
    if (bearing >= 247.5 && bearing < 292.5) return "W";
    if (bearing >= 292.5 && bearing < 337.5) return "NW";
    return "";
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
            className={`w-3 h-3 ${sortField === field && sortDirection === "asc" ? "text-primary-600" : "text-grey-300"}`}
          />
          <ChevronDown
            className={`w-3 h-3 -mt-1 ${sortField === field && sortDirection === "desc" ? "text-primary-600" : "text-grey-300"}`}
          />
        </div>
      </div>
    </TableHead>
  );

  return (
    <div className="max-w-6xl h-full">
      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="approaches-split"
        className="flex-1 min-h-[420px] rounded-lg border border-grey-200 bg-white overflow-hidden"
      >
        <ResizablePanel defaultSize={40} minSize={12} className="relative z-0">
          {signals.length === 0 ? (
            <div className="w-full h-full bg-grey-50 flex items-center justify-center">
              <div className="text-center text-grey-500">
                <MapPin className="w-6 h-6 mx-auto mb-1 text-grey-400" />
                <p className="text-xs">No signals to display</p>
              </div>
            </div>
          ) : (
            <div className="w-full h-full relative z-0">
              {selectedSignalId ? (
                <SignalsMap
                  signals={signals.filter((s) => s.signalId === selectedSignalId)}
                  approaches={filteredApproaches}
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full bg-grey-100 flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-grey-400" />
                </div>
              )}
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="bg-grey-200 hover:bg-primary-300 transition-colors"
        />
        <ResizablePanel defaultSize={60} minSize={20} className="flex flex-col min-h-0">
          <Card className="rounded-none border-0 flex flex-col h-full min-h-0">
            <CardHeader className="bg-grey-50 p-0" />
            <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
              {signals.length > 0 && (
                <div className="px-4 py-3 border-b border-grey-100 flex items-center gap-3">
                  <div className="text-xs font-medium text-grey-700">Filter by Signals</div>
                  <div className="flex-1">
                    <Select value={selectedSignalId} onValueChange={setSelectedSignalId}>
                      <SelectTrigger className="w-full h-8 text-sm">
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
                  </div>
                  {selectedSignalId && (
                    <span className="text-xs text-grey-600 whitespace-nowrap">
                      ({filteredApproaches.length} approach
                      {filteredApproaches.length !== 1 ? "es" : ""})
                    </span>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-grey-50 border-b border-grey-200">
                      <SortableHeader field="approachId">Approach ID</SortableHeader>
                      <SortableHeader field="streetName">Street Name</SortableHeader>
                      <SortableHeader field="compassBearing">Bearing</SortableHeader>
                      <SortableHeader field="postedSpeed">{`Speed (${speedUnit})`}</SortableHeader>
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
                          No approaches configured for this signal. Add your first approach to get
                          started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (() => {
                        return getSortedApproaches().map((approach) => {
                          // Sorting the table must not renumber the colors, so the
                          // index comes from the unsorted list the map draws from.
                          const color = approachColorFor(filteredApproaches, approach.approachId);
                          return (
                            <TableRow
                              key={approach.id}
                              className="cursor-pointer hover:bg-gray-50 transition-colors"
                              onClick={() => handleRowClick(approach)}
                            >
                              <TableCell className="font-medium text-grey-900 text-xs py-1.5 px-2">
                                {approach.approachId}
                              </TableCell>
                              <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                                {approach.streetName}
                              </TableCell>
                              <TableCell className="py-1.5 px-2">
                                {approach.compassBearing !== null && color ? (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs py-0 px-1.5 h-4 text-white"
                                    style={{ backgroundColor: color }}
                                  >
                                    {approach.compassBearing}°{" "}
                                    {getBearingDirection(approach.compassBearing)}
                                  </Badge>
                                ) : (
                                  <span className="text-grey-400 text-xs">-</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 px-2">
                                {approach.postedSpeed !== null ? (
                                  <Badge
                                    variant="secondary"
                                    className="bg-green-100 text-green-800 text-xs py-0 px-1.5 h-4"
                                  >
                                    {approach.postedSpeed} ${speedUnit}
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
        </ResizablePanel>
      </ResizablePanelGroup>

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
