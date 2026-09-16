import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SignalsMap from "@/components/ui/signals-map";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  getSignalDisplayName,
  isMetricForSignalId,
  naturalCompare,
  useDetectors,
  useGTSSStore,
} from "gtss";
import { Detector } from "gtss/schema";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import BulkDetectorModal from "./bulk-detector-modal";
import DetectorModal from "./detector-modal";

type SortField = 'signalId' | 'channel' | 'phase' | 'technologyType' | 'purpose';
type SortDirection = 'asc' | 'desc';

interface DetectorsTableProps {
  triggerAdd?: number;
  triggerBulk?: number;
}

// This table can list every signal at once, so length and setback resolve
// their units against each row's own signal rather than one global setting.
const formatDistance = (value: number | null | undefined, signalId: string) => {
  if (value == null) return <span className="text-grey-400">&mdash;</span>;
  const metric = isMetricForSignalId(signalId);
  return metric ? `${value.toFixed(2)} m` : `${value} ft`;
};

// Setback is signed: positive is upstream of the stop bar, negative past it.
const formatSetback = (value: number | null | undefined, signalId: string) => {
  if (value == null) return <span className="text-grey-400">&mdash;</span>;
  const metric = isMetricForSignalId(signalId);
  const magnitude = metric ? `${Math.abs(value).toFixed(2)} m` : `${Math.abs(value)} ft`;
  return value < 0 ? `${magnitude} past` : magnitude;
};

