import { useState, useMemo, useEffect, useRef } from "react";
import { useDetectors } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Plus, Save, Trash2, Copy, Lock, Unlock, HelpCircle, AlertTriangle, Download } from "lucide-react";
import { getSignalDisplayName } from "@/lib/utils";
import DetectorDiagram from "./detector-diagram";

// Detector purposes
const purposeOptions = [
  { value: "Stop Bar", label: "Stop Bar" },
  { value: "Advanced Loop", label: "Advanced Loop" },
  { value: "Count Detector", label: "Count Detector" },
  { value: "Extension", label: "Extension" },
  { value: "Dilemma Zone", label: "Dilemma Zone" },
];

// Technology types
const technologyOptions = [
  { value: "Inductance Loop", label: "Inductance Loop" },
  { value: "Video", label: "Video Detection" },
  { value: "Radar", label: "Radar" },
  { value: "Microwave", label: "Microwave" },
  { value: "Magnetic", label: "Magnetic" },
];

// Vehicle types
const vehicleTypeOptions = [
  { value: "Vehicle", label: "Vehicle" },
  { value: "All", label: "All Vehicles" },
  { value: "Passenger", label: "Passenger" },
  { value: "Commercial", label: "Commercial" },
  { value: "Transit", label: "Transit" },
  { value: "Emergency", label: "Emergency" },
  { value: "Bike", label: "Bike" },
];

