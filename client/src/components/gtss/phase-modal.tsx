import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPhaseSchema, type InsertPhase, type Phase } from "@shared/schema";
import { usePhases } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import { X, Trash2, MapPin, Copy } from "lucide-react";

interface PhaseModalProps {
  phase: Phase | null;
  onClose: () => void;
  preSelectedSignalId?: string;
}

export default function PhaseModal({ phase, onClose, preSelectedSignalId }: PhaseModalProps) {
  const { signals } = useGTSSStore();
  const { toast } = useToast();
  const phaseHooks = usePhases();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<InsertPhase>({
    resolver: zodResolver(insertPhaseSchema),
    defaultValues: {
      phase: 2,
      signalId: preSelectedSignalId || "",
      movementType: "Through",
      isPedestrian: true,
      isOverlap: false,
      numOfLanes: 1,
      compassBearing: undefined,
      postedSpeed: undefined,
    },
  });

  const movementType = form.watch("movementType");
  const pedestrianDirty = form.formState.dirtyFields.isPedestrian;

  useEffect(() => {
    if (phase) {
      form.reset({
        phase: phase.phase,
        signalId: phase.signalId,
        movementType: phase.movementType,
        isPedestrian: phase.isPedestrian ?? phase.movementType === "Through",
        isOverlap: phase.isOverlap,
        numOfLanes: phase.numOfLanes || 1,
        compassBearing: phase.compassBearing || undefined,
        postedSpeed: phase.postedSpeed || undefined,
      });
    }
  }, [phase, form]);

  useEffect(() => {
    if (!phase && !pedestrianDirty) {
      form.setValue("isPedestrian", movementType === "Through");
    }
  }, [movementType, pedestrianDirty, phase, form]);

  const onSubmit = async (data: InsertPhase) => {
    setIsLoading(true);
    try {
      if (phase) {
        phaseHooks.update(phase.id, data);
        toast({
          title: "Success",
          description: "Phase updated successfully",
        });
      } else {
        phaseHooks.save(data);
        toast({
          title: "Success",
          description: "Phase created successfully",
        });
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: phase ? "Failed to update phase" : "Failed to create phase",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    if (phase && confirm("Are you sure you want to delete this phase?")) {
      phaseHooks.delete(phase.id);
      onClose();
    }
  };

  const handleDuplicateToLeftTurn = async () => {
    const currentData = form.getValues();
    
    // Only allow duplication for Through phases
    if (currentData.movementType !== "Through") {
      toast({
        title: "Not Applicable",
        description: "Duplicate to left turn only works for Through movements",
        variant: "destructive",
      });
      return;
    }

    const newPhaseNumber = getLeftTurnPhaseNumber(currentData.phase);
    if (!newPhaseNumber) {
      toast({
        title: "Not Applicable",
        description: "Duplicate to left turn only works for phases 2, 4, 6, or 8",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Save current phase first if it's new or being edited
      if (!phase) {
        phaseHooks.save(currentData);
      } else {
        // Update existing phase with current form data
        phaseHooks.update(phase.id, currentData);
      }

      // Create the duplicated left turn phase
      const leftTurnPhase: InsertPhase = {
        ...currentData,
        phase: newPhaseNumber,
        movementType: "Left Turn",
        isPedestrian: false,
        numOfLanes: 1, // Default to 1 lane as specified
        // Keep same compass bearing and posted speed
      };

      phaseHooks.save(leftTurnPhase);
      
      toast({
        title: "Success",
        description: `Created left turn phase ${newPhaseNumber} from through phase ${currentData.phase}`,
      });
      
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to duplicate phase",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDuplicateToOppositeApproach = async () => {
    const currentData = form.getValues();
    const newPhaseNumber = getOppositePhaseNumber(currentData.phase);

    if (!newPhaseNumber) {
      toast({
        title: "Not Applicable",
        description: "Duplicate to opposite approach only works for phases 1 through 8",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      if (!phase) {
        phaseHooks.save(currentData);
      } else {
        phaseHooks.update(phase.id, currentData);
      }

      const oppositePhase: InsertPhase = {
        ...currentData,
        phase: newPhaseNumber,
      };

      phaseHooks.save(oppositePhase);

      toast({
        title: "Success",
        description: `Created opposite approach phase ${newPhaseNumber} from phase ${currentData.phase}`,
      });

      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to duplicate phase",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getLeftTurnPhaseNumber = (phaseNumber: number) => {
    const phaseMapping: { [key: number]: number } = {
      2: 5,
      4: 7,
      6: 1,
      8: 3
    };
    return phaseMapping[phaseNumber];
  };

  const getOppositePhaseNumber = (phaseNumber: number) => {
    if (phaseNumber < 1 || phaseNumber > 8) {
      return null;
    }
    return ((phaseNumber + 3) % 8) + 1;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-screen overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {phase ? "Edit Phase" : "Add Phase"}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="phase"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phase Number *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="8"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="signalId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Signal ID *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select signal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {signals.map((signal) => (
                          <SelectItem key={signal.signalId} value={signal.signalId}>
                            {signal.signalId} - {signal.streetName1} & {signal.streetName2}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="movementType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Movement Type *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select movement" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Through">Through (T)</SelectItem>
                        <SelectItem value="Left Turn">Left (L)</SelectItem>
                        <SelectItem value="Left Through Shared">Left Through Shared Lane (LT)</SelectItem>
                        <SelectItem value="Permissive Phase">Permissive Phase (TL)</SelectItem>
                        <SelectItem value="Flashing Yellow Arrow">Flashing Yellow Arrow (FYA)</SelectItem>
                        <SelectItem value="U-Turn">U-turn (U)</SelectItem>
                        <SelectItem value="Right Turn">Right Turn (R)</SelectItem>
                        <SelectItem value="Through-Right">Through-Right (TR)</SelectItem>
                        <SelectItem value="Pedestrian">Pedestrian Phase (PED)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />



              <FormField
                control={form.control}
                name="compassBearing"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compass Bearing (degrees)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="360"
                        placeholder="90"
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value ? parseInt(value) : undefined);
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
                name="postedSpeed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Posted Speed</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        placeholder="35"
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value ? parseInt(value) : undefined);
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
                name="numOfLanes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Lanes *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="8"
                        placeholder="1"
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value ? parseInt(value) : 1);
                        }}
                        value={field.value || 1}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="isPedestrian"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <FormLabel>Pedestrian Phase Enabled</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isOverlap"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-3">
                      <FormControl>
                        <Switch
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>{field.value ? "Overlap" : "Not Overlap"}</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Map section with signal location and optional bearing visualization */}
            {form.watch("signalId") && (
              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="text-lg font-medium mb-3 flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                  Signal Location {form.watch("compassBearing") ? "& Phase Direction" : ""}
                </h3>
                <div className="h-64 rounded-lg overflow-hidden border">
                  {(() => {
                    const selectedSignal = signals.find(s => s.signalId === form.watch("signalId"));
                    const bearing = form.watch("compassBearing");
                    
                    if (!selectedSignal || !selectedSignal.latitude || !selectedSignal.longitude) return null;
                    
                    // Calculate end point for bearing line (reversed for traffic flow direction)
                    const reversedBearing = bearing ? (bearing + 180) % 360 : 0;
                    const distance = 0.002; // degrees
                    const bearingRad = (reversedBearing * Math.PI) / 180;
                    const endLat = (selectedSignal.latitude || 0) + distance * Math.cos(bearingRad);
                    const endLon = (selectedSignal.longitude || 0) + distance * Math.sin(bearingRad);
                    
                    return (
                      <MapContainer
                        center={[selectedSignal.latitude!, selectedSignal.longitude!]}
                        zoom={18}
                        style={{ height: "100%", width: "100%" }}
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker position={[selectedSignal.latitude!, selectedSignal.longitude!]}>
                          <Popup>
                            <div className="text-center">
                              <div className="font-medium">{selectedSignal.signalId}</div>
                              <div className="text-xs text-gray-600">
                                {selectedSignal.streetName1} & {selectedSignal.streetName2}
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                        {bearing && (
                          <Polyline
                            positions={[
                              [selectedSignal.latitude!, selectedSignal.longitude!],
                              [endLat, endLon]
                            ]}
                            color="#10b981"
                            weight={3}
                            opacity={0.8}
                          />
                        )}
                      </MapContainer>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="space-y-3 border-t border-grey-200 pt-4">
              <div className="rounded-lg border border-grey-200 bg-grey-50 p-4 text-sm text-grey-700">
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-grey-800">Duplicate phase</p>
                    <p className="text-xs text-grey-600">
                      {getOppositePhaseNumber(form.watch("phase"))
                        ? `Opposite: proposed phase ${getOppositePhaseNumber(form.watch("phase"))} will use the same movement type.`
                        : "Opposite approach duplication requires a phase between 1 and 8."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDuplicateToOppositeApproach}
                      disabled={isLoading || !getOppositePhaseNumber(form.watch("phase"))}
                      className="flex items-center space-x-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    >
                      <Copy className="w-4 h-4" />
                      <span>
                        Duplicate to Opposite
                        {getOppositePhaseNumber(form.watch("phase"))
                          ? ` (Phase ${getOppositePhaseNumber(form.watch("phase"))})`
                          : ""}
                      </span>
                    </Button>
                    {form.watch("movementType") === "Through" && [2, 4, 6, 8].includes(form.watch("phase")) && (
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={handleDuplicateToLeftTurn}
                        disabled={isLoading}
                        className="flex items-center space-x-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                      >
                        <Copy className="w-4 h-4" />
                        <span>
                          Duplicate to Left Turn (Phase {getLeftTurnPhaseNumber(form.watch("phase"))})
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between space-x-3">
                <div>
                  {phase && (
                    <Button 
                      type="button" 
                      variant="destructive" 
                      onClick={handleDelete}
                      className="flex items-center space-x-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Phase</span>
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
                    {isLoading ? "Saving..." : (phase ? "Save Changes" : "Create Phase")}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