export default function DetectorsTable({ triggerAdd, triggerBulk }: DetectorsTableProps) {
  const [editingDetector, setEditingDetector] = useState<Detector | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [sortField, setSortField] = useState<SortField>('signalId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { detectors, signals, approaches, phases, selectedSignalIdForTables, setSelectedSignalIdForTables } = useGTSSStore();
  const { deepLinkTarget, setDeepLinkTarget } = useGTSSStore();
  const svgRef = useRef<SVGSVGElement>(null);

  // Use shared signal selection from store
  const selectedSignalId = selectedSignalIdForTables;
  const setSelectedSignalId = setSelectedSignalIdForTables;

  // Auto-select first signal on mount if none selected
  useEffect(() => {
    if (signals.length > 0 && !selectedSignalId) {
      setSelectedSignalId(signals[0].signalId);
    }
  }, [signals, selectedSignalId, setSelectedSignalId]);

  // Open detector modal when deep-linked
  useEffect(() => {
    if (deepLinkTarget?.type === 'detector' && deepLinkTarget.id) {
      const det = detectors.find(d => d.id === deepLinkTarget.id);
      if (det) {
        setSelectedSignalId(det.signalId);
        setEditingDetector(det);
        setShowModal(true);
        setDeepLinkTarget({ type: null, id: null });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkTarget, detectors]);
  const { toast } = useToast();
  const detectorHooks = useDetectors();

  // Handle triggers from parent component. Capture initial values so the
  // modal doesn't auto-open when the table re-mounts after navigation.
  const initialTriggerAdd = useRef(triggerAdd);
  const initialTriggerBulk = useRef(triggerBulk);

  useEffect(() => {
    if (triggerAdd !== initialTriggerAdd.current && triggerAdd && triggerAdd > 0) {
      handleAdd();
    }
  }, [triggerAdd]);

  // Handle bulk modal trigger
  useEffect(() => {
    if (triggerBulk !== initialTriggerBulk.current && triggerBulk && triggerBulk > 0) {
      setShowBulkModal(true);
    }
  }, [triggerBulk]);

  // Filter detectors by selected signal
  const filteredDetectors = selectedSignalId
    ? detectors.filter(detector => detector.signalId === selectedSignalId)
    : [];

  // Get signal approaches and phases for diagram
  const signalApproaches = selectedSignalId
    ? approaches.filter(a => a.signalId === selectedSignalId)
    : [];

  const signalPhases = selectedSignalId
    ? phases.filter(p => p.signalId === selectedSignalId)
    : [];

  // Download diagram as JPG
  const handleDownloadDiagram = () => {
    if (!svgRef.current) return;

    const svgElement = svgRef.current;
    const viewBox = svgElement.getAttribute('viewBox');
    let svgWidth = 400;
    let svgHeight = 440;

    if (viewBox) {
      const [, , width, height] = viewBox.split(' ').map(Number);
      svgWidth = width;
      svgHeight = height;
    }

    const svgData = new XMLSerializer().serializeToString(svgElement);
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

      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, svgWidth, svgHeight);

      const signal = signals.find(s => s.signalId === selectedSignalId);
      const fileName = signal
        ? `detector-layout-${signal.signalId}.jpg`
        : "detector-layout.jpg";

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      }, "image/jpeg", 0.95);

      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
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
      let comparison = 0;

      switch (sortField) {
        case 'signalId':
          comparison = naturalCompare(a.signalId, b.signalId);
          break;
        case 'channel':
          comparison = naturalCompare(a.channel, b.channel);
          break;
        case 'phase':
          comparison = (a.phase || 0) - (b.phase || 0);
          break;
        case 'technologyType':
          comparison = a.technologyType.localeCompare(b.technologyType);
          break;
        case 'purpose':
          comparison = a.purpose.localeCompare(b.purpose);
          break;
        default:
          comparison = naturalCompare(a.signalId, b.signalId);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
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
    <div className="max-w-6xl h-full">
      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="detectors-split"
        className="flex-1 min-h-[420px] rounded-lg border border-grey-200 bg-white overflow-hidden"
      >
        <ResizablePanel defaultSize={42} minSize={12} className="relative z-0">
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
                <SignalsMap signals={signals.filter(s => s.signalId === selectedSignalId)} className="w-full h-full" />
              ) : (
                <div className="w-full h-full bg-grey-100 flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-grey-400" />
                </div>
              )}
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-grey-200 hover:bg-primary-300 transition-colors" />
        <ResizablePanel defaultSize={58} minSize={20} className="flex flex-col min-h-0">
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
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-grey-50 border-b border-grey-200">
                      <SortableHeader field="signalId">Signal ID</SortableHeader>
                      <SortableHeader field="channel">Channel</SortableHeader>
                      <SortableHeader field="phase">Phase</SortableHeader>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Approach</TableHead>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Lane</TableHead>
                      <SortableHeader field="technologyType">Technology</SortableHeader>
                      <SortableHeader field="purpose">Purpose</SortableHeader>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Vehicle</TableHead>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Length</TableHead>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider" title="Distance from the stop bar: positive approaching it, negative past it.">
                        Setback
                      </TableHead>
                      <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!selectedSignalId ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-4 text-xs text-grey-500">
                          Please select a signal above to view its detectors.
                        </TableCell>
                      </TableRow>
                    ) : filteredDetectors.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-4 text-xs text-grey-500">
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
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {detector.phase ?? <span className="text-grey-400">&mdash;</span>}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {detector.approachId ?? <span className="text-grey-400">&mdash;</span>}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {detector.lane || <span className="text-grey-400">&mdash;</span>}
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs py-0 px-1.5 h-4">
                              {detector.technologyType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">{detector.purpose}</TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {detector.vehicleType || <span className="text-grey-400">&mdash;</span>}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {formatDistance(detector.length, detector.signalId)}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {formatSetback(detector.stopbarSetbackDist, detector.signalId)}
                          </TableCell>
                          <TableCell className="text-grey-600 text-xs py-1.5 px-2">
                            {detector.description || <span className="text-grey-400">&mdash;</span>}
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
        <DetectorModal
          detector={editingDetector}
          onClose={handleModalClose}
          preSelectedSignalId={editingDetector ? undefined : selectedSignalId}
        />
      )}

      {showBulkModal && (
        <BulkDetectorModal
          onClose={() => setShowBulkModal(false)}
          preSelectedSignalId={selectedSignalId}
        />
      )}
    </div>
  );
}
