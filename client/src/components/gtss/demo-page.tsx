import { approachColorFor } from "@/components/gtss/approach-colors";
import DetectorDiagram from "@/components/gtss/detector-diagram";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  downloadSvgAsJpg,
  generateProceduralIntersection,
  getAllDemoIntersections,
  isLhtForSignalId,
  type DemoIntersection,
} from "gtss";
import type { BasicTiming } from "gtss/schema";
import { PhaseDiagram } from "gtss-diagram";
import {
  ArrowUpDown,
  Clock,
  Compass,
  Download,
  Layers,
  Shuffle,
  SignpostBig,
  Sliders,
  Sparkles,
  Target,
} from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { formatMovementType } from "./movement-types";

// Phase color mapping matching the phase diagram
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

// Timing Bar Chart for Demo Page
function DemoTimingBarChart({
  timings,
  intersectionName,
  svgRef,
}: {
  timings: BasicTiming[];
  intersectionName?: string;
  svgRef?: React.RefObject<SVGSVGElement>;
}) {
  const sortedTimings = useMemo(() => {
    return [...timings].sort((a, b) => a.phase - b.phase);
  }, [timings]);

  if (sortedTimings.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-grey-400">
        No timing data available
      </div>
    );
  }

  const maxTotal = Math.max(
    ...sortedTimings.map(
      (t) => (t.minGreen || 0) + (t.maxGreen || 0) + (t.yellow || 0) + (t.allRed || 0),
    ),
    1,
  );

  const chartWidth = 500;
  const chartHeight = sortedTimings.length * 40 + 70;
  const barHeight = 24;
  const labelWidth = 60;
  const chartAreaWidth = chartWidth - labelWidth - 30;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className="w-full h-auto max-h-[360px]"
    >
      {intersectionName && (
        <text
          x={chartWidth / 2}
          y="16"
          textAnchor="middle"
          fontSize="12"
          fontWeight="bold"
          fill="#374151"
        >
          {intersectionName} — Timing Parameters
        </text>
      )}

      <g transform={`translate(${labelWidth}, ${intersectionName ? 30 : 12})`}>
        <rect x="0" y="0" width="10" height="10" fill="#22c55e" rx="2" />
        <text x="14" y="9" fontSize="9" fill="#4b5563">
          Min Green
        </text>

        <rect x="75" y="0" width="10" height="10" fill="#86efac" rx="2" />
        <text x="89" y="9" fontSize="9" fill="#4b5563">
          Max Green
        </text>

        <rect x="155" y="0" width="10" height="10" fill="#fbbf24" rx="2" />
        <text x="169" y="9" fontSize="9" fill="#4b5563">
          Yellow
        </text>

        <rect x="220" y="0" width="10" height="10" fill="#ef4444" rx="2" />
        <text x="234" y="9" fontSize="9" fill="#4b5563">
          All-Red
        </text>
      </g>

      <g transform={`translate(0, ${intersectionName ? 50 : 32})`}>
        {sortedTimings.map((timing, index) => {
          const y = index * 38;
          const phaseColor = phaseColors[timing.phase] || "#6b7280";

          const minGreen = timing.minGreen || 0;
          const maxGreen = timing.maxGreen || 0;
          const yellow = timing.yellow || 0;
          const allRed = timing.allRed || 0;

          const scale = chartAreaWidth / Math.max(maxTotal, 60);
          const xOffset = labelWidth;

          return (
            <g key={timing.id || timing.phase}>
              <g transform={`translate(0, ${y})`}>
                <rect x="4" y="2" width="46" height="20" rx="4" fill={phaseColor} />
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
                  {minGreen * scale > 16 && (
                    <text
                      x={xOffset + (minGreen * scale) / 2}
                      y={y + 14}
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
                      {maxGreen * scale > 16 && (
                        <text
                          x={x + (maxGreen * scale) / 2}
                          y={y + 14}
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
                      {yellow * scale > 12 && (
                        <text
                          x={x + (yellow * scale) / 2}
                          y={y + 14}
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
                          y={y + 14}
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
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default function DemoPage() {
  const { toast } = useToast();
  const presets = useMemo(() => getAllDemoIntersections(), []);

  const [selectedId, setSelectedId] = useState<string>(presets[0]?.id || "demo-4-nema-standard");
  const [activeViewTab, setActiveViewTab] = useState<
    "phase" | "timing" | "detectors" | "approaches" | "trafficSide"
  >("phase");
  const [approachFilter, setApproachFilter] = useState<string>("all");

  // Custom Procedural Generator Controls
  const [customApproachCount, setCustomApproachCount] = useState<2 | 3 | 4 | 5>(4);
  const [customBaseBearing, setCustomBaseBearing] = useState<number>(0);
  const [customHasLeftTurns] = useState<boolean>(true);
  const [customHasSlipLanes, setCustomHasSlipLanes] = useState<boolean>(true);
  const [customTech, setCustomTech] = useState<"Inductance Loop" | "Video" | "Radar" | "Microwave">(
    "Video",
  );
  const [customIntersections, setCustomIntersections] = useState<DemoIntersection[]>([]);

  const phaseSvgRef = useRef<SVGSVGElement>(null);
  const detectorSvgRef = useRef<SVGSVGElement>(null);
  const timingSvgRef = useRef<SVGSVGElement>(null);

  // Combined list of presets and generated custom intersections
  const allIntersections = useMemo(() => {
    return [...presets, ...customIntersections];
  }, [presets, customIntersections]);

  const filteredIntersections = useMemo(() => {
    if (approachFilter === "all") return allIntersections;
    const count = parseInt(approachFilter, 10);
    return allIntersections.filter((item) => item.approachCount === count);
  }, [allIntersections, approachFilter]);

  const currentIntersection = useMemo(() => {
    return (
      allIntersections.find((item) => item.id === selectedId) ||
      filteredIntersections[0] ||
      allIntersections[0]
    );
  }, [allIntersections, filteredIntersections, selectedId]);

  if (!currentIntersection) {
    return <div className="p-4 text-sm text-grey-500">No demo intersections available.</div>;
  }

  const isLht = isLhtForSignalId(currentIntersection.signal.signalId);

  const handleGenerateCustom = () => {
    const seed = Math.floor(Math.random() * 90000) + 10000;
    const generated = generateProceduralIntersection({
      approachCount: customApproachCount,
      baseBearing: customBaseBearing,
      hasLeftTurns: customHasLeftTurns,
      hasSlipLanes: customHasSlipLanes,
      technologyType: customTech,
      seed,
    });

    setCustomIntersections((prev) => [generated, ...prev]);
    setSelectedId(generated.id);
    toast({
      title: "Custom Topology Generated",
      description: `Created ${generated.name} with ${generated.approaches.length} approaches and ${generated.phases.length} phases.`,
    });
  };

  const handleRandomize = () => {
    // Keep the approach count of the currently selected intersection (or filter if set)
    const targetCount = (
      approachFilter !== "all"
        ? parseInt(approachFilter, 10)
        : currentIntersection?.approachCount || 4
    ) as 2 | 3 | 4 | 5;

    const randomBearing = Math.floor(Math.random() * 360);
    const randomSlip = Math.random() > 0.4;
    const techs: ("Inductance Loop" | "Video" | "Radar" | "Microwave")[] = [
      "Video",
      "Radar",
      "Inductance Loop",
      "Microwave",
    ];
    const randomTech = techs[Math.floor(Math.random() * techs.length)];
    const seed = Math.floor(Math.random() * 90000) + 10000;

    const generated = generateProceduralIntersection({
      approachCount: targetCount,
      baseBearing: randomBearing,
      hasLeftTurns: true,
      hasSlipLanes: randomSlip,
      technologyType: randomTech,
      seed,
    });

    setCustomIntersections((prev) => [generated, ...prev]);
    setSelectedId(generated.id);
    toast({
      title: "Randomized Intersection",
      description: `Generated new ${generated.approachCount}-approach random intersection (${randomBearing}° base).`,
    });
  };

  const handleDownloadPhaseDiagram = () => {
    if (!phaseSvgRef.current) return;
    downloadSvgAsJpg(phaseSvgRef.current, `demo-${currentIntersection.id}-phase-diagram.jpg`);
    toast({ title: "Downloaded", description: "Phase diagram saved as image." });
  };

  const handleDownloadDetectorDiagram = () => {
    if (!detectorSvgRef.current) return;
    downloadSvgAsJpg(detectorSvgRef.current, `demo-${currentIntersection.id}-detectors.jpg`);
    toast({ title: "Downloaded", description: "Detector diagram saved as image." });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-8">
      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Intersection Selector & Generator (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Preset / Gallery Selector */}
          <Card>
            <CardHeader className="bg-grey-50 border-b border-grey-200 p-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold text-grey-700 flex items-center gap-1.5 uppercase tracking-wider">
                  <Layers className="w-4 h-4 text-primary-600" />
                  Select Intersection
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {filteredIntersections.length} models
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              {/* Approach Count Filter */}
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-grey-600">
                  Filter by Approaches
                </Label>
                <div className="grid grid-cols-5 gap-1">
                  {[
                    { label: "All", value: "all" },
                    { label: "2-Leg", value: "2" },
                    { label: "3-Leg", value: "3" },
                    { label: "4-Leg", value: "4" },
                    { label: "5-Leg", value: "5" },
                  ].map((btn) => (
                    <button
                      key={btn.value}
                      type="button"
                      aria-pressed={approachFilter === btn.value}
                      onClick={() => setApproachFilter(btn.value)}
                      className={`text-xs py-1 px-1.5 rounded text-center transition-colors font-medium ${
                        approachFilter === btn.value
                          ? "bg-primary-600 text-white"
                          : "bg-grey-100 text-grey-700 hover:bg-grey-200"
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Intersection List Cards */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {filteredIntersections.map((item) => {
                  const isSelected = item.id === currentIntersection.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                        isSelected
                          ? "border-primary-600 bg-primary-50/70 shadow-sm"
                          : "border-grey-200 hover:bg-grey-50 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-bold text-grey-900 truncate">
                          {item.name}
                        </span>
                        <Badge
                          variant={item.category === "procedural" ? "secondary" : "default"}
                          className="text-[9px] px-1.5 py-0 h-4 font-semibold"
                        >
                          {item.approachCount} Legs
                        </Badge>
                      </div>
                      <p className="text-[11px] text-grey-500 line-clamp-2 leading-tight mb-2">
                        {item.description}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-grey-600 font-mono">
                        <span>{item.phases.length} Phases</span>
                        <span>•</span>
                        <span>{item.detectors.length} Detectors</span>
                        <span>•</span>
                        <span>{item.approaches.map((a) => `${a.compassBearing}°`).join(", ")}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Procedural Generator Panel */}
          <Card>
            <CardHeader className="bg-grey-50 border-b border-grey-200 p-3">
              <CardTitle className="text-xs font-semibold text-grey-700 flex items-center gap-1.5 uppercase tracking-wider">
                <Sliders className="w-4 h-4 text-purple-600" />
                Procedural Generator
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-grey-600">Approach Count</Label>
                  <Select
                    value={String(customApproachCount)}
                    onValueChange={(v) => setCustomApproachCount(parseInt(v, 10) as 2 | 3 | 4 | 5)}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Approaches</SelectItem>
                      <SelectItem value="3">3 Approaches</SelectItem>
                      <SelectItem value="4">4 Approaches</SelectItem>
                      <SelectItem value="5">5 Approaches</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-grey-600">Base Angle (°)</Label>
                  <Input
                    type="number"
                    value={customBaseBearing}
                    onChange={(e) => setCustomBaseBearing(parseInt(e.target.value, 10) || 0)}
                    className="h-7 text-xs"
                    min={0}
                    max={359}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-grey-600">Detection Tech</Label>
                  <Select
                    value={customTech}
                    onValueChange={(v) =>
                      setCustomTech(v as "Inductance Loop" | "Video" | "Radar" | "Microwave")
                    }
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Video">Video</SelectItem>
                      <SelectItem value="Radar">Radar</SelectItem>
                      <SelectItem value="Inductance Loop">Inductance Loop</SelectItem>
                      <SelectItem value="Microwave">Microwave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-grey-600">Slip Lanes</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCustomHasSlipLanes((v) => !v)}
                    className={`h-7 w-full text-xs font-normal ${
                      customHasSlipLanes ? "bg-primary-50 text-primary-700 border-primary-300" : ""
                    }`}
                  >
                    {customHasSlipLanes ? "FR Enabled" : "No Slip Lanes"}
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleGenerateCustom}
                size="sm"
                className="w-full h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Generate Custom Topology
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Interactive Tabbed Detail View (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Selected Intersection Info Card */}
          <Card>
            <CardHeader className="bg-grey-50 border-b border-grey-200 px-4 py-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-bold text-grey-900">
                      {currentIntersection.name}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs font-mono">
                      {currentIntersection.signal.signalId}
                    </Badge>
                  </div>
                  <p className="text-xs text-grey-500 mt-0.5">
                    {currentIntersection.signal.streetName1} &{" "}
                    {currentIntersection.signal.streetName2}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2.5 text-xs text-grey-600">
                    <div className="flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5 text-blue-600" />
                      <span>{currentIntersection.approaches.length} Approaches</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ArrowUpDown className="w-3.5 h-3.5 text-green-600" />
                      <span>{currentIntersection.phases.length} Phases</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-purple-600" />
                      <span>{currentIntersection.detectors.length} Detectors</span>
                    </div>
                  </div>
                  <Button
                    onClick={handleRandomize}
                    size="sm"
                    className="h-7 px-2.5 text-xs bg-primary-600 hover:bg-primary-700 text-white shadow-sm flex items-center gap-1.5"
                    title="Generate a new randomized intersection topology"
                  >
                    <Shuffle className="w-3 h-3" />
                    <span>Randomize</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <Tabs
                value={activeViewTab}
                onValueChange={(v) => setActiveViewTab(v as typeof activeViewTab)}
                className="w-full space-y-4"
              >
                <TabsList className="grid w-full grid-cols-5 h-9">
                  <TabsTrigger value="phase" className="text-xs flex items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span>Phase Diagram</span>
                  </TabsTrigger>
                  <TabsTrigger value="timing" className="text-xs flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Timing Parameters</span>
                  </TabsTrigger>
                  <TabsTrigger value="detectors" className="text-xs flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" />
                    <span>Detection Layout</span>
                  </TabsTrigger>
                  <TabsTrigger value="approaches" className="text-xs flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5" />
                    <span>Approaches & Slip Lanes</span>
                  </TabsTrigger>
                  <TabsTrigger value="trafficSide" className="text-xs flex items-center gap-1.5">
                    <SignpostBig className="w-3.5 h-3.5" />
                    <span>Traffic Side</span>
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1: PHASE DIAGRAM */}
                <TabsContent value="phase" className="space-y-4 m-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-grey-500">
                      Standard NEMA-style dual-ring visual mapping of movements and crosswalks.
                    </span>
                    <Button
                      onClick={handleDownloadPhaseDiagram}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Export JPG</span>
                    </Button>
                  </div>

                  <div className="border border-grey-200 rounded-lg p-3 bg-white flex items-center justify-center min-h-[380px]">
                    <div className="w-full max-w-[440px]">
                      <PhaseDiagram
                        phases={currentIntersection.phases}
                        approaches={currentIntersection.approaches}
                        intersectionId={currentIntersection.signal.signalId}
                        isLht={isLht}
                        svgRef={phaseSvgRef}
                      />
                    </div>
                  </div>

                  {/* Phase Summary Table */}
                  <div className="border border-grey-200 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader className="bg-grey-50">
                        <TableRow>
                          <TableHead className="text-xs">Phase #</TableHead>
                          <TableHead className="text-xs">Movement</TableHead>
                          <TableHead className="text-xs">Approach ID</TableHead>
                          <TableHead className="text-xs">Lanes</TableHead>
                          <TableHead className="text-xs">Ped Crossing</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentIntersection.phases.map((ph) => {
                          const app = currentIntersection.approaches.find(
                            (a) => a.approachId === ph.approachId,
                          );
                          const phColor = phaseColors[ph.phase] || "#6b7280";
                          return (
                            <TableRow key={ph.id || ph.phase}>
                              <TableCell className="text-xs font-bold py-1.5">
                                <span
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px]"
                                  style={{ backgroundColor: phColor }}
                                >
                                  {ph.phase}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs py-1.5">
                                {formatMovementType(ph.movementType, isLht)}
                              </TableCell>
                              <TableCell className="text-xs font-mono py-1.5">
                                {ph.approachId || "—"}{" "}
                                {app?.compassBearing != null && `(${app.compassBearing}°)`}
                              </TableCell>
                              <TableCell className="text-xs py-1.5">{ph.numOfLanes || 1}</TableCell>
                              <TableCell className="text-xs py-1.5">
                                {ph.isPedestrian ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-green-50 text-green-700 border-green-200"
                                  >
                                    {ph.crosswalkLength ? `${ph.crosswalkLength} ft` : "Active"}
                                  </Badge>
                                ) : (
                                  <span className="text-grey-400">None</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* TAB: TRAFFIC SIDE — compare RHT vs LHT lane mirroring side-by-side */}
                <TabsContent value="trafficSide" className="space-y-4 m-0">
                  <div className="text-xs text-grey-500">
                    Same intersection, mirrored for left-hand-traffic countries. Turn lanes and turn
                    arrows switch to the traffic side used by the selected agency.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-grey-200 rounded-lg p-3 bg-white">
                      <div className="text-xs font-semibold text-grey-600 mb-2 text-center">
                        Right-Hand Traffic
                      </div>
                      <div className="flex items-center justify-center min-h-[340px]">
                        <div className="w-full max-w-[380px]">
                          <PhaseDiagram
                            phases={currentIntersection.phases}
                            approaches={currentIntersection.approaches}
                            intersectionId={currentIntersection.signal.signalId}
                            isLht={false}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="border border-grey-200 rounded-lg p-3 bg-white">
                      <div className="text-xs font-semibold text-grey-600 mb-2 text-center">
                        Left-Hand Traffic
                      </div>
                      <div className="flex items-center justify-center min-h-[340px]">
                        <div className="w-full max-w-[380px]">
                          <PhaseDiagram
                            phases={currentIntersection.phases}
                            approaches={currentIntersection.approaches}
                            intersectionId={currentIntersection.signal.signalId}
                            isLht={true}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* TAB 2: TIMING PARAMETERS */}
                <TabsContent value="timing" className="space-y-4 m-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-grey-500">
                      Phase interval splits (Min/Max Green, Yellow, All-Red clearance, Ped Walk).
                    </span>
                  </div>

                  <div className="border border-grey-200 rounded-lg p-3 bg-white flex items-center justify-center min-h-[220px]">
                    <DemoTimingBarChart
                      timings={currentIntersection.basicTimings}
                      intersectionName={currentIntersection.name}
                      svgRef={timingSvgRef}
                    />
                  </div>

                  {/* Timing Data Grid */}
                  <div className="border border-grey-200 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader className="bg-grey-50">
                        <TableRow>
                          <TableHead className="text-xs">Phase</TableHead>
                          <TableHead className="text-xs text-center">Min Green (s)</TableHead>
                          <TableHead className="text-xs text-center">Max Green (s)</TableHead>
                          <TableHead className="text-xs text-center">Yellow (s)</TableHead>
                          <TableHead className="text-xs text-center">All-Red (s)</TableHead>
                          <TableHead className="text-xs text-center">Walk (s)</TableHead>
                          <TableHead className="text-xs text-center">Ped Clr (s)</TableHead>
                          <TableHead className="text-xs text-right">Veh Recall</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentIntersection.basicTimings.map((bt) => {
                          const phColor = phaseColors[bt.phase] || "#6b7280";
                          return (
                            <TableRow key={bt.id || bt.phase}>
                              <TableCell className="text-xs font-bold py-1.5">
                                <span
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px]"
                                  style={{ backgroundColor: phColor }}
                                >
                                  {bt.phase}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-center py-1.5">
                                {bt.minGreen ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs text-center py-1.5">
                                {bt.maxGreen ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs text-center py-1.5">
                                {bt.yellow ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs text-center py-1.5">
                                {bt.allRed ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs text-center py-1.5">
                                {bt.pedWalk ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs text-center py-1.5">
                                {bt.pedClearance ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs text-right py-1.5">
                                <Badge variant="secondary" className="text-[10px]">
                                  {bt.vehRecallType || "None"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* TAB 3: DETECTION SYSTEMS */}
                <TabsContent value="detectors" className="space-y-4 m-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-grey-500">
                      Vehicle and pedestrian detection placement, setbacks, and sensor technologies.
                    </span>
                    <Button
                      onClick={handleDownloadDetectorDiagram}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Export JPG</span>
                    </Button>
                  </div>

                  <div className="border border-grey-200 rounded-lg p-3 bg-white flex items-center justify-center min-h-[380px]">
                    <div className="w-full max-w-[480px]">
                      <DetectorDiagram
                        detectors={currentIntersection.detectors}
                        phases={currentIntersection.phases}
                        approaches={currentIntersection.approaches}
                        signal={currentIntersection.signal}
                        svgRef={detectorSvgRef}
                      />
                    </div>
                  </div>

                  {/* Detectors Table */}
                  <div className="border border-grey-200 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader className="bg-grey-50">
                        <TableRow>
                          <TableHead className="text-xs">Channel</TableHead>
                          <TableHead className="text-xs">Phase</TableHead>
                          <TableHead className="text-xs">Approach</TableHead>
                          <TableHead className="text-xs">Purpose</TableHead>
                          <TableHead className="text-xs">Technology</TableHead>
                          <TableHead className="text-xs text-right">Setback Distance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentIntersection.detectors.map((det) => (
                          <TableRow key={det.id || det.channel}>
                            <TableCell className="text-xs font-mono font-bold py-1.5">
                              #{det.channel}
                            </TableCell>
                            <TableCell className="text-xs py-1.5">
                              {det.phase ? `Phase ${det.phase}` : "Count / Global"}
                            </TableCell>
                            <TableCell className="text-xs font-mono py-1.5">
                              {det.approachId || "—"}
                            </TableCell>
                            <TableCell className="text-xs py-1.5">
                              <Badge variant="outline" className="text-[10px]">
                                {det.purpose}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs py-1.5">{det.technologyType}</TableCell>
                            <TableCell className="text-xs text-right font-mono py-1.5">
                              {det.stopbarSetbackDist != null
                                ? `${det.stopbarSetbackDist} ft`
                                : "Stop bar"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* TAB 4: APPROACHES & GEOMETRY */}
                <TabsContent value="approaches" className="space-y-4 m-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-grey-500">
                      Intersection geometry, compass bearings, posted approach speeds, and slip lane
                      bypasses.
                    </span>
                  </div>

                  <div className="border border-grey-200 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader className="bg-grey-50">
                        <TableRow>
                          <TableHead className="text-xs">Approach ID</TableHead>
                          <TableHead className="text-xs">Street Name</TableHead>
                          <TableHead className="text-xs">Compass Bearing</TableHead>
                          <TableHead className="text-xs">Posted Speed</TableHead>
                          <TableHead className="text-xs">Slip Lane (Free Right)</TableHead>
                          <TableHead className="text-xs text-right">Slip Lanes Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentIntersection.approaches.map((app) => {
                          const color = approachColorFor(
                            currentIntersection.approaches,
                            app.approachId,
                          );
                          return (
                            <TableRow key={app.id || app.approachId}>
                              <TableCell className="text-xs font-bold py-2 font-mono flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                {app.approachId}
                              </TableCell>
                              <TableCell className="text-xs py-2">{app.streetName}</TableCell>
                              <TableCell className="text-xs font-mono py-2">
                                <Badge variant="secondary" className="text-[10px] font-mono">
                                  {app.compassBearing}°
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs py-2">
                                {app.postedSpeed ? `${app.postedSpeed} mph` : "—"}
                              </TableCell>
                              <TableCell className="text-xs py-2">
                                {app.freeRight === 1 && (
                                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                                    FR (Free Right)
                                  </Badge>
                                )}
                                {app.freeRight === 2 && (
                                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">
                                    FR-P (With Ped Crossing)
                                  </Badge>
                                )}
                                {app.freeRight === 3 && (
                                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">
                                    FR-P-I (Channelized Island)
                                  </Badge>
                                )}
                                {(!app.freeRight || app.freeRight === 0) && (
                                  <span className="text-xs text-grey-400">None</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-right py-2">
                                {app.freeRight ? app.freeRightLanes || 1 : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
