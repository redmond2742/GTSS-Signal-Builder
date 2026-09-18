import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getSignalDisplayName, isLhtForSignalId, useBasicTimings, useGTSSStore } from "gtss";
import { BasicTiming } from "gtss/schema";
import { PhaseDiagram, phaseColors } from "gtss-diagram";
import { ChevronDown, ChevronUp, Download, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import BasicTimingModal from "./basic-timing-modal";

type SortField = "phase" | "minGreen" | "maxGreen" | "yellow" | "allRed" | "vehRecallType";
type SortDirection = "asc" | "desc";

interface BasicTimingsTableProps {
  triggerAdd?: number;
}

// Timing bar chart component
interface TimingBarChartProps {
  timings: BasicTiming[];
  svgRef?: React.RefObject<SVGSVGElement>;
  intersectionName?: string;
}

function TimingBarChart({ timings, svgRef, intersectionName }: TimingBarChartProps) {
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

  const maxTotal = Math.max(
    ...sortedTimings.map(
      (t) => (t.minGreen || 0) + (t.maxGreen || 0) + (t.yellow || 0) + (t.allRed || 0),
    ),
    1,
  );

  const chartWidth = 340;
  const chartHeight = sortedTimings.length * 40 + 80;
  const barHeight = 24;
  const labelWidth = 60;
  const chartAreaWidth = chartWidth - labelWidth - 20;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full">
      {intersectionName && (
        <text
          x={chartWidth / 2}
          y="16"
          textAnchor="middle"
          fontSize="12"
          fontWeight="bold"
          fill="#374151"
        >
          {intersectionName} - Timing Parameters
        </text>
      )}

      <g transform={`translate(${labelWidth}, ${intersectionName ? 30 : 10})`}>
        <rect x="0" y="0" width="12" height="12" fill="#22c55e" rx="2" />
        <text x="16" y="10" fontSize="9" fill="#374151">
          Min Green
        </text>

        <rect x="70" y="0" width="12" height="12" fill="#86efac" rx="2" />
        <text x="86" y="10" fontSize="9" fill="#374151">
          Max Green
        </text>

        <rect x="145" y="0" width="12" height="12" fill="#fbbf24" rx="2" />
        <text x="161" y="10" fontSize="9" fill="#374151">
          Yellow
        </text>

        <rect x="200" y="0" width="12" height="12" fill="#ef4444" rx="2" />
        <text x="216" y="10" fontSize="9" fill="#374151">
          All-Red
        </text>
      </g>

      <g transform={`translate(0, ${intersectionName ? 55 : 35})`}>
        {sortedTimings.map((timing, index) => {
          const y = index * 40;
          const phaseColor = phaseColors[timing.phase] || "#6b7280";

          const minGreen = timing.minGreen || 0;
          const maxGreen = timing.maxGreen || 0;
          const yellow = timing.yellow || 0;
          const allRed = timing.allRed || 0;
          const total = minGreen + maxGreen + yellow + allRed;

          const scale = chartAreaWidth / Math.max(maxTotal, 60);

          const xOffset = labelWidth;

          return (
            <g key={timing.id}>
              <g transform={`translate(0, ${y})`}>
                <rect x="5" y="2" width="45" height="20" rx="4" fill={phaseColor} />
                <text
                  x="27"
                  y="16"
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="bold"
                  fill="white"
                >
                  Ph {timing.phase}
                </text>
              </g>

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
                    <text
                      x={xOffset + (minGreen * scale) / 2}
                      y={y + 15}
                      textAnchor="middle"
                      fontSize="9"
                      fill="white"
                      fontWeight="bold"
                    >
                      {minGreen}s
                    </text>
                  )}
                </g>
              )}

              {maxGreen > 0 &&
                (() => {
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
                        <text
                          x={x + (maxGreen * scale) / 2}
                          y={y + 15}
                          textAnchor="middle"
                          fontSize="9"
                          fill="#166534"
                          fontWeight="bold"
                        >
                          {maxGreen}s
                        </text>
                      )}
                    </g>
                  );
                })()}

              {yellow > 0 &&
                (() => {
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
                        <text
                          x={x + (yellow * scale) / 2}
                          y={y + 15}
                          textAnchor="middle"
                          fontSize="9"
                          fill="#92400e"
                          fontWeight="bold"
                        >
                          {yellow}s
                        </text>
                      )}
                    </g>
                  );
                })()}

              {allRed > 0 &&
                (() => {
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
                        <text
                          x={x + (allRed * scale) / 2}
                          y={y + 15}
                          textAnchor="middle"
                          fontSize="9"
                          fill="white"
                          fontWeight="bold"
                        >
                          {allRed}s
                        </text>
                      )}
                    </g>
                  );
                })()}

              <text x={xOffset + total * scale + 5} y={y + 15} fontSize="9" fill="#6b7280">
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
  const [sortField, setSortField] = useState<SortField>("phase");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const {
    basicTimings,
    signals,
    approaches,
    phases,
    selectedSignalIdForTables,
    setSelectedSignalIdForTables,
  } = useGTSSStore();
  const { deepLinkTarget, setDeepLinkTarget } = useGTSSStore();
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

  // Open timing modal when deep-linked
  useEffect(() => {
    if (deepLinkTarget?.type === "basicTiming" && deepLinkTarget.id) {
      const t = basicTimings.find((bt) => bt.id === deepLinkTarget.id);
      if (t) {
        setSelectedSignalId(t.signalId);
        setEditingTiming(t);
        setShowModal(true);
        setDeepLinkTarget({ type: null, id: null });
      }
    }
  }, [deepLinkTarget, basicTimings]);

  useBasicTimings();

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
    ? basicTimings.filter((timing) => timing.signalId === selectedSignalId)
    : [];

  // Filter approaches for selected signal
  const filteredApproaches = selectedSignalId
    ? approaches.filter((a) => a.signalId === selectedSignalId)
    : [];

  // Filter phases for selected signal
  const filteredPhases = selectedSignalId
    ? phases.filter((p) => p.signalId === selectedSignalId)
    : [];

  // Get intersection name
  const intersectionName = useMemo(() => {
    const signal = signals.find((s) => s.signalId === selectedSignalId);
    if (!signal) return "";
    return getSignalDisplayName(signal, approaches);
  }, [signals, selectedSignalId, approaches]);

  // Download chart as JPG
  const handleDownloadChart = () => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    const viewBox = svg.getAttribute("viewBox");
    let svgWidth = 340;
    let svgHeight = 300;

    if (viewBox) {
      const [, , width, height] = viewBox.split(" ").map(Number);
      svgWidth = width;
      svgHeight = height;
    }

    const svgClone = svg.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute("width", String(svgWidth));
    svgClone.setAttribute("height", String(svgHeight));

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = svgWidth * scale;
      canvas.height = svgHeight * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, svgWidth, svgHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${selectedSignalId || "timing-chart"}.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        },
        "image/jpeg",
        0.95,
      );

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
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
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
        case "phase":
          aValue = a.phase;
          bValue = b.phase;
          break;
        case "minGreen":
          aValue = a.minGreen || 0;
          bValue = b.minGreen || 0;
          break;
        case "maxGreen":
          aValue = a.maxGreen || 0;
          bValue = b.maxGreen || 0;
          break;
        case "yellow":
          aValue = a.yellow || 0;
          bValue = b.yellow || 0;
          break;
        case "allRed":
          aValue = a.allRed || 0;
          bValue = b.allRed || 0;
          break;
        case "vehRecallType":
          aValue = a.vehRecallType || "None";
          bValue = b.vehRecallType || "None";
          break;
        default:
          aValue = a.phase;
          bValue = b.phase;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return sortDirection === "asc"
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });
  };

  const formatTime = (value: number | null) => {
    if (value === null) return "-";
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
            className={`w-3 h-3 ${sortField === field && sortDirection === "asc" ? "text-primary-600" : "text-grey-300"}`}
          />
          <ChevronDown
            className={`w-3 h-3 -mt-1 ${sortField === field && sortDirection === "desc" ? "text-primary-600" : "text-grey-300"}`}
          />
        </div>
      </div>
    </TableHead>
  );

  const getRecallBadgeColor = (type: string | null) => {
    switch (type) {
      case "Max":
        return "bg-red-100 text-red-800";
      case "Min":
        return "bg-yellow-100 text-yellow-800";
      case "Soft":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-grey-100 text-grey-800";
    }
  };

  return (
    <div className="max-w-6xl h-full">
      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="basic-timings-split"
        className="flex-1 min-h-[480px] rounded-lg border border-grey-200 bg-white overflow-hidden"
      >
        <ResizablePanel defaultSize={50} minSize={12} className="relative z-0">
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
                onSignalSelect={(signal) => setSelectedSignalId(signal.signalId)}
                highlightedSignalId={selectedSignalId}
                className="w-full h-full"
              />
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="bg-grey-200 hover:bg-primary-300 transition-colors"
        />
        <ResizablePanel defaultSize={50} minSize={20} className="flex flex-col min-h-0">
          <Card className="rounded-none border-0 flex flex-col h-full min-h-0">
            <CardHeader className="bg-grey-50 border-b border-grey-200 p-0">
              {signals.length === 0 ? (
                <div className="p-2 bg-warning-50 border border-warning-200 rounded-md">
                  <p className="text-xs text-warning-700">
                    No signals configured. Please add signals before creating timing configurations.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div />
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="p-2">
                {selectedSignalId && (
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
                            phases={filteredPhases.map((p) => ({
                              phase: p.phase,
                              approachId: p.approachId,
                              movementType: p.movementType,
                              isPedestrian: p.isPedestrian,
                            }))}
                            approaches={filteredApproaches.map((a) => ({
                              approachId: a.approachId,
                              compassBearing: a.compassBearing,
                              freeRight: a.freeRight,
                              freeRightLanes: a.freeRightLanes,
                            }))}
                            intersectionId={selectedSignalId}
                            isLht={isLhtForSignalId(selectedSignalId)}
                            svgRef={phaseDiagramRef}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-grey-400">
                            Add phases to see diagram
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Filter row: moved below charts and above the table */}
              <div className="p-3 border-t border-b border-grey-100">
                <div className="flex items-center gap-3">
                  <div className="text-xs font-medium text-grey-700">Filter by Signals</div>
                  <div className="flex-1 min-w-0">
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
                    <div className="text-xs text-grey-600 whitespace-nowrap">
                      {filteredTimings.length} timing{filteredTimings.length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-grey-50 border-b border-grey-200">
                      <SortableHeader field="phase">Phase</SortableHeader>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider py-1.5 px-2">
                        Ped Walk
                      </TableHead>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider py-1.5 px-2">
                        Ped Clear
                      </TableHead>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider py-1.5 px-2">
                        LPI
                      </TableHead>
                      <SortableHeader field="minGreen">Min Green</SortableHeader>
                      <SortableHeader field="maxGreen">Max Green</SortableHeader>
                      <SortableHeader field="yellow">Yellow</SortableHeader>
                      <SortableHeader field="allRed">All-Red</SortableHeader>
                      <SortableHeader field="vehRecallType">Veh Recall</SortableHeader>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider py-1.5 px-2">
                        Ped Recall
                      </TableHead>
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
                          No timing configurations for this signal. Add your first timing to get
                          started.
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
                              style={{ backgroundColor: phaseColors[timing.phase] || "#6b7280" }}
                            >
                              {timing.phase}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {formatTime(timing.pedWalk)}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {formatTime(timing.pedClearance)}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {formatTime(timing.leadingPedInterval)}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {formatTime(timing.minGreen)}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {formatTime(timing.maxGreen)}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {formatTime(timing.yellow)}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {formatTime(timing.allRed)}
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            <Badge
                              variant="secondary"
                              className={`text-xs py-0 px-1.5 h-4 ${getRecallBadgeColor(timing.vehRecallType)}`}
                            >
                              {timing.vehRecallType || "None"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            {timing.pedRecall ? (
                              <Badge
                                variant="secondary"
                                className="bg-green-100 text-green-800 text-xs py-0 px-1.5 h-4"
                              >
                                Yes
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="bg-grey-100 text-grey-600 text-xs py-0 px-1.5 h-4"
                              >
                                No
                              </Badge>
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
        </ResizablePanel>
      </ResizablePanelGroup>

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
