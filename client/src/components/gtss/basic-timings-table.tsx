import { useState, useEffect, useRef, useMemo } from "react";
import { BasicTiming } from "@shared/schema";
import { useBasicTimings } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronUp, ChevronDown, MapPin, Plus, Download } from "lucide-react";
import SignalsMap from "@/components/ui/signals-map";
import BasicTimingModal from "./basic-timing-modal";
import PhaseDiagram from "./phase-diagram";
import { getSignalDisplayName } from "@/lib/utils";

type SortField = 'phase' | 'minGreen' | 'maxGreen' | 'yellow' | 'allRed' | 'vehRecallType';
type SortDirection = 'asc' | 'desc';

interface BasicTimingsTableProps {
  triggerAdd?: number;
}

// Phase colors matching the phase diagram
const phaseColors: Record<number, string> = {
  1: "#22c55e", // green
  2: "#3b82f6", // blue
  3: "#f97316", // orange
  4: "#8b5cf6", // purple
  5: "#ef4444", // red
  6: "#14b8a6", // teal
  7: "#eab308", // yellow
  8: "#ec4899", // pink
};

// Timing bar chart component
interface TimingBarChartProps {
  timings: BasicTiming[];
  svgRef?: React.RefObject<SVGSVGElement>;
  intersectionName?: string;
}

