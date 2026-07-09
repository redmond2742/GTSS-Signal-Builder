import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSignalSchema, insertPhaseSchema, insertDetectorSchema, type Signal, type Phase, type Detector, type Approach, type BasicTiming, type InsertSignal, type InsertPhase, type InsertDetector } from "@shared/schema";
import { useGTSSStore } from "@/store/gtss-store";
import { useSignals, usePhases, useDetectors, useApproaches, useBasicTimings } from "@/lib/localStorageHooks";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MapContainer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import MapTileLayers from "@/components/ui/map-tile-layers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Edit3, Plus, Trash2, Navigation, ArrowLeft, Settings, HelpCircle, ChevronLeft, ChevronRight, FileText, Lock, Unlock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import PhaseModal from "@/components/gtss/phase-modal";
import DetectorModal from "@/components/gtss/detector-modal";
import BulkPhaseModal from "@/components/gtss/bulk-phase-modal";
import BulkApproachModal from "@/components/gtss/bulk-approach-modal";
import BulkDetectorModal from "@/components/gtss/bulk-detector-modal";
import BasicTimingModal from "@/components/gtss/basic-timing-modal";
import { PhaseDiagram } from "@/components/gtss/phase-diagram-svg";
import TimingBulkImport from "@/components/gtss/timing-bulk-import";
import GTSSFileViewer, { GTSSFilePreview } from "@/components/gtss/gtss-file-viewer";
import { generateAgencyCSV, generateSignalsCSV, generatePhasesCSV, generateDetectionCSV, generateApproachesCSV, generateBasicTimingsCSV } from "@/lib/localStorage";
import { suggestStreetNameForApproach } from "@/lib/utils";
import { StreetNameInput } from "@/components/gtss/street-name-input";

