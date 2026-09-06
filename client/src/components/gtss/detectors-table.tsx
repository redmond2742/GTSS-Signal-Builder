import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SignalsMap from "@/components/ui/signals-map";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useGTSSStore } from "@/store/gtss-store";
import { Detector } from "@shared/schema";
import { getSignalDisplayName, useDetectors } from "gtss";
import { ChevronDown, ChevronUp, Download, MapPin, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import BulkDetectorModal from "./bulk-detector-modal";
import DetectorDiagram from "./detector-diagram";
import DetectorModal from "./detector-modal";

type SortField = 'signalId' | 'channel' | 'phase' | 'technologyType' | 'purpose';
type SortDirection = 'asc' | 'desc';

interface DetectorsTableProps {
  triggerAdd?: number;
  triggerBulk?: number;
}

export default function DetectorsTable({ triggerAdd, triggerBulk }: DetectorsTableProps) {
  const [editingDetector, setEditingDetector] = useState<Detector | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [sortField, setSortField] = useState<SortField>('signalId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { detectors, signals, approaches, phases, selectedSignalIdForTables, setSelectedSignalIdForTables } = useGTSSStore();
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
    <div className="max-w-6xl">
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 p-3">
          {signals.length === 0 ? (
            <div className="p-2 bg-warning-50 border border-warning-200 rounded-md">
              <p className="text-xs text-warning-700">
                No signals configured. Please add signals before creating detectors.
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
                <Button
                  onClick={() => setShowBulkModal(true)}
                  className="h-8 px-3 text-xs bg-primary-600 hover:bg-primary-700 flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Detectors</span>
                </Button>
              </div>
              {selectedSignalId && (
                <div className="flex flex-col gap-2">
                  {filteredDetectors.length > 0 && (() => {
                    const selectedSignal = signals.find(s => s.signalId === selectedSignalId);
                    const signalName = selectedSignal ? getSignalDisplayName(selectedSignal, approaches) : selectedSignalId;
                    return (
                      <div className="flex flex-col items-center">
                        <div className="text-sm font-semibold text-grey-700 mb-1 text-center">
                          {signalName}
                        </div>
                        <div className="w-72 h-72 border border-grey-300 rounded-md overflow-hidden bg-white">
                          <DetectorDiagram
                            detectors={filteredDetectors}
                            phases={signalPhases}
                            approaches={signalApproaches}
                            signal={selectedSignal}
                            svgRef={svgRef}
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadDiagram}
                          className="mt-2 h-7 text-xs"
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Download JPG
                        </Button>
                      </div>
                    );
                  })()}
                  {(() => {
                    const selectedSignal = signals.find(s => s.signalId === selectedSignalId);
                    return (
                      <div className="w-full h-72">
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

      {showBulkModal && (
        <BulkDetectorModal
          onClose={() => setShowBulkModal(false)}
          preSelectedSignalId={selectedSignalId}
        />
      )}
    </div>
  );
}
