import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import SignalsMap from "@/components/ui/signals-map";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useGTSSStore } from "@/store/gtss-store";
import { Signal } from "@shared/schema";
import { getDerivedStreetNames, useSignals } from "gtss";
import { ChevronDown, ChevronUp, MapPin, Navigation, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import BulkSignalModal from "./bulk-signal-modal";
import SignalModal from "./signal-modal";



type SortField = 'signalId' | 'streetName1' | 'streetName2' | 'completeness';
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
  // Track which row is being hovered so the matching marker on the map can
  // be drawn with a distinct color.
  const [hoveredSignalId, setHoveredSignalId] = useState<string | null>(null);
  // Free-text filter over the list: matches signal ID and street names
  // (both the stored names and the ones derived from approaches).
  const [searchQuery, setSearchQuery] = useState("");

  const { agency, signals, approaches, phases, detectors, basicTimings, navigateToSignalDetails } = useGTSSStore();

  // % complete: 25% for each of approaches, phases, detectors, timings that
  // has at least one row for the signal.
  const getCompletenessPct = (signalId: string): number => {
    const has = (arr: { signalId: string }[]) => arr.some(x => x.signalId === signalId);
    let n = 0;
    if (has(approaches)) n++;
    if (has(phases)) n++;
    if (has(detectors)) n++;
    if (has(basicTimings)) n++;
    return n * 25;
  };
  const { toast } = useToast();
  const signalHooks = useSignals();

  // Handle triggers from parent component. The trigger props are counters
  // owned by gtss-builder.tsx and survive across navigation (e.g. visiting a
  // signal-details page and coming back). To avoid the popup re-opening on
  // re-mount, we capture the initial trigger value in a ref and only act on
  // *new* increments.
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
    if (!agency?.agencyId) {
      toast({
        title: "Agency ID Required",
        description: "Please fill in the Agency ID under Agency Info before adding signals.",
        variant: "destructive",
      });
      return;
    }
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

  const matchesSearch = (signal: Signal): boolean => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    const derived = getDerivedStreetNames(signal.signalId, approaches);
    return [
      signal.signalId,
      signal.streetName1,
      signal.streetName2,
      derived.streetName1,
      derived.streetName2,
    ].some(v => (v || "").toLowerCase().includes(query));
  };

  const getSortedSignals = () => {
    return signals.filter(matchesSearch).sort((a, b) => {
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
        case 'completeness':
          comparison = getCompletenessPct(a.signalId) - getCompletenessPct(b.signalId);
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



  const visibleSignals = getSortedSignals();
  const isFiltering = searchQuery.trim() !== "";

  return (
    <div className="max-w-6xl h-full flex flex-col">
      {/* Vertical resizable split — drag the handle between the map and the
          list to make either pane bigger. Layout preference persists across
          re-renders via the auto-save id. */}
      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="traffic-signals-split"
        className="flex-1 min-h-[480px] rounded-lg border border-grey-200 bg-white overflow-hidden"
      >
        <ResizablePanel defaultSize={35} minSize={12} className="relative z-0">
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
                approaches={approaches}
                phases={phases}
                onSignalSelect={(signal) => navigateToSignalDetails(signal.signalId)}
                onSignalUpdate={handleSignalUpdate}
                getCompletenessPct={getCompletenessPct}
                highlightedSignalId={hoveredSignalId}
                className="w-full h-full"
              />
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="bg-grey-200 hover:bg-primary-300 transition-colors"
        />
        <ResizablePanel defaultSize={65} minSize={20} className="flex flex-col min-h-0">
          <Card className="rounded-none border-0 flex flex-col h-full min-h-0">
            <CardHeader className="bg-grey-50 border-b border-grey-200 p-3 flex-shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-medium text-grey-700 whitespace-nowrap">
                    {isFiltering
                      ? `${visibleSignals.length} of ${signals.length} signal${signals.length !== 1 ? 's' : ''}`
                      : `${signals.length} signal${signals.length !== 1 ? 's' : ''}`}
                  </span>
                </div>
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-grey-400 pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by ID or street name…"
                    className="h-8 pl-8 pr-8 text-sm"
                    data-testid="input-signal-search"
                  />
                  {isFiltering && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-grey-400 hover:text-grey-600"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    onClick={() => setShowBulkModal(true)}
                    variant="outline"
                    className="h-8 px-3 text-xs border-primary-200 text-primary-700 hover:bg-primary-50 flex items-center gap-1"
                  >
                    <Navigation className="w-3 h-3" />
                    <span>Add Multiple</span>
                  </Button>
                  <Button
                    onClick={handleAdd}
                    className="h-8 px-3 text-xs bg-primary-600 hover:bg-primary-700 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Signal</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
              <div className="w-full">
                {/* Signals Table */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-grey-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                      <TableRow className="bg-grey-50 border-b border-grey-200">
                        <SortableHeader field="signalId">Signal ID</SortableHeader>
                        <SortableHeader field="streetName1">Street 1</SortableHeader>
                        <SortableHeader field="streetName2">Street 2</SortableHeader>
                        <SortableHeader field="completeness">% Complete</SortableHeader>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleSignals.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-xs text-grey-500">
                            <div className="flex flex-col items-center space-y-2">
                              {isFiltering ? (
                                <>
                                  <Search className="w-8 h-8 text-grey-300" />
                                  <p>No signals match "{searchQuery.trim()}"</p>
                                  <p className="text-grey-400">Try a different ID or street name</p>
                                </>
                              ) : (
                                <>
                                  <MapPin className="w-8 h-8 text-grey-300" />
                                  <p>No traffic signals configured</p>
                                  <p className="text-grey-400">Add your first signal to get started</p>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        visibleSignals.map((signal) => (
                          <TableRow
                            key={signal.id}
                            className="hover:bg-grey-50 cursor-pointer transition-colors"
                            onClick={() => navigateToSignalDetails(signal.signalId)}
                            onMouseEnter={() => setHoveredSignalId(signal.signalId)}
                            onMouseLeave={() => setHoveredSignalId(prev => prev === signal.signalId ? null : prev)}
                            data-testid={`row-signal-${signal.signalId}`}
                          >
                            <TableCell className="font-medium text-grey-900 text-xs py-1.5 px-2">{signal.signalId}</TableCell>
                            <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                              {getDerivedStreetNames(signal.signalId, approaches).streetName1 || signal.streetName1 || '-'}
                            </TableCell>
                            <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                              {getDerivedStreetNames(signal.signalId, approaches).streetName2 || signal.streetName2 || '-'}
                            </TableCell>
                            <TableCell className="text-xs py-1.5 px-2">
                              {(() => {
                                const pct = getCompletenessPct(signal.signalId);
                                const has = (arr: { signalId: string }[]) => arr.some(x => x.signalId === signal.signalId);
                                const parts = [
                                  `${has(approaches) ? '✓' : '·'} approaches`,
                                  `${has(phases) ? '✓' : '·'} phases`,
                                  `${has(detectors) ? '✓' : '·'} detectors`,
                                  `${has(basicTimings) ? '✓' : '·'} timings`,
                                ].join('\n');
                                const barColor =
                                  pct === 100 ? 'bg-green-500'
                                    : pct >= 75 ? 'bg-blue-500'
                                      : pct >= 50 ? 'bg-amber-500'
                                        : pct >= 25 ? 'bg-orange-500'
                                          : 'bg-grey-300';
                                const textColor = pct === 100 ? 'text-green-700' : 'text-grey-700';
                                return (
                                  <div className="flex items-center gap-2" title={parts}>
                                    <div className="w-20 h-1.5 bg-grey-200 rounded-full overflow-hidden flex-shrink-0">
                                      <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={`font-mono text-[11px] w-9 text-right ${textColor}`}>{pct}%</span>
                                  </div>
                                );
                              })()}
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
        </ResizablePanel>
      </ResizablePanelGroup>

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