// Location picker component for interactive map editing
function LocationPicker({ onLocationSelect }: { onLocationSelect: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Toggles Leaflet's scroll-wheel zoom on the parent <MapContainer>. When
// `locked`, mouse-wheel events bubble out of the map and scroll the page
// normally. Panning and the +/- buttons stay enabled in both states.
function ScrollZoomToggle({ locked }: { locked: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (locked) map.scrollWheelZoom.disable();
    else map.scrollWheelZoom.enable();
  }, [locked, map]);
  return null;
}

// Inline-edit option lists for the Detection table. Mirrored from
// bulk-detector-modal.tsx so the dropdowns stay consistent across the app.
const DETECTOR_PURPOSE_OPTIONS = [
  "Stop Bar",
  "Advanced Loop",
  "Count Detector",
  "Extension",
  "Dilemma Zone",
];
const DETECTOR_TECHNOLOGY_OPTIONS = [
  "Inductance Loop",
  "Video",
  "Radar",
  "Microwave",
  "Magnetic",
];

// Re-centers the persistent map on the active signal whenever its
// coordinates change. The <MapContainer>'s `center` prop is only an
// initial value, so we have to call `map.setView` imperatively when the
// user clicks the prev/next signal arrows.
function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

// Color palette for approach polylines (mirrors bulk-approach-modal.tsx)
const approachColors = [
  "#3b82f6", "#22c55e", "#ef4444", "#f97316",
  "#8b5cf6", "#ec4899", "#14b8a6", "#eab308",
  "#6366f1", "#84cc16", "#f43f5e", "#06b6d4",
  "#a855f7", "#10b981", "#f59e0b", "#64748b",
];

// Compute endpoint for an approach polyline pointing in the direction
// traffic comes FROM (opposite of bearing). ~200m at equator.
function approachEndpoint(bearing: number, lat: number, lng: number): [number, number] {
  const oppositeBearing = (bearing + 180) % 360;
  const distance = 0.002;
  const rad = (oppositeBearing * Math.PI) / 180;
  const endLat = lat + distance * Math.cos(rad);
  const endLng = lng + (distance * Math.sin(rad)) / Math.cos((lat * Math.PI) / 180);
  return [endLat, endLng];
}

export default function SignalDetails() {
  const { toast } = useToast();
  const { agency, signals, phases, detectors, approaches, basicTimings, currentSignalId, navigateToMain, navigateToSignalDetails } = useGTSSStore();
  const signalId = currentSignalId;
  const isNewSignal = signalId === null;
  const signalHooks = useSignals();
  const phaseHooks = usePhases();
  const detectorHooks = useDetectors();
  const approachHooks = useApproaches();
  const timingHooks = useBasicTimings();

  const [signal, setSignal] = useState<Signal | null>(null);
  const [signalPhases, setSignalPhases] = useState<Phase[]>([]);
  const [signalDetectors, setSignalDetectors] = useState<Detector[]>([]);
  const [signalApproaches, setSignalApproaches] = useState<Approach[]>([]);
  const [signalTimings, setSignalTimings] = useState<BasicTiming[]>([]);
  const [isEditingSignal, setIsEditingSignal] = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [showDetectorModal, setShowDetectorModal] = useState(false);
  const [showBulkPhaseModal, setShowBulkPhaseModal] = useState(false);
  const [showBulkApproachModal, setShowBulkApproachModal] = useState(false);
  const [showBulkDetectorModal, setShowBulkDetectorModal] = useState(false);
  // Detection-tab paste workflow: paste a `Det\tCall Phase` table to bulk-create
  // detectors with just channel + phase, leaving the rest for later edit.
  const [showDetectorPaste, setShowDetectorPaste] = useState(false);
  const [detectorPasteText, setDetectorPasteText] = useState("");
  // Defaults applied to every detector created by the paste flow. The user
  // can change these before pressing "Add Detectors" so they don't have to
  // re-edit every row afterward.
  const [pasteDefaultPurpose, setPasteDefaultPurpose] = useState<string>("Stop Bar");
  const [pasteDefaultTechnology, setPasteDefaultTechnology] = useState<string>("Inductance Loop");
  const [showBasicTimingModal, setShowBasicTimingModal] = useState(false);
  const [showTimingImport, setShowTimingImport] = useState(false);
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [editingDetector, setEditingDetector] = useState<Detector | null>(null);
  const [showGTSSOutput, setShowGTSSOutput] = useState(false);
  const [activeTab, setActiveTab] = useState<"approaches" | "phases" | "detection" | "timings">("approaches");
  // When true, mouse-wheel over the persistent map scrolls the page instead of zooming.
  const [mapZoomLocked, setMapZoomLocked] = useState(true);

  // Quick-add Approach (rapid input below the map on Approaches tab)
  const [qaApproachId, setQaApproachId] = useState("");
  const [qaStreetName, setQaStreetName] = useState("");
  const [qaBearing, setQaBearing] = useState<string>("");
  const [qaSpeed, setQaSpeed] = useState<string>("");
  // FR mode: "0" = none, "1" = FR, "2" = FR-P (with pedestrian crossing)
  const [qaFreeRight, setQaFreeRight] = useState<string>("0");
  const [qaFreeRightLanes, setQaFreeRightLanes] = useState<string>("1");

  // Quick-add Phase (rapid input below the map on Phases tab)
  const [qpPhase, setQpPhase] = useState<string>("");
  const [qpMovementType, setQpMovementType] = useState<string>("Through");
  const [qpApproachId, setQpApproachId] = useState<string>("");
  const [qpLanes, setQpLanes] = useState<string>("1");

  // Auto-fill the next Approach ID and the next Phase # when prerequisites change
  useEffect(() => {
    if (!signalId) return;
    if (!qaApproachId) {
      setQaApproachId(`${signalId}-${signalApproaches.length + 1}`);
    }
  }, [signalId, signalApproaches.length, qaApproachId]);
  useEffect(() => {
    if (!qpPhase) {
      const taken = new Set(signalPhases.map(p => p.phase));
      for (let i = 1; i <= 8; i++) {
        if (!taken.has(i)) { setQpPhase(String(i)); break; }
      }
    }
  }, [signalPhases, qpPhase]);

  // All previously-saved street names across every signal, for the quick-add
  // autocomplete so users can reuse names they've already entered.
  const allStreetNames = useMemo(
    () =>
      Array.from(
        new Set(approaches.map(a => (a.streetName || "").trim()).filter(Boolean))
      ).sort(),
    [approaches],
  );

  const signalForm = useForm<InsertSignal>({
    resolver: zodResolver(insertSignalSchema),
    defaultValues: {
      signalId: "",
      streetName1: "",
      streetName2: "",
      latitude: 0,
      longitude: 0,
      agencyId: agency?.agencyId || "",
    },
  });

  const phaseForm = useForm<InsertPhase>({
    resolver: zodResolver(insertPhaseSchema),
    defaultValues: {
      signalId: signalId && signalId !== 'new' ? signalId : "",
      phase: 1,
      movementType: "Through",
      isPedestrian: 1,
      numOfLanes: 1,
      isOverlap: false,
    },
  });

  const phaseMovementType = phaseForm.watch("movementType");
  const pedestrianDirty = phaseForm.formState.dirtyFields.isPedestrian;

  const gtssOutputFiles = useMemo(() => {
    if (!signal) {
      return [];
    }

    return [
      { id: "agency", label: "agency.txt", content: generateAgencyCSV(agency) },
      { id: "signals", label: "signals.txt", content: generateSignalsCSV([signal]) },
      { id: "approaches", label: "approaches.txt", content: generateApproachesCSV(signalApproaches) },
      { id: "phases", label: "phases.txt", content: generatePhasesCSV(signalPhases) },
      { id: "detectors", label: "detectors.txt", content: generateDetectionCSV(signalDetectors) },
      { id: "basic_timings", label: "basic_timings.txt", content: generateBasicTimingsCSV(signalTimings) },
    ] as GTSSFilePreview[];
  }, [agency, signal, signalApproaches, signalPhases, signalDetectors, signalTimings]);

  // Derive street names from approaches
  const derivedStreetNames = useMemo(() => {
    if (signalApproaches.length === 0) {
      return null;
    }
    const uniqueStreets = Array.from(
      new Set(signalApproaches.map(a => a.streetName).filter(name => name && name.trim()))
    );
    if (uniqueStreets.length === 0) {
      return null;
    }
    return uniqueStreets.join(" & ");
  }, [signalApproaches]);

  // Get individual derived street names for display
  const derivedStreetName1 = useMemo(() => {
    const uniqueStreets = Array.from(
      new Set(signalApproaches.map(a => a.streetName).filter(name => name && name.trim()))
    );
    return uniqueStreets[0] || null;
  }, [signalApproaches]);

  const derivedStreetName2 = useMemo(() => {
    const uniqueStreets = Array.from(
      new Set(signalApproaches.map(a => a.streetName).filter(name => name && name.trim()))
    );
    return uniqueStreets[1] || null;
  }, [signalApproaches]);


  useEffect(() => {
    if (isNewSignal) {
      // Initialize for new signal creation
      setSignal(null);
      setSignalPhases([]);
      setSignalDetectors([]);
      setSignalApproaches([]);
      setSignalTimings([]);
      setIsEditingSignal(true); // Start in editing mode for new signal
      signalForm.reset({
        signalId: "",
        streetName1: "",
        streetName2: "",
        latitude: agency?.latitude || 39.8283,
        longitude: agency?.longitude || -98.5795,
        agencyId: agency?.agencyId || "",
      });
    } else if (signalId) {
      const foundSignal = signals.find(s => s.signalId === signalId);
      if (foundSignal) {
        setSignal(foundSignal);
        signalForm.reset({
          signalId: foundSignal.signalId,
          streetName1: foundSignal.streetName1,
          streetName2: foundSignal.streetName2,
          latitude: foundSignal.latitude,
          longitude: foundSignal.longitude,
          agencyId: foundSignal.agencyId,
        });
      }

      const filteredPhases = phases.filter(p => p.signalId === signalId);
      setSignalPhases(filteredPhases);

      const filteredDetectors = detectors.filter(d => d.signalId === signalId);
      // One-time migration: legacy detectors created before we stripped the
      // "Det " prefix have channels like "Det 1". Normalize them so the table
      // and GTSS output show just the number/identifier.
      const normalizedDetectors = filteredDetectors.map(d => {
        const stripped = d.channel.replace(/^det\s+/i, "");
        if (stripped !== d.channel) {
          try { detectorHooks.update(d.id, { channel: stripped }); } catch {}
          return { ...d, channel: stripped };
        }
        return d;
      });
      setSignalDetectors(normalizedDetectors);

      const filteredApproaches = approaches.filter(a => a.signalId === signalId);
      setSignalApproaches(filteredApproaches);

      const filteredTimings = basicTimings.filter(t => t.signalId === signalId);
      setSignalTimings(filteredTimings);
    }
  }, [signalId, isNewSignal, signals, phases, detectors, approaches, basicTimings, agency]);

  const handleSignalSave = (data: InsertSignal) => {
    try {
      if (isNewSignal) {
        // Generate a unique signal ID if not provided
        if (!data.signalId) {
          data.signalId = `SIG-${Date.now()}`;
        }
        
        const newSignal = signalHooks.save(data);
        setSignal(newSignal);
        setIsEditingSignal(false);
        
        // Update the navigation state to show the created signal
        navigateToSignalDetails(newSignal.signalId);
        
        toast({
          title: "Success",
          description: "Signal created successfully",
        });
      } else if (signal) {
        const updatedSignal = signalHooks.update(signal.signalId, data);
        
        if (updatedSignal) {
          setSignal(updatedSignal);
          // Force a refresh of the form with updated data
          signalForm.reset({
            signalId: updatedSignal.signalId,
            streetName1: updatedSignal.streetName1,
            streetName2: updatedSignal.streetName2,
            latitude: updatedSignal.latitude,
            longitude: updatedSignal.longitude,
            agencyId: updatedSignal.agencyId,
          });

          if (updatedSignal.signalId !== signal.signalId) {
            navigateToSignalDetails(updatedSignal.signalId);
          }
          
          setIsEditingSignal(false);
          toast({
            title: "Success",
            description: "Signal updated successfully",
          });
        } else {
          throw new Error("Failed to update signal - no result returned");
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: isNewSignal ? "Failed to create signal" : "Failed to update signal",
        variant: "destructive",
      });
    }
  };

  // Apply a new quick-add bearing and try to auto-suggest a street name
  // from nearby signals' approaches when the field is still empty.
  const applyQuickAddBearing = (rawBearing: number) => {
    const normalized = ((Math.round(rawBearing) % 360) + 360) % 360;
    setQaBearing(String(normalized));
    if (!qaStreetName.trim() && signal?.latitude != null && signal?.longitude != null) {
      const suggestion = suggestStreetNameForApproach({
        bearing: normalized,
        signalLat: signal.latitude,
        signalLng: signal.longitude,
        currentSignalId: signal.signalId,
        signals,
        approaches,
      });
      if (suggestion) setQaStreetName(suggestion);
    }
  };

  // Quick-Add: capture bearing from a click on the persistent map.
  // Bearing is from the clicked point TOWARD the signal (so it represents
  // the direction of travel of the approach entering the intersection).
  const handleMapBearingClick = (clickLat: number, clickLng: number) => {
    if (!signal?.latitude || !signal?.longitude) return;
    const dLng = (signal.longitude - clickLng) * Math.PI / 180;
    const lat1 = clickLat * Math.PI / 180;
    const lat2 = signal.latitude * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;
    applyQuickAddBearing(bearing);
  };

  const handleQuickAddApproach = () => {
    if (isNewSignal || !signalId) {
      toast({ title: "Save Signal First", description: "Save the signal before adding approaches.", variant: "destructive" });
      return;
    }
    if (!qaApproachId.trim() || !qaStreetName.trim() || qaBearing === "") {
      toast({ title: "Missing Fields", description: "Approach ID, street name, and bearing are required.", variant: "destructive" });
      return;
    }
    try {
      approachHooks.save({
        signalId,
        approachId: qaApproachId.trim(),
        streetName: qaStreetName.trim(),
        compassBearing: parseInt(qaBearing, 10) || 0,
        postedSpeed: qaSpeed ? parseInt(qaSpeed, 10) : null,
        freeRight: parseInt(qaFreeRight, 10) || 0,
        freeRightLanes: parseInt(qaFreeRightLanes, 10) || 1,
      });
      const updated = approaches.filter(a => a.signalId === signalId);
      setSignalApproaches(updated);
      // Reset form (auto-fill next ID via effect)
      setQaApproachId("");
      setQaStreetName("");
      setQaBearing("");
      setQaSpeed("");
      setQaFreeRight("0");
      setQaFreeRightLanes("1");
      toast({ title: "Approach added", description: qaApproachId });
    } catch {
      toast({ title: "Error", description: "Failed to add approach.", variant: "destructive" });
    }
  };

  const handleQuickAddPhase = () => {
    if (isNewSignal || !signalId) {
      toast({ title: "Save Signal First", description: "Save the signal before adding phases.", variant: "destructive" });
      return;
    }
    const phaseNum = parseInt(qpPhase, 10);
    if (!phaseNum || phaseNum < 1 || phaseNum > 8) {
      toast({ title: "Invalid Phase", description: "Phase must be 1-8.", variant: "destructive" });
      return;
    }
    // Same phase number is allowed on different approaches (e.g. a pedestrian
    // phase serving multiple crossings). Only block an identical phase+approach pair.
    if (signalPhases.some(p => p.phase === phaseNum && (p.approachId || "") === (qpApproachId || ""))) {
      toast({
        title: "Phase Exists",
        description: `Phase ${phaseNum} is already assigned to ${qpApproachId || "no approach"}. Pick a different approach.`,
        variant: "destructive",
      });
      return;
    }
    try {
      phaseHooks.save({
        signalId,
        phase: phaseNum,
        movementType: qpMovementType,
        approachId: qpApproachId || null,
        isPedestrian:
          qpMovementType === "Through" ||
          qpMovementType === "Through-Right" ||
          qpMovementType === "Pedestrian"
            ? 1
            : 0,
        numOfLanes: parseInt(qpLanes, 10) || 1,
        isOverlap: false,
      });
      const updated = phases.filter(p => p.signalId === signalId);
      setSignalPhases(updated);
      setQpPhase("");
      setQpMovementType("Through");
      setQpApproachId("");
      setQpLanes("1");
      toast({ title: "Phase added", description: `Phase ${phaseNum}` });
    } catch {
      toast({ title: "Error", description: "Failed to add phase.", variant: "destructive" });
    }
  };

  const handlePhaseAdd = () => {
    if (isNewSignal) {
      toast({
        title: "Save Signal First",
        description: "Please save the signal information before adding phases",
        variant: "destructive",
      });
      return;
    }
    
    setEditingPhase(null);
    phaseForm.reset({
      signalId: signalId || "",
      phase: signalPhases.length + 1,
      movementType: "Through",
      isPedestrian: 1,
      numOfLanes: 1,
      isOverlap: false,
    });
    setShowPhaseModal(true);
  };

  const handlePhaseEdit = (phase: Phase) => {
    setEditingPhase(phase);
    phaseForm.reset({
      signalId: phase.signalId,
      phase: phase.phase,
      movementType: phase.movementType,
      isPedestrian:
        typeof phase.isPedestrian === "number"
          ? phase.isPedestrian
          : (phase.isPedestrian ? 1 : phase.movementType === "Through" ? 1 : 0),
      numOfLanes: phase.numOfLanes,
      isOverlap: phase.isOverlap,
      approachId: phase.approachId,
    });
    setShowPhaseModal(true);
  };

  useEffect(() => {
    if (editingPhase || pedestrianDirty) return;
    // Auto-set the Pedestrian Crossing mode from the movement type:
    //   • Pedestrian → 6 (both diagonals "X" — full scramble look)
    //   • Through / Through-Right → 1 (assigned approach)
    //   • Permissive Phase → preserve current value (don't reset)
    //   • Anything else (left/right/etc.) → 0 (none)
    if (phaseMovementType === "Pedestrian") {
      phaseForm.setValue("isPedestrian", 6);
    } else if (
      phaseMovementType === "Through" ||
      phaseMovementType === "Through-Right"
    ) {
      phaseForm.setValue("isPedestrian", 1);
    } else if (phaseMovementType === "Permissive Phase") {
      // intentionally preserve
    } else {
      phaseForm.setValue("isPedestrian", 0);
    }
  }, [editingPhase, pedestrianDirty, phaseMovementType, phaseForm]);

  const handlePhaseSave = (data: InsertPhase) => {
    try {
      // The same phase number may be assigned to multiple approaches (e.g. a
      // pedestrian phase covering several crossings). Only block an identical
      // phase+approach pair, excluding the row being edited.
      const dataApproach = data.approachId || "";
      const conflict = signalPhases.find(
        p =>
          p.phase === data.phase &&
          (p.approachId || "") === dataApproach &&
          (!editingPhase || p.id !== editingPhase.id),
      );
      if (conflict) {
        toast({
          title: "Error",
          description: `Phase ${data.phase} is already assigned to ${dataApproach || "no approach"} for this signal. Pick a different approach.`,
          variant: "destructive",
        });
        return;
      }

      if (editingPhase) {
        phaseHooks.update(editingPhase.id, data);
      } else {
        phaseHooks.save(data);
      }
      
      const updatedPhases = phases.filter(p => p.signalId === signalId);
      setSignalPhases(updatedPhases);
      setShowPhaseModal(false);
      
      toast({
        title: "Success",
        description: editingPhase ? "Phase updated successfully" : "Phase added successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save phase",
        variant: "destructive",
      });
    }
  };

  const handlePhaseDelete = (phase: Phase) => {
    if (confirm(`Delete Phase ${phase.phase}?`)) {
      try {
        phaseHooks.delete(phase.id);
        const updatedPhases = phases.filter(p => p.signalId === signalId);
        setSignalPhases(updatedPhases);
        toast({
          title: "Success",
          description: "Phase deleted successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete phase",
          variant: "destructive",
        });
      }
    }
  };

  const handleDetectorAdd = () => {
    if (isNewSignal) {
      toast({
        title: "Save Signal First",
        description: "Please save the signal information before adding detectors",
        variant: "destructive",
      });
      return;
    }
    
    setEditingDetector(null);
    setShowDetectorModal(true);
  };

  const handleDetectorEdit = (detector: Detector) => {
    setEditingDetector(detector);
    setShowDetectorModal(true);
  };

  const handleDetectorModalClose = () => {
    setShowDetectorModal(false);
    setEditingDetector(null);
    // Refresh detectors list after modal closes
    const updatedDetectors = detectors.filter(d => d.signalId === signalId);
    setSignalDetectors(updatedDetectors);
  };

  // Inline-edit a single field on a detector row (used by the Purpose and
  // Technology dropdowns in the Detection table).
  const handleDetectorFieldChange = (
    detectorId: string,
    field: "technologyType" | "purpose",
    value: string,
  ) => {
    try {
      detectorHooks.update(detectorId, { [field]: value });
      const updated = detectors.filter(d => d.signalId === signalId);
      setSignalDetectors(updated);
    } catch {
      toast({ title: "Error", description: "Failed to update detector", variant: "destructive" });
    }
  };

  const handleDetectorDelete = (detector: Detector) => {
    if (confirm(`Delete Detector ${detector.channel}?`)) {
      try {
        detectorHooks.delete(detector.id);
        const updatedDetectors = detectors.filter(d => d.signalId === signalId);
        setSignalDetectors(updatedDetectors);
        toast({
          title: "Success",
          description: "Detector deleted successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete detector",
          variant: "destructive",
        });
      }
    }
  };

  // Parse a pasted "Det <name>\t<phase>" table. Skips the header row and
  // any blank lines. Returns one entry per non-empty row, with phase taken
  // as a number (0 means "unassigned" and will not be saved as a detector).
  type PastedDetectorRow = { channel: string; phase: number; willSave: boolean };
  const parseDetectorPaste = (text: string): PastedDetectorRow[] => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows: PastedDetectorRow[] = [];
    for (const line of lines) {
      // Skip header row(s) that contain "Call Phase" or just "Phase".
      if (/^det\s*$/i.test(line) || /call\s*phase/i.test(line)) continue;
      // Split on tab, comma, or 2+ spaces.
      const parts = line.split(/\t|,|\s{2,}/).map(p => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      // Strip the "Det " prefix so the channel stores just the number/identifier
      // (e.g. "Det 1" → "1"). Case-insensitive, also handles "DET" or "Det\t".
      const channel = parts[0].replace(/^det\s+/i, "");
      const phaseRaw = parts[parts.length - 1];
      const phase = parseInt(phaseRaw, 10);
      if (isNaN(phase) || phase < 0 || phase > 99) continue;
      rows.push({ channel, phase, willSave: phase >= 1 });
    }
    return rows;
  };

  const handleDetectorPasteSave = () => {
    if (isNewSignal || !signalId) return;
    const rows = parseDetectorPaste(detectorPasteText);
    const phasesByNumber = new Set(signalPhases.map(p => p.phase));
    const toSave = rows.filter(r => r.willSave);
    if (toSave.length === 0) {
      toast({
        title: "Nothing to add",
        description: "Paste rows in the format `Det 1<tab>1`. Rows with phase 0 are skipped.",
        variant: "destructive",
      });
      return;
    }
    let created = 0;
    let skippedMissingPhase = 0;
    for (const r of toSave) {
      // Only create if the signal actually has that phase configured.
      if (!phasesByNumber.has(r.phase)) {
        skippedMissingPhase++;
        continue;
      }
      detectorHooks.save({
        signalId,
        channel: r.channel,
        phase: r.phase,
        // Apply the user-selected defaults from the paste panel. They can
        // still tweak per-row in the Detection table afterward.
        purpose: pasteDefaultPurpose,
        technologyType: pasteDefaultTechnology,
        description: null,
        vehicleType: null,
        lane: null,
        length: null,
        stopbarSetbackDist: null,
      });
      created++;
    }
    const updated = detectors.filter(d => d.signalId === signalId);
    setSignalDetectors(updated);
    const messageParts = [`Added ${created} detector${created !== 1 ? "s" : ""}`];
    if (skippedMissingPhase > 0) {
      messageParts.push(`(skipped ${skippedMissingPhase} row${skippedMissingPhase !== 1 ? "s" : ""} whose phase is not configured)`);
    }
    toast({ title: "Detectors created", description: messageParts.join(" ") });
    setDetectorPasteText("");
    setShowDetectorPaste(false);
  };

  const handleSignalDelete = () => {
    if (!signal) return;
    
    const confirmText = `DELETE`;
    const userInput = prompt(
      `This will permanently delete signal "${signal.signalId}" and all its phases and detectors.\n\nType "${confirmText}" to confirm deletion:`
    );
    
    if (userInput === confirmText) {
      try {
        // Delete the signal (this will also delete associated phases and detectors via signalStorage.delete)
        signalHooks.delete(signal.signalId);
        
        toast({
          title: "Success",
          description: "Signal and all associated data deleted successfully",
        });
        
        // Navigate back to main page
        navigateToMain();
      } catch (error) {
        console.error("Delete error:", error);
        toast({
          title: "Error",
          description: "Failed to delete signal",
          variant: "destructive",
        });
      }
    }
  };

  if (!signal && !isNewSignal) {
    return (
      <div className="max-w-4xl">
        <div className="flex items-center space-x-2 mb-4">
          <Button
            variant="outline"
            onClick={() => navigateToMain()}
            className="h-7 px-2 text-xs"
          >
            <ArrowLeft className="w-3 h-3 mr-1" />
            Back to Signals
          </Button>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-grey-500">Signal not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-3 sm:space-y-4 p-3 sm:p-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <Button
            variant="outline"
            onClick={() => navigateToMain()}
            className="h-7 px-2 text-xs"
          >
            <ArrowLeft className="w-3 h-3 sm:mr-1" />
            <span className="hidden sm:inline">Back to Signals</span>
          </Button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-grey-800">
              {isNewSignal ? "New Signal" : "Signal Details"}
            </h1>
            <p className="text-xs text-grey-500 hidden sm:block">
              {isNewSignal
                ? "Configure new traffic signal information"
                : derivedStreetNames || "Add street names in Approaches"
              }
            </p>
          </div>
        </div>
        {!isNewSignal && signal && (
          <div className="flex items-center space-x-2">
            {/* Navigation arrows */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const currentIndex = signals.findIndex(s => s.signalId === signal.signalId);
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : signals.length - 1;
                const prevSignal = signals[prevIndex];
                if (prevSignal) {
                  navigateToSignalDetails(prevSignal.signalId);
                }
              }}
              disabled={signals.length <= 1}
              className="h-6 w-6 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            {/* Signal pill with ID and street names */}
            <Badge variant="outline" className="text-xs px-3 py-1">
              {signal.signalId} • {derivedStreetNames || "No street names"}
            </Badge>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const currentIndex = signals.findIndex(s => s.signalId === signal.signalId);
                const nextIndex = currentIndex < signals.length - 1 ? currentIndex + 1 : 0;
                const nextSignal = signals[nextIndex];
                if (nextSignal) {
                  navigateToSignalDetails(nextSignal.signalId);
                }
              }}
              disabled={signals.length <= 1}
              className="h-6 w-6 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Top section: signal info (left) + persistent map (middle) + phase diagram (right) */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)_320px] gap-3">
        {/* Left: signal info + counts */}
        <Card>
          <CardHeader className="bg-grey-50 border-b border-grey-200 px-3 py-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-grey-800 flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-primary-600" />
                <span>Signal Info</span>
              </CardTitle>
              {signal && !isNewSignal && (
                <Button
                  variant="outline"
                  onClick={() => setIsEditingSignal(v => !v)}
                  className="h-6 px-2 text-xs"
                >
                  {isEditingSignal ? (
                    <>Cancel</>
                  ) : (
                    <><Edit3 className="w-3 h-3 mr-1" />Edit</>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            {signal && isEditingSignal && !isNewSignal ? (
              // Inline edit form — replaces the popup Dialog for existing signals
              <Form {...signalForm}>
                <form
                  onSubmit={signalForm.handleSubmit(handleSignalSave)}
                  className="space-y-2"
                >
                  <FormField
                    control={signalForm.control}
                    name="signalId"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] uppercase tracking-wide font-medium text-grey-500">Signal ID</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-7 text-sm font-mono" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signalForm.control}
                    name="agencyId"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[10px] uppercase tracking-wide font-medium text-grey-500">Agency ID</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-7 text-sm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide font-medium text-grey-500">Coordinates</p>
                    <div className="flex gap-1">
                      <FormField
                        control={signalForm.control}
                        name="latitude"
                        render={({ field }) => (
                          <FormItem className="space-y-0 flex-1">
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                step="any"
                                placeholder="Lat"
                                className="h-7 text-xs font-mono"
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signalForm.control}
                        name="longitude"
                        render={({ field }) => (
                          <FormItem className="space-y-0 flex-1">
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                step="any"
                                placeholder="Lng"
                                className="h-7 text-xs font-mono"
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-7 w-full text-xs bg-primary-600 hover:bg-primary-700 mt-1"
                  >
                    Save Changes
                  </Button>
                  <div className="border-t border-grey-200 pt-2 space-y-1">
                    <p className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">Counts</p>
                    <div className="flex justify-between text-xs"><span>Approaches</span><span className="font-mono">{signalApproaches.length}</span></div>
                    <div className="flex justify-between text-xs"><span>Phases</span><span className="font-mono">{signalPhases.length}</span></div>
                    <div className="flex justify-between text-xs"><span>Detectors</span><span className="font-mono">{signalDetectors.length}</span></div>
                    <div className="flex justify-between text-xs"><span>Timings</span><span className="font-mono">{signalTimings.length}</span></div>
                  </div>
                </form>
              </Form>
            ) : signal ? (
              <>
                <div>
                  <p className="text-[10px] uppercase tracking-wide font-medium text-grey-500">Signal ID</p>
                  <p className="text-sm font-mono">{signal.signalId}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide font-medium text-grey-500">Streets</p>
                  <p className="text-sm">
                    {derivedStreetNames || (
                      <span className="text-grey-400 italic text-xs">Add street names in Approaches</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide font-medium text-grey-500">Coordinates</p>
                  <p className="text-xs font-mono">
                    {signal.latitude?.toFixed(6)}, {signal.longitude?.toFixed(6)}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] mt-1">
                    <a
                      href={`https://www.google.com/maps?q=${signal.latitude},${signal.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Google Maps
                    </a>
                    <a
                      href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${signal.latitude},${signal.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Street View
                    </a>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide font-medium text-grey-500">Agency</p>
                  <p className="text-xs">{signal.agencyId}</p>
                </div>
                <div className="border-t border-grey-200 pt-2 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">Counts</p>
                  <div className="flex justify-between text-xs"><span>Approaches</span><span className="font-mono">{signalApproaches.length}</span></div>
                  <div className="flex justify-between text-xs"><span>Phases</span><span className="font-mono">{signalPhases.length}</span></div>
                  <div className="flex justify-between text-xs"><span>Detectors</span><span className="font-mono">{signalDetectors.length}</span></div>
                  <div className="flex justify-between text-xs"><span>Timings</span><span className="font-mono">{signalTimings.length}</span></div>
                </div>
              </>
            ) : (
              <p className="text-xs text-grey-500 italic">
                {isNewSignal ? "Fill in the signal info to configure this new signal." : "No signal data available."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Right: persistent map */}
        {signal && signal.latitude && signal.longitude ? (
          <div className="h-[500px] rounded-lg border overflow-hidden relative z-0">
            <MapContainer
              center={[signal.latitude, signal.longitude]}
              zoom={17}
              maxZoom={22}
              scrollWheelZoom={!mapZoomLocked}
              style={{ height: "100%", width: "100%", zIndex: 1 }}
            >
              <MapTileLayers />
              <ScrollZoomToggle locked={mapZoomLocked} />
              <MapRecenter lat={signal.latitude} lng={signal.longitude} />
              <Marker position={[signal.latitude, signal.longitude]} />

              {/* Capture map clicks on Approaches tab → fill the quick-add Bearing field */}
              {activeTab === "approaches" && (
                <LocationPicker onLocationSelect={handleMapBearingClick} />
              )}

              {/* Approach polylines — shown on every tab, including Phases.
                  The phase diagram next to the map already conveys phase info,
                  so the map stays as a clean approach reference. */}
              {signalApproaches.map((a, i) => {
                if (a.compassBearing == null || !signal.latitude || !signal.longitude) return null;
                const endpoint = approachEndpoint(a.compassBearing, signal.latitude, signal.longitude);
                return (
                  <Polyline
                    key={`approach-${a.id}`}
                    positions={[[signal.latitude, signal.longitude], endpoint]}
                    color={approachColors[i % approachColors.length]}
                    weight={4}
                    opacity={0.8}
                  />
                );
              })}
            </MapContainer>
            {/* Scroll-wheel zoom lock toggle */}
            <button
              type="button"
              onClick={() => setMapZoomLocked((v) => !v)}
              className="absolute bottom-2 left-2 z-[1000] flex items-center gap-1 rounded-md border border-grey-300 bg-white px-2 py-1 text-xs shadow hover:bg-grey-50"
              title={mapZoomLocked ? "Scroll-zoom locked — click to unlock" : "Scroll-zoom unlocked — click to lock"}
              aria-pressed={mapZoomLocked}
            >
              {mapZoomLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              <span>{mapZoomLocked ? "Zoom locked" : "Zoom"}</span>
            </button>
          </div>
        ) : (
          <div className="h-[500px] flex items-center justify-center bg-grey-50 rounded-lg border text-sm text-grey-400">
            {isNewSignal ? "Click Edit to set this signal's location." : "No coordinates yet."}
          </div>
        )}

        {/* Phase Diagram — always visible regardless of active tab */}
        <Card className="h-[500px]">
          <CardHeader className="bg-grey-50 border-b border-grey-200 px-3 py-2">
            <CardTitle className="text-sm font-semibold text-grey-800 flex items-center space-x-2">
              <Settings className="w-4 h-4 text-primary-600" />
              <span>Phase Diagram</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 h-[calc(100%-2.75rem)]">
            {signalPhases.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-grey-400 text-center px-3">
                {signalApproaches.length === 0
                  ? "Add approaches first, then add phases to see the diagram."
                  : "No phases configured yet. Use the Phases tab to add some."}
              </div>
            ) : (
              <PhaseDiagram
                phases={signalPhases}
                approaches={signalApproaches}
                intersectionId={signal?.signalId}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Approaches | Phases | Detection | Basic Timings */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="approaches">Approaches ({signalApproaches.length})</TabsTrigger>
          <TabsTrigger value="phases">Phases ({signalPhases.length})</TabsTrigger>
          <TabsTrigger value="detection">Detection ({signalDetectors.length})</TabsTrigger>
          <TabsTrigger value="timings">Basic Timings ({signalTimings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="approaches" className="mt-3 space-y-3">
      {/* Quick-Add Approach — rapid input directly below the map */}
      {!isNewSignal && !showBulkApproachModal && (
        <Card>
          <CardContent className="p-3">
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex flex-col min-w-[120px]">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">Approach ID</label>
                <Input value={qaApproachId} onChange={(e) => setQaApproachId(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="flex flex-col flex-1 min-w-[160px]">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">Street Name *</label>
                <StreetNameInput
                  value={qaStreetName}
                  onChange={setQaStreetName}
                  suggestions={allStreetNames}
                  placeholder="e.g. Main St"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col w-24">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">Bearing *</label>
                <Input
                  type="number"
                  min="0"
                  max="360"
                  value={qaBearing}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setQaBearing(raw);
                    // Once the value parses to a real number, also try the
                    // street-name suggestion so manual typing benefits too.
                    const n = parseInt(raw, 10);
                    if (!isNaN(n) && raw.trim() !== "" && !qaStreetName.trim() && signal?.latitude != null && signal?.longitude != null) {
                      const suggestion = suggestStreetNameForApproach({
                        bearing: ((n % 360) + 360) % 360,
                        signalLat: signal.latitude,
                        signalLng: signal.longitude,
                        currentSignalId: signal.signalId,
                        signals,
                        approaches,
                      });
                      if (suggestion) setQaStreetName(suggestion);
                    }
                  }}
                  placeholder="0-360"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col w-20">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">Speed</label>
                <Input type="number" min="0" max="100" value={qaSpeed} onChange={(e) => setQaSpeed(e.target.value)} placeholder="35" className="h-8 text-sm" />
              </div>
              <div className="flex flex-col w-24" title="Free Right — right-turn slip lane bypassing the signal. FR-P adds a pedestrian crossing; FR-P-I is an improved traffic-calmed crossing.">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">FR</label>
                <Select value={qaFreeRight} onValueChange={setQaFreeRight}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">None</SelectItem>
                    <SelectItem value="1">FR</SelectItem>
                    <SelectItem value="2">FR-P</SelectItem>
                    <SelectItem value="3">FR-P-I</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col w-16" title="Number of free-right lanes">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">FR Lanes</label>
                <Input
                  type="number"
                  min="1"
                  max="9"
                  value={qaFreeRightLanes}
                  onChange={(e) => setQaFreeRightLanes(e.target.value)}
                  disabled={qaFreeRight === "0"}
                  className="h-8 text-sm disabled:opacity-50"
                />
              </div>
              <Button onClick={handleQuickAddApproach} className="h-8 px-3 bg-primary-600 hover:bg-primary-700">
                <Plus className="w-3 h-3 mr-1" />Add
              </Button>
            </div>
            <p className="text-[11px] text-grey-500 mt-2">Tip: click the map above to fill <span className="font-medium">Bearing</span> from the click location.</p>
          </CardContent>
        </Card>
      )}

      {showBulkApproachModal ? (
        <BulkApproachModal
          inline
          onClose={() => {
            setShowBulkApproachModal(false);
            const updatedApproaches = approaches.filter(a => a.signalId === signalId);
            setSignalApproaches(updatedApproaches);
          }}
          preSelectedSignalId={signalId || ""}
        />
      ) : (
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-grey-800 flex items-center space-x-2">
              <Navigation className="w-4 h-4 text-primary-600" />
              <span>Approaches ({signalApproaches.length})</span>
            </CardTitle>
            <Button
              onClick={() => {
                if (isNewSignal) {
                  toast({
                    title: "Save Signal First",
                    description: "Please save the signal information before adding approaches",
                    variant: "destructive",
                  });
                  return;
                }
                setShowBulkApproachModal(true);
              }}
              className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700"
            >
              <Plus className="w-3 h-3 mr-1" />
              Bulk Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isNewSignal ? (
            <div className="p-6 text-center text-grey-500 text-sm">
              Save the signal first to add approaches.
            </div>
          ) : signalApproaches.length === 0 ? (
            <div className="p-6 text-center text-grey-500 text-sm">
              <p>No approaches configured.</p>
              <p className="text-xs text-grey-400 mt-1">Define approach directions and street names for this intersection.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-grey-50 border-b border-grey-200">
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Approach ID</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Street Name</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Bearing</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Posted Speed</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }} title="Free Right — right-turn slip lane bypassing the signal">FR</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }} title="Number of free-right lanes">FR Lanes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signalApproaches.map((approach) => (
                    <TableRow key={approach.id} className="hover:bg-grey-50">
                      <TableCell className="py-1 px-1.5 font-medium" style={{ fontSize: '12px' }}>{approach.approachId}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{approach.streetName || '-'}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{approach.compassBearing != null ? `${approach.compassBearing}°` : '-'}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{approach.postedSpeed ? `${approach.postedSpeed} mph` : '-'}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{approach.freeRight === 3 ? 'FR-P-I' : approach.freeRight === 2 ? 'FR-P' : approach.freeRight ? 'FR' : '-'}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{approach.freeRight ? (approach.freeRightLanes ?? 1) : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      )}
        </TabsContent>

        <TabsContent value="phases" className="mt-3 space-y-3">
      {/* Quick-Add Phase — rapid input directly below the map */}
      {!isNewSignal && !showBulkPhaseModal && (
        <Card>
          <CardContent className="p-3">
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex flex-col w-16">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">Phase *</label>
                <Input type="number" min="1" max="8" value={qpPhase} onChange={(e) => setQpPhase(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="flex flex-col flex-1 min-w-[160px]">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">Movement *</label>
                <Select value={qpMovementType} onValueChange={setQpMovementType}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Through">Through (T)</SelectItem>
                    <SelectItem value="Left Turn">Left Turn (L)</SelectItem>
                    <SelectItem value="Left Protected-Permissive">Left Protected-Permissive (LPP)</SelectItem>
                    <SelectItem value="Right Turn">Right Turn (R)</SelectItem>
                    <SelectItem value="Through-Right">Through-Right (TR)</SelectItem>
                    <SelectItem value="Left Through Shared">Left Through Shared (LT)</SelectItem>
                    <SelectItem value="Permissive Phase">Permissive (TL)</SelectItem>
                    <SelectItem value="Flashing Yellow Arrow">Flashing Yellow Arrow</SelectItem>
                    <SelectItem value="U-Turn">U-Turn</SelectItem>
                    <SelectItem value="Pedestrian">Pedestrian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col flex-1 min-w-[160px]">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">Approach</label>
                <Select value={qpApproachId} onValueChange={setQpApproachId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select approach" /></SelectTrigger>
                  <SelectContent>
                    {signalApproaches.map((a) => (
                      <SelectItem key={a.approachId} value={a.approachId}>
                        {a.approachId} — {a.streetName || "(no name)"} {a.compassBearing != null ? `(${a.compassBearing}°)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col w-20">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500 mb-1">Lanes</label>
                <Input type="number" min="1" max="8" value={qpLanes} onChange={(e) => setQpLanes(e.target.value)} className="h-8 text-sm" />
              </div>
              <Button onClick={handleQuickAddPhase} className="h-8 px-3 bg-primary-600 hover:bg-primary-700" disabled={signalApproaches.length === 0}>
                <Plus className="w-3 h-3 mr-1" />Add
              </Button>
            </div>
            {signalApproaches.length === 0 && (
              <p className="text-[11px] text-amber-700 mt-2">Add approaches first — phases need an approach to attach to.</p>
            )}
          </CardContent>
        </Card>
      )}

      {showBulkPhaseModal ? (
        <BulkPhaseModal
          inline
          onClose={() => {
            setShowBulkPhaseModal(false);
            const updatedPhases = phases.filter(p => p.signalId === signalId);
            setSignalPhases(updatedPhases);
          }}
          preSelectedSignalId={signalId || ""}
        />
      ) : (
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-grey-800 flex items-center space-x-2">
              <Settings className="w-4 h-4 text-primary-600" />
              <span>Signal Phases ({signalPhases.length})</span>
            </CardTitle>
            <div className="flex space-x-1">
              <Button
                onClick={() => {
                  if (isNewSignal) {
                    toast({
                      title: "Save Signal First",
                      description: "Please save the signal information before adding phases",
                      variant: "destructive",
                    });
                    return;
                  }
                  setShowBulkPhaseModal(true);
                }}
                className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700"
              >
                <Plus className="w-3 h-3 mr-1" />
                Bulk Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isNewSignal ? (
            <div className="p-6 text-center text-grey-500 text-sm">
              Save the signal first to add phases.
            </div>
          ) : signalPhases.length === 0 ? (
            <div className="p-6 text-center text-grey-500 text-sm">
              <p>No phases configured.</p>
              <p className="text-xs text-grey-400 mt-1">Add approaches first, then define movement phases for each direction. Phases are required before adding detectors or timings.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-grey-50 border-b border-grey-200">
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Phase</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Movement</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Approach</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Lanes</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signalPhases.map((phase) => (
                    <TableRow
                      key={phase.id}
                      className="hover:bg-grey-50 cursor-pointer transition-colors"
                      onClick={() => handlePhaseEdit(phase)}
                    >
                      <TableCell className="py-1 px-1.5 font-medium" style={{ fontSize: '12px' }}>
                        <div className="flex items-center space-x-1">
                          <span>{phase.phase}</span>
                          {phase.isOverlap && (
                            <Badge variant="secondary" style={{ fontSize: '10px' }} className="px-1 py-0">Overlap</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{phase.movementType}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>
                        {phase.approachId || '-'}
                      </TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{phase.numOfLanes}</TableCell>
                      <TableCell className="py-1 px-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePhaseDelete(phase);
                          }}
                          className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      )}
        </TabsContent>

        <TabsContent value="detection" className="mt-3">
      {showBulkDetectorModal ? (
        <BulkDetectorModal
          inline
          onClose={() => {
            setShowBulkDetectorModal(false);
            const updatedDetectors = detectors.filter(d => d.signalId === signalId);
            setSignalDetectors(updatedDetectors);
          }}
          preSelectedSignalId={signalId || ""}
        />
      ) : showDetectorPaste ? (
        <Card>
          <CardHeader className="bg-grey-50 border-b border-grey-200 px-4 py-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-grey-800 flex items-center space-x-2">
                <Navigation className="w-4 h-4 text-primary-600" />
                <span>Paste Detector → Phase Mapping</span>
              </CardTitle>
              <Button
                variant="outline"
                onClick={() => { setShowDetectorPaste(false); setDetectorPasteText(""); }}
                className="h-7 px-2 text-xs"
              >
                Cancel
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="text-xs text-grey-600">
              <p>Paste a two-column table where each row is <span className="font-mono">Det&nbsp;&lt;name&gt;</span> &lt;tab&gt; <span className="font-mono">&lt;phase&nbsp;number&gt;</span>. The header row is skipped, the <span className="font-mono">Det</span> prefix is stripped from the channel, and rows with phase <span className="font-mono">0</span> (or whose phase isn&apos;t configured on this signal) are skipped too. Set the defaults below and apply them to every detector created from this paste.</p>
            </div>

            {/* Defaults that get applied to every detector created here */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-grey-50 border border-grey-200 rounded-md">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500">Default Purpose</label>
                <Select value={pasteDefaultPurpose} onValueChange={setPasteDefaultPurpose}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DETECTOR_PURPOSE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide font-medium text-grey-500">Default Technology</label>
                <Select value={pasteDefaultTechnology} onValueChange={setPasteDefaultTechnology}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DETECTOR_TECHNOLOGY_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <textarea
              value={detectorPasteText}
              onChange={(e) => setDetectorPasteText(e.target.value)}
              placeholder={"Det\tCall Phase\nDet 1\t1\nDet 2\t2\nDet 3\t3"}
              className="w-full h-44 font-mono text-xs p-2 border border-grey-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              spellCheck={false}
              aria-label="Paste detector-to-phase table here"
            />
            {detectorPasteText.trim() && (() => {
              const parsed = parseDetectorPaste(detectorPasteText);
              const phasesByNumber = new Set(signalPhases.map(p => p.phase));
              const willSaveCount = parsed.filter(r => r.willSave && phasesByNumber.has(r.phase)).length;
              const skipPhase0 = parsed.filter(r => !r.willSave).length;
              const skipMissingPhase = parsed.filter(r => r.willSave && !phasesByNumber.has(r.phase)).length;
              return (
                <div className="border border-grey-200 rounded-md">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-grey-50 border-b border-grey-200 text-xs">
                    <span className="font-medium text-grey-700">Preview ({parsed.length} row{parsed.length !== 1 ? "s" : ""})</span>
                    <span className="text-grey-600">
                      <span className="text-primary-700 font-medium">{willSaveCount}</span> will be added
                      {skipPhase0 > 0 && <span className="text-grey-500">, {skipPhase0} skipped (phase 0)</span>}
                      {skipMissingPhase > 0 && <span className="text-amber-700">, {skipMissingPhase} skipped (phase not configured)</span>}
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-grey-50 border-b border-grey-200 sticky top-0">
                          <TableHead className="font-medium py-1 px-2" style={{ fontSize: '11px' }}>Channel</TableHead>
                          <TableHead className="font-medium py-1 px-2" style={{ fontSize: '11px' }}>Phase</TableHead>
                          <TableHead className="font-medium py-1 px-2" style={{ fontSize: '11px' }}>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsed.map((r, idx) => {
                          const phaseConfigured = phasesByNumber.has(r.phase);
                          const willAdd = r.willSave && phaseConfigured;
                          return (
                            <TableRow key={idx} className={willAdd ? "" : "opacity-60"}>
                              <TableCell className="py-1 px-2 font-mono" style={{ fontSize: '11px' }}>{r.channel}</TableCell>
                              <TableCell className="py-1 px-2 font-mono" style={{ fontSize: '11px' }}>{r.phase}</TableCell>
                              <TableCell className="py-1 px-2" style={{ fontSize: '11px' }}>
                                {willAdd ? (
                                  <span className="text-green-700">Will add</span>
                                ) : !r.willSave ? (
                                  <span className="text-grey-500">Skipped — phase 0</span>
                                ) : (
                                  <span className="text-amber-700">Skipped — phase {r.phase} not on this signal</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })()}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => { setShowDetectorPaste(false); setDetectorPasteText(""); }}
                className="h-8 px-3 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDetectorPasteSave}
                disabled={!detectorPasteText.trim()}
                className="h-8 px-3 text-xs bg-primary-600 hover:bg-primary-700"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Detectors
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-grey-800 flex items-center space-x-2">
              <Navigation className="w-4 h-4 text-primary-600" />
              <span>Detection Equipment ({signalDetectors.length})</span>
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => {
                  if (isNewSignal) {
                    toast({
                      title: "Save Signal First",
                      description: "Please save the signal information before adding detectors",
                      variant: "destructive",
                    });
                    return;
                  }
                  setShowBulkDetectorModal(true);
                }}
                className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700"
                disabled={signalPhases.length === 0}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Detectors
              </Button>
              <Button
                onClick={() => {
                  if (isNewSignal) {
                    toast({
                      title: "Save Signal First",
                      description: "Please save the signal information before adding detectors",
                      variant: "destructive",
                    });
                    return;
                  }
                  setShowDetectorPaste(true);
                }}
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={signalPhases.length === 0}
                title="Paste a Detector → Phase table"
              >
                <Plus className="w-3 h-3 mr-1" />
                Bulk Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isNewSignal ? (
            <div className="p-6 text-center text-grey-500 text-sm">
              Save the signal first to add detectors.
            </div>
          ) : signalPhases.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-warning-700 bg-warning-50 border border-warning-200 rounded-md p-3">
                Phases are required before adding detectors. Add phases above first.
              </p>
            </div>
          ) : signalDetectors.length === 0 ? (
            <div className="p-6 text-center text-grey-500 text-sm">
              <p>No detectors configured.</p>
              <p className="text-xs text-grey-400 mt-1">Define detection equipment (loops, video, radar) assigned to each phase.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-grey-50 border-b border-grey-200">
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Channel</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Phase</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Purpose</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Technology</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signalDetectors.map((detector) => (
                    <TableRow
                      key={detector.id}
                      className="hover:bg-grey-50 cursor-pointer transition-colors"
                      onClick={() => handleDetectorEdit(detector)}
                    >
                      <TableCell className="py-1 px-1.5 font-medium" style={{ fontSize: '12px' }}>{detector.channel}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{detector.phase}</TableCell>
                      <TableCell
                        className="py-1 px-1.5"
                        style={{ fontSize: '12px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Select
                          value={detector.purpose || ""}
                          onValueChange={(v) => handleDetectorFieldChange(detector.id, "purpose", v)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {DETECTOR_PURPOSE_OPTIONS.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell
                        className="py-1 px-1.5"
                        style={{ fontSize: '12px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Select
                          value={detector.technologyType || ""}
                          onValueChange={(v) => handleDetectorFieldChange(detector.id, "technologyType", v)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {DETECTOR_TECHNOLOGY_OPTIONS.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="py-1 px-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDetectorDelete(detector);
                          }}
                          className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      )}
        </TabsContent>

        <TabsContent value="timings" className="mt-3 space-y-3">
      {showTimingImport && !isNewSignal && signalPhases.length > 0 && (
        <TimingBulkImport
          signalId={signalId || ""}
          signalPhases={signalPhases}
          existingTimings={signalTimings}
          onClose={() => setShowTimingImport(false)}
          onImported={() => {
            const updated = basicTimings.filter(t => t.signalId === signalId);
            setSignalTimings(updated);
          }}
        />
      )}
      {/* Basic Timings Section */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-grey-800 flex items-center space-x-2">
              <Settings className="w-4 h-4 text-primary-600" />
              <span>Basic Timings ({signalTimings.length})</span>
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                onClick={() => {
                  if (isNewSignal) {
                    toast({ title: "Save Signal First", description: "Please save the signal information before adding timings", variant: "destructive" });
                    return;
                  }
                  if (signalPhases.length === 0) {
                    toast({ title: "Add Phases First", description: "Please add phases before configuring timings", variant: "destructive" });
                    return;
                  }
                  setShowTimingImport((v) => !v);
                }}
                className="h-7 px-2 text-xs"
                disabled={signalPhases.length === 0}
              >
                <Plus className="w-3 h-3 mr-1" />
                Bulk Import
              </Button>
              <Button
                onClick={() => {
                  if (isNewSignal) {
                    toast({
                      title: "Save Signal First",
                      description: "Please save the signal information before adding timings",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (signalPhases.length === 0) {
                    toast({
                      title: "Add Phases First",
                      description: "Please add phases before configuring timings",
                      variant: "destructive",
                    });
                    return;
                  }
                  setShowBasicTimingModal(true);
                }}
                className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700"
                disabled={signalPhases.length === 0}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Timing
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isNewSignal ? (
            <div className="p-6 text-center text-grey-500 text-sm">
              Save the signal first to add timings.
            </div>
          ) : signalPhases.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-warning-700 bg-warning-50 border border-warning-200 rounded-md p-3">
                Phases are required before adding timings. Add phases above first.
              </p>
            </div>
          ) : signalTimings.length === 0 ? (
            <div className="p-6 text-center text-grey-500 text-sm">
              <p>No timing data configured.</p>
              <p className="text-xs text-grey-400 mt-1">Set min/max green, yellow, all-red, walk, and pedestrian clearance for each phase.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-grey-50 border-b border-grey-200">
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Phase</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Min Green</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Max Green</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Yellow</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>All Red</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Walk</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Ped Clr</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Recall</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signalTimings.sort((a, b) => a.phase - b.phase).map((timing) => (
                    <TableRow key={timing.id} className="hover:bg-grey-50">
                      <TableCell className="py-1 px-1.5 font-medium" style={{ fontSize: '12px' }}>{timing.phase}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{timing.minGreen ?? '-'}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{timing.maxGreen ?? '-'}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{timing.yellow ?? '-'}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{timing.allRed ?? '-'}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{timing.pedWalk ?? '-'}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{timing.pedClearance ?? '-'}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>
                        {timing.vehRecallType !== 'None' ? timing.vehRecallType : '-'}
                        {timing.pedRecall ? ' / Ped' : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>

      {/* GTSS Specification Output */}
      <Card>
        <Collapsible open={showGTSSOutput} onOpenChange={setShowGTSSOutput}>
          <CardHeader className="bg-grey-50 border-b border-grey-200 px-4 py-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-grey-800 flex items-center space-x-2">
                <FileText className="w-4 h-4 text-primary-600" />
                <span>GTSS Specification Output</span>
              </CardTitle>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="h-7 px-2 text-xs">
                  {showGTSSOutput ? "Hide Output" : "View Output"}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <CollapsibleContent>
              <GTSSFileViewer
                files={gtssOutputFiles}
                emptyMessage="Save this signal to generate GTSS output."
              />
            </CollapsibleContent>
          </CardContent>
        </Collapsible>
      </Card>

      {/* Phase Modal */}
      <Dialog open={showPhaseModal} onOpenChange={setShowPhaseModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingPhase ? 'Edit Phase' : 'Add Phase'}
            </DialogTitle>
          </DialogHeader>
          <Form {...phaseForm}>
            <form onSubmit={phaseForm.handleSubmit(handlePhaseSave)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={phaseForm.control}
                  name="phase"
                  render={({ field }) => (
                    <FormItem className="space-y-0.5">
                      <div className="flex items-center space-x-1">
                        <FormLabel className="font-medium" style={{ fontSize: '12px' }}>Phase Number</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-grey-400 hover:text-grey-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Unique identifier for this traffic phase (1-8). Each phase represents a different traffic movement direction.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="number" 
                          min="1" 
                          max="8"
                          className="h-6 px-2"
                          style={{ fontSize: '12px' }}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={phaseForm.control}
                  name="movementType"
                  render={({ field }) => (
                    <FormItem className="space-y-0.5">
                      <div className="flex items-center space-x-1">
                        <FormLabel className="font-medium" style={{ fontSize: '12px' }}>Movement Type</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-grey-400 hover:text-grey-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Type of vehicle movement: Through (straight), Left turn, Right turn, or U-Turn.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-6" style={{ fontSize: '12px' }}>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Through">Through (T)</SelectItem>
                          <SelectItem value="Left Turn">Left Turn (L)</SelectItem>
                          <SelectItem value="Left Protected-Permissive">Left Protected-Permissive (LPP)</SelectItem>
                          <SelectItem value="Left Through Shared">Left Through Shared (LT)</SelectItem>
                          <SelectItem value="Permissive Phase">Permissive Phase (TL)</SelectItem>
                          <SelectItem value="Flashing Yellow Arrow">Flashing Yellow Arrow (FYA)</SelectItem>
                          <SelectItem value="U-Turn">U-Turn (U)</SelectItem>
                          <SelectItem value="Right Turn">Right Turn (R)</SelectItem>
                          <SelectItem value="Through-Right">Through-Right (TR)</SelectItem>
                          <SelectItem value="Pedestrian">Pedestrian (PED)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={phaseForm.control}
                  name="approachId"
                  render={({ field }) => (
                    <FormItem className="space-y-0.5 col-span-2">
                      <div className="flex items-center space-x-1">
                        <FormLabel className="font-medium" style={{ fontSize: '12px' }}>Approach</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-grey-400 hover:text-grey-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">The approach (direction of travel) this phase serves. Drives the phase diagram and detector associations.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Select
                        value={field.value || "__none__"}
                        onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger className="h-6" style={{ fontSize: '12px' }}>
                            <SelectValue placeholder="Select approach" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">— Unassigned —</SelectItem>
                          {signalApproaches.map((a) => (
                            <SelectItem key={a.approachId} value={a.approachId}>
                              {a.approachId}
                              {a.streetName ? ` — ${a.streetName}` : ""}
                              {a.compassBearing != null ? ` (${a.compassBearing}°)` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {signalApproaches.length === 0 && (
                        <p className="text-[11px] text-amber-600">No approaches yet — add approaches first.</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={phaseForm.control}
                  name="numOfLanes"
                  render={({ field }) => (
                    <FormItem className="space-y-0.5">
                      <div className="flex items-center space-x-1">
                        <FormLabel className="font-medium" style={{ fontSize: '12px' }}>Number of Lanes</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-grey-400 hover:text-grey-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Total number of traffic lanes for this movement direction (1-8).</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="number" 
                          min="1" 
                          max="8"
                          className="h-6 px-2"
                          style={{ fontSize: '12px' }}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={phaseForm.control}
                  name="isPedestrian"
                  render={({ field }) => (
                    <FormItem className="space-y-0.5">
                      <div className="flex items-center space-x-1">
                        <FormLabel className="font-medium" style={{ fontSize: '12px' }}>Pedestrian Crossing</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-grey-400 hover:text-grey-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              0 = none · 1 = assigned approach ·
                              2 = both (assigned + opposite) · 3 = opposite approach ·
                              4 = diagonal · 5 = other diagonal (90° rotated) ·
                              6 = both diagonals (X) · 7 = all directions (4 crosswalks + X).
                              Applies to Pedestrian phases too.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Select
                        value={String(typeof field.value === "number" ? field.value : (field.value ? 1 : 0))}
                        onValueChange={(v) => field.onChange(parseInt(v, 10))}
                      >
                        <FormControl>
                          <SelectTrigger className="h-6" style={{ fontSize: '12px' }}>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="0">0 — None</SelectItem>
                          <SelectItem value="1">1 — Assigned approach</SelectItem>
                          <SelectItem value="2">2 — Both (assigned + opposite)</SelectItem>
                          <SelectItem value="3">3 — Opposite approach</SelectItem>
                          <SelectItem value="4">4 — Diagonal</SelectItem>
                          <SelectItem value="5">5 — Other diagonal (90° rotated)</SelectItem>
                          <SelectItem value="6">6 — Both diagonals (X)</SelectItem>
                          <SelectItem value="7">7 — All directions (4 crosswalks + X)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={phaseForm.control}
                  name="isOverlap"
                  render={({ field }) => (
                    <FormItem className="space-y-0.5">
                      <div className="flex items-center space-x-1">
                        <FormLabel className="font-medium" style={{ fontSize: '12px' }}>Overlap Phase</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-grey-400 hover:text-grey-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Enable if this phase runs simultaneously with another phase. Used for concurrent movements like right turns with through traffic.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormControl>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                          />
                          <span style={{ fontSize: '12px' }} className="text-grey-600">
                            {field.value ? 'Yes' : 'No'}
                          </span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPhaseModal(false)}
                  className="h-6 px-2"
                  style={{ fontSize: '12px' }}
                >
                  Cancel
                </Button>
                <Button type="submit" className="h-6 px-2 bg-primary-600 hover:bg-primary-700" style={{ fontSize: '12px' }}>
                  {editingPhase ? 'Update' : 'Add'} Phase
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Detector Modal */}
      {showDetectorModal && (
        <DetectorModal
          detector={editingDetector}
          onClose={handleDetectorModalClose}
          preSelectedSignalId={signalId || ""}
        />
      )}

      {/* Bulk Approach / Phase / Detector modals are rendered INLINE in their
          respective tab bodies above (with `inline` prop) — no Dialog popup
          on this page. */}

      {/* Basic Timing Modal */}
      {showBasicTimingModal && (
        <BasicTimingModal
          timing={null}
          onClose={() => {
            setShowBasicTimingModal(false);
            // Refresh timings list
            const updatedTimings = basicTimings.filter(t => t.signalId === signalId);
            setSignalTimings(updatedTimings);
          }}
          preSelectedSignalId={signalId || ""}
        />
      )}

      {/* New-Signal Dialog — only used for creating a fresh signal because
          the persistent main map isn't available until a signal exists, so
          the user needs the modal's own location-picker map. Existing-signal
          edits happen inline in the left panel instead. */}
      <Dialog open={isEditingSignal && isNewSignal} onOpenChange={setIsEditingSignal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNewSignal ? "New Signal" : "Edit Signal"}</DialogTitle>
          </DialogHeader>
          <Form {...signalForm}>
            <form onSubmit={signalForm.handleSubmit(handleSignalSave)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={signalForm.control}
                  name="signalId"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium">Signal ID</FormLabel>
                      <FormControl>
                        <Input {...field} className="h-7 px-2 text-xs" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={signalForm.control}
                  name="agencyId"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium">Agency ID</FormLabel>
                      <FormControl>
                        <Input {...field} className="h-7 px-2 text-xs" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-1">
                  <label className="text-xs font-medium">Street Name 1</label>
                  <div className="h-7 px-2 text-xs flex items-center bg-grey-50 border border-grey-200 rounded-md text-grey-600">
                    {derivedStreetName1 || <span className="text-grey-400 italic">From approaches</span>}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Street Name 2</label>
                  <div className="h-7 px-2 text-xs flex items-center bg-grey-50 border border-grey-200 rounded-md text-grey-600">
                    {derivedStreetName2 || <span className="text-grey-400 italic">From approaches</span>}
                  </div>
                </div>
                <FormField
                  control={signalForm.control}
                  name="latitude"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium">Latitude</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="any"
                          className="h-7 px-2 text-xs"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={signalForm.control}
                  name="longitude"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs font-medium">Longitude</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="any"
                          className="h-7 px-2 text-xs"
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Interactive map for location selection */}
              <div>
                <h4 className="text-sm font-medium text-grey-700 mb-2">Click map to update location</h4>
                <div className="h-64 rounded-lg border overflow-hidden relative z-0">
                  {isEditingSignal && (
                    <MapContainer
                      center={[signalForm.watch("latitude") || signal?.latitude || 0, signalForm.watch("longitude") || signal?.longitude || 0]}
                      zoom={16}
                      maxZoom={22}
                      scrollWheelZoom={false}
                      style={{ height: "100%", width: "100%", zIndex: 1 }}
                      key={`edit-map-${signalForm.watch("latitude")}-${signalForm.watch("longitude")}`}
                    >
                      <MapTileLayers />
                      <LocationPicker
                        onLocationSelect={(lat, lon) => {
                          signalForm.setValue("latitude", lat);
                          signalForm.setValue("longitude", lon);
                        }}
                      />
                      <Marker position={[signalForm.watch("latitude") || signal?.latitude || 0, signalForm.watch("longitude") || signal?.longitude || 0]} />
                    </MapContainer>
                  )}
                </div>
                <p className="text-xs text-grey-500 mt-1">
                  Current: {signalForm.watch("latitude")?.toFixed(6)}, {signalForm.watch("longitude")?.toFixed(6)}
                </p>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditingSignal(false)}
                  className="h-7 px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" className="h-7 px-3 text-xs bg-primary-600 hover:bg-primary-700">
                  {isNewSignal ? "Create Signal" : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Signal Section */}
      {!isNewSignal && signal && (
        <Card className="border-red-200">
          <CardHeader className="bg-red-50 border-b border-red-200 px-4 py-2">
            <CardTitle className="text-base font-semibold text-red-700 flex items-center space-x-2">
              <Trash2 className="w-4 h-4" />
              <span>Danger Zone</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-grey-900">Delete Signal</p>
                <p className="text-xs text-grey-600 mt-1">
                  Permanently delete this signal and all associated phases and detectors. This action cannot be undone.
                </p>
              </div>
              <Button
                onClick={handleSignalDelete}
                variant="destructive"
                className="h-7 px-3 text-xs"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Delete Signal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