function TimingBarChart({ timings, svgRef, intersectionName }: TimingBarChartProps) {
  // Sort timings by phase number
  const sortedTimings = useMemo(() => {
    return [...timings].sort((a, b) => a.phase - b.phase);
  }, [timings]);

  if (sortedTimings.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-grey-400">
        Add timing data to see visualization
      </div>
    );
  }

  // Calculate max total time for scaling
  const maxTotal = Math.max(
    ...sortedTimings.map(t =>
      (t.minGreen || 0) + (t.maxGreen || 0) + (t.yellow || 0) + (t.allRed || 0)
    ),
    1
  );

  // SVG dimensions
  const chartWidth = 340;
  const chartHeight = sortedTimings.length * 40 + 80;
  const barHeight = 24;
  const labelWidth = 60;
  const legendHeight = 30;
  const chartAreaWidth = chartWidth - labelWidth - 20;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full">
      {/* Title */}
      {intersectionName && (
        <text x={chartWidth / 2} y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#374151">
          {intersectionName} - Timing Parameters
        </text>
      )}

      {/* Legend */}
      <g transform={`translate(${labelWidth}, ${intersectionName ? 30 : 10})`}>
        <rect x="0" y="0" width="12" height="12" fill="#22c55e" rx="2" />
        <text x="16" y="10" fontSize="9" fill="#374151">Min Green</text>

        <rect x="70" y="0" width="12" height="12" fill="#86efac" rx="2" />
        <text x="86" y="10" fontSize="9" fill="#374151">Max Green</text>

        <rect x="145" y="0" width="12" height="12" fill="#fbbf24" rx="2" />
        <text x="161" y="10" fontSize="9" fill="#374151">Yellow</text>

        <rect x="200" y="0" width="12" height="12" fill="#ef4444" rx="2" />
        <text x="216" y="10" fontSize="9" fill="#374151">All-Red</text>
      </g>

      {/* Bars */}
      <g transform={`translate(0, ${intersectionName ? 55 : 35})`}>
        {sortedTimings.map((timing, index) => {
          const y = index * 40;
          const phaseColor = phaseColors[timing.phase] || "#6b7280";

          const minGreen = timing.minGreen || 0;
          const maxGreen = timing.maxGreen || 0;
          const yellow = timing.yellow || 0;
          const allRed = timing.allRed || 0;
          const total = minGreen + maxGreen + yellow + allRed;

          // Scale factors
          const scale = chartAreaWidth / Math.max(maxTotal, 60);

          let xOffset = labelWidth;

          return (
            <g key={timing.id}>
              {/* Phase label */}
              <g transform={`translate(0, ${y})`}>
                <rect
                  x="5"
                  y="2"
                  width="45"
                  height="20"
                  rx="4"
                  fill={phaseColor}
                />
                <text x="27" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="white">
                  Ph {timing.phase}
                </text>
              </g>

              {/* Min Green bar */}
              {minGreen > 0 && (
                <g>
                  <rect
                    x={xOffset}
                    y={y + 2}
                    width={minGreen * scale}
                    height={barHeight - 4}
                    fill="#22c55e"
                    rx="2"
                  />
                  {minGreen * scale > 20 && (
                    <text x={xOffset + (minGreen * scale) / 2} y={y + 15} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">
                      {minGreen}s
                    </text>
                  )}
                </g>
              )}

              {/* Max Green bar (additional to min) */}
              {maxGreen > 0 && (() => {
                const x = xOffset + minGreen * scale;
                return (
                  <g>
                    <rect
                      x={x}
                      y={y + 2}
                      width={maxGreen * scale}
                      height={barHeight - 4}
                      fill="#86efac"
                      rx="2"
                    />
                    {maxGreen * scale > 20 && (
                      <text x={x + (maxGreen * scale) / 2} y={y + 15} textAnchor="middle" fontSize="9" fill="#166534" fontWeight="bold">
                        {maxGreen}s
                      </text>
                    )}
                  </g>
                );
              })()}

              {/* Yellow bar */}
              {yellow > 0 && (() => {
                const x = xOffset + (minGreen + maxGreen) * scale;
                return (
                  <g>
                    <rect
                      x={x}
                      y={y + 2}
                      width={yellow * scale}
                      height={barHeight - 4}
                      fill="#fbbf24"
                      rx="2"
                    />
                    {yellow * scale > 15 && (
                      <text x={x + (yellow * scale) / 2} y={y + 15} textAnchor="middle" fontSize="9" fill="#92400e" fontWeight="bold">
                        {yellow}s
                      </text>
                    )}
                  </g>
                );
              })()}

              {/* All-Red bar */}
              {allRed > 0 && (() => {
                const x = xOffset + (minGreen + maxGreen + yellow) * scale;
                return (
                  <g>
                    <rect
                      x={x}
                      y={y + 2}
                      width={allRed * scale}
                      height={barHeight - 4}
                      fill="#ef4444"
                      rx="2"
                    />
                    {allRed * scale > 12 && (
                      <text x={x + (allRed * scale) / 2} y={y + 15} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">
                        {allRed}s
                      </text>
                    )}
                  </g>
                );
              })()}

              {/* Total time label */}
              <text
                x={xOffset + total * scale + 5}
                y={y + 15}
                fontSize="9"
                fill="#6b7280"
              >
                {total}s
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default function BasicTimingsTable({ triggerAdd }: BasicTimingsTableProps) {
  const [editingTiming, setEditingTiming] = useState<BasicTiming | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [sortField, setSortField] = useState<SortField>('phase');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { basicTimings, signals, approaches, phases, selectedSignalIdForTables, setSelectedSignalIdForTables } = useGTSSStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const phaseDiagramRef = useRef<SVGSVGElement>(null);

  // Use shared signal selection from store
  const selectedSignalId = selectedSignalIdForTables;
  const setSelectedSignalId = setSelectedSignalIdForTables;

  // Auto-select first signal on mount if none selected
  useEffect(() => {
    if (signals.length > 0 && !selectedSignalId) {
      setSelectedSignalId(signals[0].signalId);
    }
  }, [signals, selectedSignalId, setSelectedSignalId]);

  const timingHooks = useBasicTimings();

  // Handle triggers from parent component. Capture initial value so the
  // modal doesn't auto-open when the table re-mounts after navigation.
  const initialTriggerAdd = useRef(triggerAdd);

  useEffect(() => {
    if (triggerAdd !== initialTriggerAdd.current && triggerAdd && triggerAdd > 0) {
      handleAdd();
    }
  }, [triggerAdd]);

  // Filter timings by selected signal
  const filteredTimings = selectedSignalId
    ? basicTimings.filter(timing => timing.signalId === selectedSignalId)
    : [];

  // Filter approaches for selected signal
  const filteredApproaches = selectedSignalId
    ? approaches.filter(a => a.signalId === selectedSignalId)
    : [];

  // Filter phases for selected signal
  const filteredPhases = selectedSignalId
    ? phases.filter(p => p.signalId === selectedSignalId)
    : [];

  // Get intersection name
  const intersectionName = useMemo(() => {
    const signal = signals.find(s => s.signalId === selectedSignalId);
    if (!signal) return "";
    return getSignalDisplayName(signal, approaches);
  }, [signals, selectedSignalId, approaches]);

  // Download chart as JPG
  const handleDownloadChart = () => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    const viewBox = svg.getAttribute('viewBox');
    let svgWidth = 340;
    let svgHeight = 300;

    if (viewBox) {
      const [, , width, height] = viewBox.split(' ').map(Number);
      svgWidth = width;
      svgHeight = height;
    }

    const svgClone = svg.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute('width', String(svgWidth));
    svgClone.setAttribute('height', String(svgHeight));

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = svgWidth * scale;
      canvas.height = svgHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, svgWidth, svgHeight);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedSignalId || 'timing-chart'}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.95);

      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  };

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
        <CardHeader className="bg-grey-50 border-b border-grey-200 p-3">
          {signals.length === 0 ? (
            <div className="p-2 bg-warning-50 border border-warning-200 rounded-md">
              <p className="text-xs text-warning-700">
                No signals configured. Please add signals before creating timing configurations.
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
                  <span className="text-xs text-grey-600 whitespace-nowrap">({filteredTimings.length} timing{filteredTimings.length !== 1 ? 's' : ''})</span>
                )}
                <Button
                  onClick={handleAdd}
                  className="h-8 px-3 text-xs bg-primary-600 hover:bg-primary-700 flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Timing</span>
                </Button>
              </div>
              {selectedSignalId && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-stretch gap-3">
                    {/* Timing Bar Chart */}
                    <div className="flex-1 border border-grey-200 rounded-lg p-2 bg-white min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-grey-500">Timing Parameters</span>
                        {filteredTimings.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadChart}
                            className="h-6 text-xs px-2"
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>
                      <div className="h-56">
                        <TimingBarChart
                          timings={filteredTimings}
                          svgRef={svgRef}
                          intersectionName={intersectionName}
                        />
                      </div>
                    </div>

                    {/* Phase Diagram */}
                    <div className="w-64 border border-grey-200 rounded-lg p-2 bg-white flex-shrink-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-grey-500">Phase Diagram</span>
                      </div>
                      <div className="h-56">
                        {filteredPhases.length > 0 ? (
                          <PhaseDiagram
                            phases={filteredPhases.map(p => ({
                              phase: p.phase,
                              approachId: p.approachId,
                              movementType: p.movementType,
                              isPedestrian: p.isPedestrian,
                              numOfLanes: p.numOfLanes
                            }))}
                            approaches={filteredApproaches.map(a => ({
                              approachId: a.approachId,
                              compassBearing: a.compassBearing,
                              freeRight: a.freeRight,
                              freeRightLanes: a.freeRightLanes
                            }))}
                            intersectionName={intersectionName}
                            svgRef={phaseDiagramRef}
                            compact={true}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-grey-400">
                            Add phases to see diagram
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Map - full width */}
                  <div className="w-full h-72">
                    {(() => {
                      const selectedSignal = signals.find(s => s.signalId === selectedSignalId);
                      return selectedSignal && selectedSignal.latitude && selectedSignal.longitude ? (
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
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
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
                        <Badge
                          variant="secondary"
                          className="text-xs py-0 px-1.5 h-4 text-white"
                          style={{ backgroundColor: phaseColors[timing.phase] || '#6b7280' }}
                        >
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
