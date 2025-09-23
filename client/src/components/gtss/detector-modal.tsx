import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertDetectorSchema, type InsertDetector, type Detector } from "@shared/schema";
import { useDetectors } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { X, MapPin, Target, Trash2 } from "lucide-react";
// Removed image import for simplified interface

interface DetectorModalProps {
  detector: Detector | null;
  onClose: () => void;
  preSelectedSignalId?: string;
}

export default function DetectorModal({ detector, onClose, preSelectedSignalId }: DetectorModalProps) {
  const { signals, phases } = useGTSSStore();
  const { toast } = useToast();
  const detectorHooks = useDetectors();
  const [selectedZone, setSelectedZone] = useState<'stopbar' | 'advance' | 'count' | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState<string>(detector?.signalId || preSelectedSignalId || "");
  const [lockedValues, setLockedValues] = useState({ length: false, stopbarSetback: false });

  const form = useForm<InsertDetector>({
    resolver: zodResolver(insertDetectorSchema),
    defaultValues: {
      signalId: preSelectedSignalId || "",
      channel: "",
      phase: 2,
      description: "",
      purpose: "Advance",
      vehicleType: "Vehicle",
      lane: "",
      technologyType: "Inductance Loop",
      length: undefined,
      stopbarSetbackDist: undefined,
    },
  });

  useEffect(() => {
    if (detector) {
      form.reset({
        signalId: detector.signalId,
        channel: detector.channel,
        phase: detector.phase,
        description: detector.description ?? "",
        purpose: detector.purpose,
        vehicleType: detector.vehicleType ?? "",
        lane: detector.lane ?? "",
        technologyType: detector.technologyType,
        length: detector.length ?? undefined,
        stopbarSetbackDist: detector.stopbarSetbackDist ?? undefined,
      });
      setSelectedSignalId(detector.signalId);
    }
  }, [detector, form]);

  // Update available phases when signal ID changes
  const availablePhases = phases.filter(phase => phase.signalId === selectedSignalId);
  const isSignalSelected = selectedSignalId && selectedSignalId !== "";

  // Handle signal ID change - update map location
  const handleSignalChange = (signalId: string) => {
    setSelectedSignalId(signalId);
    form.setValue('signalId', signalId);
  };

  const handleZoneClick = (zone: 'stopbar' | 'advance' | 'count', event: React.MouseEvent) => {
    event.preventDefault();
    setSelectedZone(zone);
    
    // Auto-configure detector based on zone
    if (zone === 'stopbar') {
      form.setValue('purpose', 'Stop Bar');
      if (!lockedValues.stopbarSetback) form.setValue('stopbarSetbackDist', 4.0);
      if (!lockedValues.length) form.setValue('length', 6.0);
    } else if (zone === 'advance') {
      form.setValue('purpose', 'Advanced Loop');
      if (!lockedValues.stopbarSetback) form.setValue('stopbarSetbackDist', 250.0);
      if (!lockedValues.length) form.setValue('length', 25.0);
    } else {
      form.setValue('purpose', 'Count Detector');
      if (!lockedValues.stopbarSetback) form.setValue('stopbarSetbackDist', 500.0);
      if (!lockedValues.length) form.setValue('length', 6.0);
    }
  };

  const onSubmit = async (data: InsertDetector) => {
    setIsLoading(true);
    try {
      if (detector) {
        detectorHooks.update(detector.id, data);
        toast({
          title: "Success",
          description: "Detector updated successfully",
        });
      } else {
        detectorHooks.save(data);
        toast({
          title: "Success", 
          description: "Detector created successfully",
        });
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: detector ? "Failed to update detector" : "Failed to create detector",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    if (detector && confirm("Are you sure you want to delete this detector?")) {
      detectorHooks.delete(detector.id);
      toast({
        title: "Success",
        description: "Detector deleted successfully",
      });
      onClose();
    }
  };

  const [isLoading, setIsLoading] = useState(false);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-screen overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {detector ? "Edit Detector" : "Add Detector"}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Signal ID Selection */}
            <div className="bg-blue-50 p-4 rounded-lg border">
              <FormField
                control={form.control}
                name="signalId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg font-medium">Select Signal *</FormLabel>
                    <Select 
                      onValueChange={(value) => {
                        field.onChange(value);
                        handleSignalChange(value);
                      }} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a signal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {signals.map((signal) => (
                          <SelectItem key={signal.id} value={signal.signalId}>
                            {signal.signalId} - {signal.streetName1} & {signal.streetName2}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Detector Type Quick Setup removed per user request */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Detector Channel *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., CH_01" {...field} disabled={!isSignalSelected} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(() => {
                const selectedSignalId = form.watch("signalId");
                const signalPhases = selectedSignalId ? phases.filter(p => p.signalId === selectedSignalId).sort((a, b) => a.phase - b.phase) : [];
                
                // Only show phase field if signal has phases
                if (!selectedSignalId || signalPhases.length === 0) {
                  return (
                    <div className="p-3 bg-warning-50 border border-warning-200 rounded-md">
                      <p className="text-sm text-warning-700">
                        {!selectedSignalId 
                          ? "Please select a signal first to see available phases." 
                          : "No phases configured for this signal. Please add phases before creating detectors."
                        }
                      </p>
                    </div>
                  );
                }

                return (
                  <FormField
                    control={form.control}
                    name="phase"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phase *</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(parseInt(value))} 
                          defaultValue={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select phase" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {signalPhases.map((phase) => (
                              <SelectItem key={phase.id} value={phase.phase.toString()}>
                                Phase {phase.phase} - {phase.movementType}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                );
              })()}

              <FormField
                control={form.control}
                name="purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purpose *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!isSignalSelected}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select purpose" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Stop Bar">Stop Bar</SelectItem>
                        <SelectItem value="Advanced Loop">Advanced Loop</SelectItem>
                        <SelectItem value="Count Detector">Count Detector</SelectItem>
                        <SelectItem value="Extension">Extension</SelectItem>
                        <SelectItem value="Dilemma Zone">Dilemma Zone</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="technologyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Technology Type *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!isSignalSelected}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select technology" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Inductance Loop">Inductance Loop</SelectItem>
                        <SelectItem value="Video">Video Detection</SelectItem>
                        <SelectItem value="Radar">Radar</SelectItem>
                        <SelectItem value="Microwave">Microwave</SelectItem>
                        <SelectItem value="Magnetic">Magnetic</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vehicleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || undefined} disabled={!isSignalSelected}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vehicle type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Vehicle">Vehicle</SelectItem>
                        <SelectItem value="All">All Vehicles</SelectItem>
                        <SelectItem value="Passenger">Passenger</SelectItem>
                        <SelectItem value="Commercial">Commercial</SelectItem>
                        <SelectItem value="Transit">Transit</SelectItem>
                        <SelectItem value="Emergency">Emergency</SelectItem>
                        <SelectItem value="Bike">Bike</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lane"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lane Number</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        min="1"
                        max="8"
                        placeholder="e.g., 1, 2, 3" 
                        {...field} 
                        disabled={!isSignalSelected}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="length"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Length (feet)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="6.0"
                        {...field}
                        disabled={!isSignalSelected}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value ? parseFloat(value) : undefined);
                          // Lock the value when manually changed
                          setLockedValues(prev => ({ ...prev, length: true }));
                        }}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stopbarSetbackDist"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stopbar Setback (feet)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="4.0"
                        {...field}
                        disabled={!isSignalSelected}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value ? parseFloat(value) : undefined);
                          // Lock the value when manually changed
                          setLockedValues(prev => ({ ...prev, stopbarSetbackDist: true }));
                        }}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Detector description" 
                        {...field} 
                        disabled={!isSignalSelected}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Map section */}
            {isSignalSelected && (
              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="text-lg font-medium mb-3 flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                  Signal Location
                </h3>
                <div className="h-64 rounded-lg overflow-hidden border">
                  {(() => {
                    const selectedSignal = signals.find(s => s.signalId === selectedSignalId);
                    return selectedSignal ? (
                      <MapContainer
                        key={selectedSignalId} // Force remount when signal changes
                        center={[selectedSignal.latitude || 0, selectedSignal.longitude || 0]}
                        zoom={18}
                        style={{ height: "100%", width: "100%" }}
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker position={[selectedSignal.latitude || 0, selectedSignal.longitude || 0]}>
                          <Popup>
                            <div className="text-center">
                              <div className="font-medium">{selectedSignal.signalId}</div>
                              <div className="text-xs text-gray-600">
                                {selectedSignal.streetName1} & {selectedSignal.streetName2}
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      </MapContainer>
                    ) : null;
                  })()}
                </div>
              </div>
            )}

            <div className="flex justify-between space-x-3 pt-4 border-t border-grey-200">
              <div>
                {detector && (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={handleDelete}
                    className="flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Detector</span>
                  </Button>
                )}
              </div>
              <div className="flex space-x-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-primary-600 hover:bg-primary-700"
                  disabled={isLoading}
                >
                  {isLoading ? "Saving..." : (detector ? "Save Changes" : "Create Detector")}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
