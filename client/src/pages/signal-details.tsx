import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSignalSchema, insertPhaseSchema, insertDetectorSchema, type Signal, type Phase, type Detector, type InsertSignal, type InsertPhase, type InsertDetector } from "@shared/schema";
import { useGTSSStore } from "@/store/gtss-store";
import { useSignals, usePhases, useDetectors } from "@/lib/localStorageHooks";
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
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { MapPin, Edit3, Plus, Trash2, Navigation, ArrowLeft, Settings, HelpCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import PhaseModal from "@/components/gtss/phase-modal";
import DetectorModal from "@/components/gtss/detector-modal";
import VisualPhaseEditor from "@/components/gtss/visual-phase-editor";

// Location picker component for interactive map editing
function LocationPicker({ onLocationSelect }: { onLocationSelect: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function SignalDetails() {
  const { toast } = useToast();
  const { agency, signals, phases, detectors, currentSignalId, navigateToMain, navigateToSignalDetails } = useGTSSStore();
  const signalId = currentSignalId;
  const isNewSignal = signalId === null;
  const signalHooks = useSignals();
  const phaseHooks = usePhases();
  const detectorHooks = useDetectors();
  
  const [signal, setSignal] = useState<Signal | null>(null);
  const [signalPhases, setSignalPhases] = useState<Phase[]>([]);
  const [signalDetectors, setSignalDetectors] = useState<Detector[]>([]);
  const [isEditingSignal, setIsEditingSignal] = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [showDetectorModal, setShowDetectorModal] = useState(false);
  const [showVisualEditor, setShowVisualEditor] = useState(false);
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [editingDetector, setEditingDetector] = useState<Detector | null>(null);

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
      compassBearing: null,
      numOfLanes: 1,
      postedSpeed: null,
      isOverlap: false,
    },
  });


  useEffect(() => {
    if (isNewSignal) {
      // Initialize for new signal creation
      setSignal(null);
      setSignalPhases([]);
      setSignalDetectors([]);
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
      setSignalDetectors(filteredDetectors);
    }
  }, [signalId, isNewSignal, signals, phases, detectors, agency]);

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
      compassBearing: null,
      numOfLanes: 1,
      postedSpeed: null,
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
      compassBearing: phase.compassBearing,
      numOfLanes: phase.numOfLanes,
      postedSpeed: phase.postedSpeed,
      isOverlap: phase.isOverlap,
    });
    setShowPhaseModal(true);
  };

  const handlePhaseSave = (data: InsertPhase) => {
    try {
      // Check for duplicate phase numbers (only for new phases)
      if (!editingPhase) {
        const existingPhase = signalPhases.find(p => p.phase === data.phase);
        if (existingPhase) {
          toast({
            title: "Error",
            description: `Phase ${data.phase} already exists for this signal. Please choose a different phase number.`,
            variant: "destructive",
          });
          return;
        }
      }
      
      if (editingPhase) {
        // Check for duplicate phase numbers when editing (exclude current phase)
        const existingPhase = signalPhases.find(p => p.phase === data.phase && p.id !== editingPhase.id);
        if (existingPhase) {
          toast({
            title: "Error",
            description: `Phase ${data.phase} already exists for this signal. Please choose a different phase number.`,
            variant: "destructive",
          });
          return;
        }
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

  const handleBulkPhasesCreate = async (phases: InsertPhase[]) => {
    try {
      for (const phaseData of phases) {
        phaseHooks.save(phaseData);
      }
      // Refresh the phases list from localStorage
      const { phases: updatedPhases } = useGTSSStore.getState();
      const filteredPhases = updatedPhases.filter(p => p.signalId === signalId);
      setSignalPhases(filteredPhases);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create some phases",
        variant: "destructive",
      });
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
                : `${signal?.streetName1} & ${signal?.streetName2}`
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
              {signal.signalId} • {signal.streetName1} & {signal.streetName2}
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

      {/* Signal Information */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-grey-800 flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-primary-600" />
              <span>Signal Information</span>
            </CardTitle>
            {!isNewSignal && (
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditingSignal(!isEditingSignal)}
                  className="h-7 px-2 text-xs"
                >
                  <Edit3 className="w-3 h-3 mr-1" />
                  {isEditingSignal ? "Cancel" : "Edit"}
                </Button>
                {isEditingSignal && (
                  <Button
                    onClick={signalForm.handleSubmit(handleSignalSave)}
                    className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700"
                  >
                    Save Changes
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {isEditingSignal ? (
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
                  <FormField
                    control={signalForm.control}
                    name="streetName1"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs font-medium">Street Name 1</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-7 px-2 text-xs" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={signalForm.control}
                    name="streetName2"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-xs font-medium">Street Name 2</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-7 px-2 text-xs" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                
                {/* Interactive Map for Location Selection */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-grey-700 mb-2">Click map to update location</h4>
                  <div className="h-48 rounded-lg border overflow-hidden relative z-0">
                    <MapContainer
                      center={[signalForm.watch("latitude") || signal?.latitude || 0, signalForm.watch("longitude") || signal?.longitude || 0]}
                      zoom={16}
                      style={{ height: "100%", width: "100%", zIndex: 1 }}
                      key={`edit-map-${signalForm.watch("latitude")}-${signalForm.watch("longitude")}`}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <LocationPicker 
                        onLocationSelect={(lat, lon) => {
                          signalForm.setValue("latitude", lat);
                          signalForm.setValue("longitude", lon);
                        }} 
                      />
                      <Marker position={[signalForm.watch("latitude") || signal?.latitude || 0, signalForm.watch("longitude") || signal?.longitude || 0]} />
                    </MapContainer>
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
                    Save Changes
                  </Button>
                </div>
              </form>
            </Form>
          ) : signal ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-grey-500">Signal ID</p>
                  <p className="text-sm font-mono">{signal.signalId}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-grey-500">Streets</p>
                  <p className="text-sm">{signal.streetName1} & {signal.streetName2}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-grey-500">Coordinates</p>
                  <p className="text-sm font-mono">
                    {signal.latitude?.toFixed(6)}, {signal.longitude?.toFixed(6)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-grey-500">Agency</p>
                  <p className="text-sm">{signal.agencyId}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-grey-500">
              No signal data available
            </div>
          )}
          
          {/* Map */}
          {signal && signal.latitude && signal.longitude && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-grey-700 mb-2">Location</h4>
              <div className="h-48 rounded-lg border overflow-hidden relative z-0">
                <MapContainer
                  center={[signal.latitude, signal.longitude]}
                  zoom={16}
                  style={{ height: "100%", width: "100%", zIndex: 1 }}
                  key={`view-map-${signal.signalId}-${signal.latitude}-${signal.longitude}`}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[signal.latitude, signal.longitude]} />
                </MapContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phases Section */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-grey-800 flex items-center space-x-2">
              <Settings className="w-4 h-4 text-primary-600" />
              <span>Signal Phases ({signalPhases.length})</span>
            </CardTitle>
            <div className="flex space-x-1">
              <Button
                onClick={() => setShowVisualEditor(true)}
                variant="outline"
                className="h-7 px-2 text-xs border-success-200 text-success-700 hover:bg-success-50"
                disabled={isNewSignal}
              >
                <Navigation className="w-3 h-3 mr-1" />
                Visual Editor
              </Button>
              <Button
                onClick={handlePhaseAdd}
                className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Phase
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {signalPhases.length === 0 ? (
            <div className="p-8 text-center text-grey-500 text-sm">
              No phases configured for this signal
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-grey-50 border-b border-grey-200">
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Phase</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Movement</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Bearing</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Lanes</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Speed</TableHead>
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
                        {phase.compassBearing ? `${phase.compassBearing}°` : 'N/A'}
                      </TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{phase.numOfLanes}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>
                        {phase.postedSpeed ? `${phase.postedSpeed} mph` : 'N/A'}
                      </TableCell>
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

      {/* Detectors Section */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-grey-800 flex items-center space-x-2">
              <Navigation className="w-4 h-4 text-primary-600" />
              <span>Detection Equipment ({signalDetectors.length})</span>
            </CardTitle>
            <Button
              onClick={handleDetectorAdd}
              className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700"
              disabled={signalPhases.length === 0}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Detector
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {signalPhases.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-warning-700 bg-warning-50 border border-warning-200 rounded-md p-3">
                No phases configured. Please add phases before adding detectors.
              </p>
            </div>
          ) : signalDetectors.length === 0 ? (
            <div className="p-8 text-center text-grey-500 text-sm">
              No detectors configured for this signal
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-grey-50 border-b border-grey-200">
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Channel</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Phase</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Technology</TableHead>
                    <TableHead className="font-medium py-1 px-1.5" style={{ fontSize: '12px' }}>Setback</TableHead>
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
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>{detector.technologyType}</TableCell>
                      <TableCell className="py-1 px-1.5" style={{ fontSize: '12px' }}>
                        {detector.stopbarSetbackDist ? `${detector.stopbarSetbackDist}ft` : 'N/A'}
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-6" style={{ fontSize: '12px' }}>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Through">Through</SelectItem>
                          <SelectItem value="Left">Left</SelectItem>
                          <SelectItem value="Right">Right</SelectItem>
                          <SelectItem value="U-Turn">U-Turn</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={phaseForm.control}
                  name="compassBearing"
                  render={({ field }) => (
                    <FormItem className="space-y-0.5">
                      <div className="flex items-center space-x-1">
                        <FormLabel className="font-medium" style={{ fontSize: '12px' }}>Bearing (°)</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-grey-400 hover:text-grey-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Compass direction of traffic flow in degrees (0-360). 0° = North, 90° = East, 180° = South, 270° = West.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="number" 
                          min="0" 
                          max="360"
                          className="h-6 px-2"
                          style={{ fontSize: '12px' }}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || null)}
                        />
                      </FormControl>
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
                  name="postedSpeed"
                  render={({ field }) => (
                    <FormItem className="space-y-0.5">
                      <div className="flex items-center space-x-1">
                        <FormLabel className="font-medium" style={{ fontSize: '12px' }}>Posted Speed (mph)</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-grey-400 hover:text-grey-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Speed limit for this approach in miles per hour. Leave blank if not applicable.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="number" 
                          min="0"
                          className="h-6 px-2"
                          style={{ fontSize: '12px' }}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || null)}
                        />
                      </FormControl>
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

      {/* Visual Phase Editor Dialog */}
      {showVisualEditor && signal && (
        <Dialog open onOpenChange={() => setShowVisualEditor(false)}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle>Visual Phase Editor</DialogTitle>
            </DialogHeader>
            <VisualPhaseEditor
              signal={signal}
              onPhasesCreate={handleBulkPhasesCreate}
              onClose={() => setShowVisualEditor(false)}
            />
          </DialogContent>
        </Dialog>
      )}

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