// Compass directions
const compassDirections = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const bearingToDirection = (bearing?: number | null) => {
  if (bearing === null || bearing === undefined || Number.isNaN(bearing)) {
    return "";
  }
  const normalized = ((bearing % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % compassDirections.length;
  return compassDirections[index];
};

const formatPurposeForDescription = (purpose?: string) => {
  if (!purpose) return "";
  if (purpose === "Stop Bar") return "Stopbar";
  return purpose;
};

// Build description from direction, purpose, and lane
const buildDescription = (direction: string, purpose: string, lane: string): string => {
  const parts: string[] = [];
  if (direction) parts.push(direction);
  if (purpose) parts.push(purpose);
  if (lane) parts.push(`Lane ${lane}`);
  return parts.join(" ").trim();
};

// Increment last number in string
const incrementLastNumber = (value: string): string => {
  const match = value.match(/(\d+)(?!.*\d)/);
  if (!match) return value + "1";
  const nextValue = String(parseInt(match[1], 10) + 1).padStart(match[1].length, "0");
  return value.replace(/(\d+)(?!.*\d)/, nextValue);
};

// Remove commas from string
const sanitizeDescription = (value: string): string => {
  return value.replace(/,/g, "");
};

interface PendingDetector {
  id?: string;
  channel: string;
  phase: number;
  lane: string;
  purpose: string;
  technologyType: string;
  vehicleType: string;
  length: number | undefined;
  stopbarSetbackDist: number | undefined;
  description: string;
  isDescriptionManual: boolean;
}

interface StaticFields {
  purpose: boolean;
  technologyType: boolean;
  vehicleType: boolean;
  length: boolean;
  stopbarSetbackDist: boolean;
}

interface BulkDetectorModalProps {
  onClose: () => void;
  preSelectedSignalId?: string;
  /** When true, render in-place (no Dialog wrapper). Defaults to false. */
  inline?: boolean;
}

export default function BulkDetectorModal({ onClose, preSelectedSignalId, inline = false }: BulkDetectorModalProps) {
  const { signals, approaches, phases, detectors: existingDetectorsFromStore } = useGTSSStore();
  const { toast } = useToast();
  const detectorHooks = useDetectors();

  const [selectedSignalId, setSelectedSignalId] = useState<string>(preSelectedSignalId || "");
  const [pendingDetectors, setPendingDetectors] = useState<PendingDetector[]>([]);
  const [existingDetectors, setExistingDetectors] = useState<PendingDetector[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const detectorSvgRef = useRef<SVGSVGElement>(null);

  // Static field values (used when field is locked)
  const [staticValues, setStaticValues] = useState({
    purpose: "Stop Bar",
    technologyType: "Inductance Loop",
    vehicleType: "Vehicle",
    length: 6.0 as number | undefined,
    stopbarSetbackDist: 0 as number | undefined,
  });

  // Which fields are static (locked)
  const [staticFields, setStaticFields] = useState<StaticFields>({
    purpose: true,
    technologyType: true,
    vehicleType: true,
    length: false,
    stopbarSetbackDist: false,
  });

  // Quick add settings
  const [quickAddCount, setQuickAddCount] = useState(1);
  const [selectedPhaseForQuickAdd, setSelectedPhaseForQuickAdd] = useState<number | null>(null);
  const [startingChannel, setStartingChannel] = useState("1");
  const [startingLane, setStartingLane] = useState("1");

  // Get phases for selected signal
  const signalPhases = useMemo(() => {
    return phases.filter(p => p.signalId === selectedSignalId).sort((a, b) => a.phase - b.phase);
  }, [phases, selectedSignalId]);

  // Get approaches for selected signal
  const signalApproaches = useMemo(() => {
    return approaches.filter(a => a.signalId === selectedSignalId);
  }, [approaches, selectedSignalId]);

  // Get direction for a phase
  const getPhaseDirection = (phaseNum: number): string => {
    const phase = signalPhases.find(p => p.phase === phaseNum);
    if (!phase?.approachId) return "";
    const approach = signalApproaches.find(a => a.approachId === phase.approachId);
    return bearingToDirection(approach?.compassBearing ?? null);
  };

  // Auto-update descriptions when static purpose changes
  useEffect(() => {
    if (staticFields.purpose) {
      setPendingDetectors(prev => prev.map(det => {
        if (det.isDescriptionManual) return det;
        const direction = getPhaseDirection(det.phase);
        const formattedPurpose = formatPurposeForDescription(staticValues.purpose);
        return {
          ...det,
          description: buildDescription(direction, formattedPurpose, det.lane),
        };
      }));
    }
  }, [staticValues.purpose, staticFields.purpose]);

  // Toggle static field
  const toggleStaticField = (field: keyof StaticFields) => {
    setStaticFields(prev => ({ ...prev, [field]: !prev[field] }));

    // If toggling to static, apply static value to all detectors
    if (!staticFields[field]) {
      setPendingDetectors(prev => prev.map(det => ({
        ...det,
        [field]: staticValues[field as keyof typeof staticValues],
      })));
    }
  };

  // Update static value
  const updateStaticValue = (field: keyof typeof staticValues, value: any) => {
    setStaticValues(prev => ({ ...prev, [field]: value }));

    // If field is static, apply to all detectors
    if (staticFields[field as keyof StaticFields]) {
      setPendingDetectors(prev => prev.map(det => {
        const updated = { ...det, [field]: value };
        // Update description if purpose changed and not manually set
        if (field === 'purpose' && !det.isDescriptionManual) {
          const direction = getPhaseDirection(det.phase);
          const formattedPurpose = formatPurposeForDescription(value);
          updated.description = buildDescription(direction, formattedPurpose, det.lane);
        }
        return updated;
      }));
    }
  };

  // Add detector row
  const handleAddDetector = (phaseNum?: number) => {
    const targetPhase = phaseNum ?? signalPhases[0]?.phase ?? 1;
    const direction = getPhaseDirection(targetPhase);
    const formattedPurpose = formatPurposeForDescription(staticFields.purpose ? staticValues.purpose : "Stop Bar");

    // Next channel simply continues the sequence from the last row added.
    // Channels are NOT forced to be unique — the same detector number can
    // legitimately repeat on another lane — so this is a convenience default,
    // not a constraint, and the field stays freely editable.
    const nextChannel = pendingDetectors.length > 0
      ? incrementLastNumber(pendingDetectors[pendingDetectors.length - 1].channel)
      : startingChannel;

    // Calculate next lane for this phase
    const samePhaseDetectors = pendingDetectors.filter(d => d.phase === targetPhase);
    let nextLane = startingLane;
    if (samePhaseDetectors.length > 0) {
      const lastLane = samePhaseDetectors[samePhaseDetectors.length - 1].lane;
      nextLane = incrementLastNumber(lastLane);
    }

    const newDetector: PendingDetector = {
      channel: nextChannel,
      phase: targetPhase,
      lane: nextLane,
      purpose: staticFields.purpose ? staticValues.purpose : "Stop Bar",
      technologyType: staticFields.technologyType ? staticValues.technologyType : "Inductance Loop",
      vehicleType: staticFields.vehicleType ? staticValues.vehicleType : "Vehicle",
      length: staticFields.length ? staticValues.length : 6.0,
      stopbarSetbackDist: staticFields.stopbarSetbackDist ? staticValues.stopbarSetbackDist : 0,
      description: buildDescription(direction, formattedPurpose, nextLane),
      isDescriptionManual: false,
    };

    setPendingDetectors(prev => [...prev, newDetector]);
  };

  // Quick add multiple detectors for a phase
  const handleQuickAdd = () => {
    if (!selectedPhaseForQuickAdd) {
      toast({
        title: "Select a Phase",
        description: "Please select a phase for quick add",
        variant: "destructive",
      });
      return;
    }

    const direction = getPhaseDirection(selectedPhaseForQuickAdd);
    const formattedPurpose = formatPurposeForDescription(staticFields.purpose ? staticValues.purpose : "Stop Bar");

    const newDetectors: PendingDetector[] = [];
    let currentChannel = startingChannel;
    let currentLane = startingLane;

    // Channels run straight from the starting value the user typed. Rows that
    // land on a channel already in use are allowed through — one channel can
    // cover several lanes.
    for (let i = 0; i < quickAddCount; i++) {
      newDetectors.push({
        channel: currentChannel,
        phase: selectedPhaseForQuickAdd,
        lane: currentLane,
        purpose: staticFields.purpose ? staticValues.purpose : "Stop Bar",
        technologyType: staticFields.technologyType ? staticValues.technologyType : "Inductance Loop",
        vehicleType: staticFields.vehicleType ? staticValues.vehicleType : "Vehicle",
        length: staticFields.length ? staticValues.length : 6.0,
        stopbarSetbackDist: staticFields.stopbarSetbackDist ? staticValues.stopbarSetbackDist : 0,
        description: buildDescription(direction, formattedPurpose, currentLane),
        isDescriptionManual: false,
      });

      currentChannel = incrementLastNumber(currentChannel);
      currentLane = incrementLastNumber(currentLane);
    }

    setPendingDetectors(prev => [...prev, ...newDetectors]);

    // Update starting values for next quick add
    setStartingChannel(currentChannel);
    setStartingLane(currentLane);

    toast({
      title: "Detectors Added",
      description: `Added ${quickAddCount} detector${quickAddCount > 1 ? 's' : ''} for Phase ${selectedPhaseForQuickAdd}`,
    });
  };

  // Update detector field
  const handleDetectorChange = (index: number, field: keyof PendingDetector, value: any) => {
    setPendingDetectors(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // Auto-update description if not manually set
      if (!updated[index].isDescriptionManual && (field === 'phase' || field === 'lane')) {
        const direction = getPhaseDirection(updated[index].phase);
        const purpose = staticFields.purpose ? staticValues.purpose : updated[index].purpose;
        const formattedPurpose = formatPurposeForDescription(purpose);
        updated[index].description = buildDescription(direction, formattedPurpose, updated[index].lane);
      }

      // If purpose is not static and changed, update description
      if (field === 'purpose' && !staticFields.purpose && !updated[index].isDescriptionManual) {
        const direction = getPhaseDirection(updated[index].phase);
        const formattedPurpose = formatPurposeForDescription(value);
        updated[index].description = buildDescription(direction, formattedPurpose, updated[index].lane);
      }

      // Mark description as manual if user edited it
      if (field === 'description') {
        updated[index].isDescriptionManual = true;
        updated[index].description = sanitizeDescription(value);
      }

      return updated;
    });
  };

  // Delete detector row
  const handleDeleteDetector = (index: number) => {
    setPendingDetectors(prev => prev.filter((_, i) => i !== index));
  };

  // Duplicate detector with incremented channel and lane
  const handleDuplicateDetector = (index: number) => {
    const source = pendingDetectors[index];
    // One step up on both fields. Edit either back down if this channel is
    // meant to cover the adjacent lane too.
    const nextChannel = incrementLastNumber(source.channel);
    const nextLane = incrementLastNumber(source.lane);
    const direction = getPhaseDirection(source.phase);
    const formattedPurpose = formatPurposeForDescription(source.purpose);

    const newDetector: PendingDetector = {
      ...source,
      id: undefined,
      channel: nextChannel,
      lane: nextLane,
      description: buildDescription(direction, formattedPurpose, nextLane),
      isDescriptionManual: false,
    };

    setPendingDetectors(prev => [...prev, newDetector]);
  };

  // Update existing detector field
  const handleExistingDetectorChange = (index: number, field: keyof PendingDetector, value: any) => {
    setExistingDetectors(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // Mark description as manual if user edited it
      if (field === 'description') {
        updated[index].isDescriptionManual = true;
        updated[index].description = sanitizeDescription(value);
      }

      return updated;
    });
  };

  // Delete existing detector
  const handleDeleteExistingDetector = (index: number) => {
    const detector = existingDetectors[index];
    if (detector.id && confirm(`Delete detector ${detector.channel}?`)) {
      detectorHooks.delete(detector.id);
      setExistingDetectors(prev => prev.filter((_, i) => i !== index));
      toast({
        title: "Deleted",
        description: `Detector ${detector.channel} deleted`,
      });
    }
  };

  // Save all detectors (new and updated existing)
  const handleSaveAll = async () => {
    if (!selectedSignalId) {
      toast({
        title: "No Signal Selected",
        description: "Please select a signal first",
        variant: "destructive",
      });
      return;
    }

    // Edits to existing detectors are saveable on their own — adding a new row
    // is not a precondition. Only an empty panel has nothing to write.
    if (pendingDetectors.length === 0 && existingDetectors.length === 0) {
      toast({
        title: "Nothing to Save",
        description: "Add a detector, or edit one of the existing rows",
        variant: "destructive",
      });
      return;
    }

    // Channel numbers are deliberately NOT required to be unique: one channel
    // often reports several lanes on the same phase, so the same number can
    // appear on more than one row. Only a row that repeats channel + phase +
    // lane exactly looks like a slip, and even that is just flagged — the save
    // goes through either way.
    const rowIdentity = (d: { channel: string; phase: number; lane: string | null }) =>
      `${(d.channel ?? '').trim()}|${d.phase}|${(d.lane ?? '').trim()}`;
    const seenRows = new Set<string>();
    const repeatedChannels = new Set<string>();
    [...existingDetectors, ...pendingDetectors].forEach(d => {
      const key = rowIdentity(d);
      if (seenRows.has(key)) repeatedChannels.add((d.channel ?? '').trim());
      else seenRows.add(key);
    });
    // Only one toast is ever on screen at a time, so this rides along with the
    // success message below rather than firing its own.
    const repeatNote = repeatedChannels.size > 0
      ? ` Channel ${Array.from(repeatedChannels).join(", ")} repeats the same phase and lane.`
      : "";

    setIsProcessing(true);

    try {
      // Update existing detectors
      for (const detector of existingDetectors) {
        if (detector.id) {
          detectorHooks.update(detector.id, {
            signalId: selectedSignalId,
            channel: detector.channel,
            phase: detector.phase,
            description: sanitizeDescription(detector.description),
            purpose: detector.purpose,
            vehicleType: detector.vehicleType,
            lane: detector.lane,
            technologyType: detector.technologyType,
            length: detector.length,
            stopbarSetbackDist: detector.stopbarSetbackDist,
          });
        }
      }

      // Save new detectors
      for (const detector of pendingDetectors) {
        detectorHooks.save({
          signalId: selectedSignalId,
          channel: detector.channel,
          phase: detector.phase,
          description: sanitizeDescription(detector.description),
          purpose: detector.purpose,
          vehicleType: detector.vehicleType,
          lane: detector.lane,
          technologyType: detector.technologyType,
          length: detector.length,
          stopbarSetbackDist: detector.stopbarSetbackDist,
        });
      }

      const createdCount = pendingDetectors.length;
      const updatedCount = existingDetectors.filter(d => d.id).length;
      const summary = [
        createdCount > 0 ? `Created ${createdCount} detector${createdCount !== 1 ? "s" : ""}` : "",
        updatedCount > 0 ? `${createdCount > 0 ? "updated" : "Updated"} ${updatedCount} existing` : "",
      ].filter(Boolean).join(", ");
      toast({
        title: "Success",
        description: `${summary}.${repeatNote}`,
      });

      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save detectors",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Load existing detectors and reset pending when signal changes
  useEffect(() => {
    setPendingDetectors([]);
    setStartingChannel("1");
    setStartingLane("1");
    if (signalPhases.length > 0) {
      setSelectedPhaseForQuickAdd(signalPhases[0].phase);
    }

    // Load existing detectors for this signal
    if (selectedSignalId) {
      const signalDetectors = existingDetectorsFromStore
        .filter(d => d.signalId === selectedSignalId)
        .map(d => ({
          id: d.id,
          channel: d.channel,
          phase: d.phase,
          lane: d.lane || "1",
          purpose: d.purpose || "Stop Bar",
          technologyType: d.technologyType || "Inductance Loop",
          vehicleType: d.vehicleType || "Vehicle",
          length: d.length,
          stopbarSetbackDist: d.stopbarSetbackDist,
          description: d.description || "",
          isDescriptionManual: true,
        }));
      setExistingDetectors(signalDetectors);

      // Set starting channel to be after existing detectors
      if (signalDetectors.length > 0) {
        const maxChannel = Math.max(...signalDetectors.map(d => parseInt(d.channel) || 0));
        setStartingChannel(String(maxChannel + 1));
      }
    } else {
      setExistingDetectors([]);
    }
  }, [selectedSignalId, existingDetectorsFromStore]);

  // Download detector diagram as JPG
  const handleDownloadDiagram = () => {
    if (!detectorSvgRef.current) return;

    const svgElement = detectorSvgRef.current;

    // Get the viewBox dimensions to capture the full SVG
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
      const scale = 2; // Higher resolution
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

  const titleText = "Add Multiple Detectors";
  const titleBadge = pendingDetectors.length > 0 && (
    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
      {pendingDetectors.length} detector{pendingDetectors.length !== 1 ? "s" : ""}
    </Badge>
  );
  const signalSelector = (
    <Select value={selectedSignalId} onValueChange={setSelectedSignalId}>
      <SelectTrigger className="w-72">
        <SelectValue placeholder="Select a signal" />
      </SelectTrigger>
      <SelectContent>
        {signals.map((signal) => (
          <SelectItem key={signal.signalId} value={signal.signalId}>
            {getSignalDisplayName(signal, approaches)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const body = (
    <>
        <div className="space-y-4">
          {!selectedSignalId ? (
            <div className="p-8 text-center text-grey-500 text-sm">
              Select a signal to add detectors
            </div>
          ) : signalPhases.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                This signal has no phases configured. Please add phases first before creating detectors.
              </p>
            </div>
          ) : (
            <>
              {/* Detector Diagram */}
              <div className="border border-grey-200 rounded-lg p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-grey-700">Detection Layout Preview</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3 h-3 text-grey-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Visual representation of detector positions. Stop bar detectors appear near the intersection, advanced detectors further away. Colors indicate technology type.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  {(existingDetectors.length > 0 || pendingDetectors.length > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadDiagram}
                      className="h-7 text-xs"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Download
                    </Button>
                  )}
                </div>
                <div className="h-80 flex items-center justify-center">
                  {existingDetectors.length === 0 && pendingDetectors.length === 0 ? (
                    <div className="text-sm text-grey-400">Add detectors to see layout preview</div>
                  ) : (
                    <DetectorDiagram
                      detectors={[...existingDetectors, ...pendingDetectors]}
                      phases={signalPhases}
                      approaches={signalApproaches}
                      signal={signals.find(s => s.signalId === selectedSignalId)}
                      svgRef={detectorSvgRef}
                    />
                  )}
                </div>
              </div>

              {/* Static Fields Configuration */}
              <div className="border border-grey-200 rounded-lg p-4 bg-grey-50">
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="w-4 h-4 text-grey-500" />
                  <span className="text-sm font-medium text-grey-700">Static Fields</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-grey-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Lock fields to apply the same value to all detectors. Unlock to set different values per detector row.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {/* Purpose */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Purpose</Label>
                      <Switch
                        checked={staticFields.purpose}
                        onCheckedChange={() => toggleStaticField('purpose')}
                        className="scale-75"
                      />
                    </div>
                    <Select
                      value={staticValues.purpose}
                      onValueChange={(v) => updateStaticValue('purpose', v)}
                      disabled={!staticFields.purpose}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {purposeOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Technology Type */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Technology</Label>
                      <Switch
                        checked={staticFields.technologyType}
                        onCheckedChange={() => toggleStaticField('technologyType')}
                        className="scale-75"
                      />
                    </div>
                    <Select
                      value={staticValues.technologyType}
                      onValueChange={(v) => updateStaticValue('technologyType', v)}
                      disabled={!staticFields.technologyType}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {technologyOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Vehicle Type */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Vehicle Type</Label>
                      <Switch
                        checked={staticFields.vehicleType}
                        onCheckedChange={() => toggleStaticField('vehicleType')}
                        className="scale-75"
                      />
                    </div>
                    <Select
                      value={staticValues.vehicleType}
                      onValueChange={(v) => updateStaticValue('vehicleType', v)}
                      disabled={!staticFields.vehicleType}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicleTypeOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Length */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Length (ft)</Label>
                      <Switch
                        checked={staticFields.length}
                        onCheckedChange={() => toggleStaticField('length')}
                        className="scale-75"
                      />
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={staticValues.length ?? ""}
                      onChange={(e) => updateStaticValue('length', e.target.value ? parseFloat(e.target.value) : undefined)}
                      disabled={!staticFields.length}
                      className="h-8 text-xs"
                      placeholder="6.0"
                    />
                  </div>

                  {/* Setback */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Setback (ft)</Label>
                      <Switch
                        checked={staticFields.stopbarSetbackDist}
                        onCheckedChange={() => toggleStaticField('stopbarSetbackDist')}
                        className="scale-75"
                      />
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      value={staticValues.stopbarSetbackDist ?? ""}
                      onChange={(e) => updateStaticValue('stopbarSetbackDist', e.target.value ? parseFloat(e.target.value) : undefined)}
                      disabled={!staticFields.stopbarSetbackDist}
                      className="h-8 text-xs"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Add Section */}
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                <div className="flex items-center gap-2 mb-3">
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700">Quick Add Detectors</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-blue-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Quickly add multiple detectors for a phase. Channel and lane numbers will auto-increment.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Phase</Label>
                    <Select
                      value={selectedPhaseForQuickAdd?.toString() ?? ""}
                      onValueChange={(v) => setSelectedPhaseForQuickAdd(parseInt(v))}
                    >
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {signalPhases.map(phase => {
                          const direction = getPhaseDirection(phase.phase);
                          return (
                            <SelectItem key={phase.phase} value={phase.phase.toString()}>
                              Phase {phase.phase} {direction && `(${direction})`}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Start Channel</Label>
                    <Input
                      value={startingChannel}
                      onChange={(e) => setStartingChannel(e.target.value)}
                      className="h-8 w-20 text-xs"
                      placeholder="1"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Start Lane</Label>
                    <Input
                      value={startingLane}
                      onChange={(e) => setStartingLane(e.target.value)}
                      className="h-8 w-20 text-xs"
                      placeholder="1"
                    />
                  </div>

                  <Button
                    onClick={handleQuickAdd}
                    size="sm"
                    className="h-8 bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Detectors
                  </Button>

                  <div className="space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={quickAddCount}
                      onChange={(e) => setQuickAddCount(parseInt(e.target.value) || 1)}
                      className="h-8 w-16 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Detectors Table */}
              <div className="border border-grey-200 rounded-lg overflow-hidden">
                <div className="p-2 bg-grey-50 border-b border-grey-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-grey-700">Detectors</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 text-amber-600 cursor-help">
                            <AlertTriangle className="w-3 h-3" />
                            <span className="text-xs">No commas in description</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Descriptions cannot contain commas because they are used as delimiters in the export format. Any commas will be automatically removed.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddDetector()}
                    className="h-7 text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Row
                  </Button>
                </div>

                {pendingDetectors.length === 0 ? (
                  <div className="p-8 text-center text-grey-500 text-sm">
                    Use Quick Add above or click "Add Row" to start adding detectors
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-grey-50">
                          <TableHead className="w-20 text-xs py-2">Channel</TableHead>
                          <TableHead className="w-24 text-xs py-2">Phase</TableHead>
                          <TableHead className="w-16 text-xs py-2">Lane</TableHead>
                          {!staticFields.purpose && (
                            <TableHead className="text-xs py-2">Purpose</TableHead>
                          )}
                          {!staticFields.technologyType && (
                            <TableHead className="text-xs py-2">Technology</TableHead>
                          )}
                          {!staticFields.vehicleType && (
                            <TableHead className="text-xs py-2">Vehicle</TableHead>
                          )}
                          {!staticFields.length && (
                            <TableHead className="w-20 text-xs py-2">Length</TableHead>
                          )}
                          {!staticFields.stopbarSetbackDist && (
                            <TableHead className="w-20 text-xs py-2">Setback</TableHead>
                          )}
                          <TableHead className="text-xs py-2">Description</TableHead>
                          <TableHead className="w-20 text-xs py-2"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingDetectors.map((detector, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="py-1.5">
                              <Input
                                value={detector.channel}
                                onChange={(e) => handleDetectorChange(idx, 'channel', e.target.value)}
                                className="h-7 text-xs"
                              />
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Select
                                value={detector.phase.toString()}
                                onValueChange={(v) => handleDetectorChange(idx, 'phase', parseInt(v))}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {signalPhases.map(phase => {
                                    const direction = getPhaseDirection(phase.phase);
                                    return (
                                      <SelectItem key={phase.phase} value={phase.phase.toString()}>
                                        {phase.phase} {direction && `(${direction})`}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                value={detector.lane}
                                onChange={(e) => handleDetectorChange(idx, 'lane', e.target.value)}
                                className="h-7 w-14 text-xs"
                              />
                            </TableCell>
                            {!staticFields.purpose && (
                              <TableCell className="py-1.5">
                                <Select
                                  value={detector.purpose}
                                  onValueChange={(v) => handleDetectorChange(idx, 'purpose', v)}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {purposeOptions.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            )}
                            {!staticFields.technologyType && (
                              <TableCell className="py-1.5">
                                <Select
                                  value={detector.technologyType}
                                  onValueChange={(v) => handleDetectorChange(idx, 'technologyType', v)}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {technologyOptions.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            )}
                            {!staticFields.vehicleType && (
                              <TableCell className="py-1.5">
                                <Select
                                  value={detector.vehicleType}
                                  onValueChange={(v) => handleDetectorChange(idx, 'vehicleType', v)}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {vehicleTypeOptions.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            )}
                            {!staticFields.length && (
                              <TableCell className="py-1.5">
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={detector.length ?? ""}
                                  onChange={(e) => handleDetectorChange(idx, 'length', e.target.value ? parseFloat(e.target.value) : undefined)}
                                  className="h-7 w-16 text-xs"
                                />
                              </TableCell>
                            )}
                            {!staticFields.stopbarSetbackDist && (
                              <TableCell className="py-1.5">
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={detector.stopbarSetbackDist ?? ""}
                                  onChange={(e) => handleDetectorChange(idx, 'stopbarSetbackDist', e.target.value ? parseFloat(e.target.value) : undefined)}
                                  className="h-7 w-16 text-xs"
                                />
                              </TableCell>
                            )}
                            <TableCell className="py-1.5 max-w-[140px]">
                              <div className="flex items-center gap-1">
                                <Input
                                  value={detector.description}
                                  onChange={(e) => handleDetectorChange(idx, 'description', e.target.value)}
                                  className="h-7 text-xs w-28"
                                  placeholder="Auto-generated"
                                />
                                {detector.isDescriptionManual && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="text-[10px] px-1 h-5">
                                          Manual
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Description was manually edited</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDuplicateDetector(idx)}
                                  className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700"
                                  title="Duplicate with incremented channel/lane"
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteDetector(idx)}
                                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Available Phases Reference */}
              <div className="border border-grey-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-grey-700">Available Phases</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-grey-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Click a phase to add a detector. Channel and lane numbers will auto-increment for the selected phase.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex flex-wrap gap-2">
                  {signalPhases.map(phase => {
                    const direction = getPhaseDirection(phase.phase);
                    const detectorsForPhase = pendingDetectors.filter(d => d.phase === phase.phase).length;
                    return (
                      <Badge
                        key={phase.phase}
                        variant="outline"
                        className="cursor-pointer hover:bg-grey-100"
                        onClick={() => handleAddDetector(phase.phase)}
                      >
                        Phase {phase.phase} - {phase.movementType} {direction && `(${direction})`}
                        {detectorsForPhase > 0 && (
                          <span className="ml-1 bg-blue-100 text-blue-700 px-1 rounded">
                            {detectorsForPhase}
                          </span>
                        )}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {/* Existing Detectors Table */}
              {existingDetectors.length > 0 && (
                <div className="border border-green-200 rounded-lg overflow-hidden">
                  <div className="p-2 bg-green-50 border-b border-green-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-green-700">Existing Detectors ({existingDetectors.length})</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-green-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>These detectors are already saved for this signal. You can edit or delete them here.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-green-50">
                          <TableHead className="w-20 text-xs py-2">Channel</TableHead>
                          <TableHead className="w-24 text-xs py-2">Phase</TableHead>
                          <TableHead className="w-16 text-xs py-2">Lane</TableHead>
                          <TableHead className="text-xs py-2">Purpose</TableHead>
                          <TableHead className="text-xs py-2">Technology</TableHead>
                          <TableHead className="w-20 text-xs py-2">Setback</TableHead>
                          <TableHead className="text-xs py-2 max-w-[120px]">Description</TableHead>
                          <TableHead className="w-12 text-xs py-2"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {existingDetectors.map((detector, idx) => (
                          <TableRow key={detector.id || idx} className="bg-green-50/30">
                            <TableCell className="py-1.5">
                              <Input
                                value={detector.channel}
                                onChange={(e) => handleExistingDetectorChange(idx, 'channel', e.target.value)}
                                className="h-7 text-xs"
                              />
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Select
                                value={detector.phase.toString()}
                                onValueChange={(v) => handleExistingDetectorChange(idx, 'phase', parseInt(v))}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {signalPhases.map(phase => {
                                    const direction = getPhaseDirection(phase.phase);
                                    return (
                                      <SelectItem key={phase.phase} value={phase.phase.toString()}>
                                        {phase.phase} {direction && `(${direction})`}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                value={detector.lane}
                                onChange={(e) => handleExistingDetectorChange(idx, 'lane', e.target.value)}
                                className="h-7 w-14 text-xs"
                              />
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Select
                                value={detector.purpose}
                                onValueChange={(v) => handleExistingDetectorChange(idx, 'purpose', v)}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {purposeOptions.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Select
                                value={detector.technologyType}
                                onValueChange={(v) => handleExistingDetectorChange(idx, 'technologyType', v)}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {technologyOptions.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                value={detector.stopbarSetbackDist ?? ""}
                                onChange={(e) => handleExistingDetectorChange(idx, 'stopbarSetbackDist', e.target.value ? parseFloat(e.target.value) : undefined)}
                                className="h-7 w-16 text-xs"
                                placeholder="0"
                              />
                            </TableCell>
                            <TableCell className="py-1.5 max-w-[120px]">
                              <Input
                                value={detector.description}
                                onChange={(e) => handleExistingDetectorChange(idx, 'description', e.target.value)}
                                className="h-7 text-xs w-24"
                              />
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteExistingDetector(idx)}
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-grey-200">
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={
                !selectedSignalId ||
                (pendingDetectors.length === 0 && existingDetectors.length === 0) ||
                isProcessing
              }
              className="bg-primary-600 hover:bg-primary-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {isProcessing
                ? "Saving..."
                : pendingDetectors.length > 0
                  ? `Create ${pendingDetectors.length} Detector${pendingDetectors.length !== 1 ? "s" : ""}`
                  : "Save Changes"
              }
            </Button>
          </div>
        </div>
    </>
  );

  if (inline) {
    return (
      <div className="rounded-lg border border-grey-200 bg-white p-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span>{titleText}</span>
            {titleBadge}
          </h2>
          {signalSelector}
        </div>
        {body}
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="flex items-center gap-2">
              <span>{titleText}</span>
              {titleBadge}
            </DialogTitle>
            {signalSelector}
          </div>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
