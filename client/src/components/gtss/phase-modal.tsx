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
import { X, Trash2, MapPin } from "lucide-react";

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
      isPedestrian: false,
      isOverlap: false,

      compassBearing: undefined,
      postedSpeedLimit: undefined,
      numberOfLanes: 1,
    },
  });

  useEffect(() => {
    if (phase) {
      form.reset({
        phase: phase.phase,
        signalId: phase.signalId,
        movementType: phase.movementType,
        isPedestrian: phase.isPedestrian,
        isOverlap: phase.isOverlap,

        compassBearing: phase.compassBearing || undefined,
        postedSpeedLimit: phase.postedSpeedLimit || undefined,
        numberOfLanes: phase.numberOfLanes || 1,
      });
    }
  }, [phase, form]);

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
      toast({
        title: "Success",
        description: "Phase deleted successfully",
      });
      onClose();
    }
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
                        <SelectItem value="Through">Through</SelectItem>
                        <SelectItem value="Left Turn">Left Turn</SelectItem>
                        <SelectItem value="Right Turn">Right Turn</SelectItem>
                        <SelectItem value="Through-Right">Through-Right</SelectItem>
                        <SelectItem value="U-Turn">U-Turn</SelectItem>
                        <SelectItem value="Flashing Yellow Arrow">Flashing Yellow Arrow</SelectItem>
                        <SelectItem value="Pedestrian">Pedestrian</SelectItem>
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
                name="postedSpeedLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Posted Speed Limit (mph)</FormLabel>
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
                name="numberOfLanes"
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
                  name="isOverlap"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-3">
                      <FormControl>
                        <Switch
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>Is Overlap Phase</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Map section with bearing visualization */}
            {form.watch("signalId") && form.watch("compassBearing") && (
              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="text-lg font-medium mb-3 flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                  Phase Direction Visualization
                </h3>
                <div className="h-64 rounded-lg overflow-hidden border">
                  {(() => {
                    const selectedSignal = signals.find(s => s.signalId === form.watch("signalId"));
                    const bearing = form.watch("compassBearing");
                    
                    if (!selectedSignal || !bearing) return null;
                    
                    // Calculate end point for bearing line (reversed for traffic flow direction)
                    const reversedBearing = (bearing + 180) % 360;
                    const distance = 0.002; // degrees
                    const bearingRad = (reversedBearing * Math.PI) / 180;
                    const endLat = selectedSignal.cntLat + distance * Math.cos(bearingRad);
                    const endLon = selectedSignal.cntLon + distance * Math.sin(bearingRad);
                    
                    return (
                      <MapContainer
                        center={[selectedSignal.cntLat, selectedSignal.cntLon]}
                        zoom={18}
                        style={{ height: "100%", width: "100%" }}
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker position={[selectedSignal.cntLat, selectedSignal.cntLon]}>
                          <Popup>
                            <div className="text-center">
                              <div className="font-medium">{selectedSignal.signalId}</div>
                              <div className="text-xs text-gray-600">
                                {selectedSignal.streetName1} & {selectedSignal.streetName2}
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                        <Polyline
                          positions={[
                            [selectedSignal.cntLat, selectedSignal.cntLon],
                            [endLat, endLon]
                          ]}
                          color="#10b981"
                          weight={3}
                          opacity={0.8}
                        />
                      </MapContainer>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="flex justify-between space-x-3 pt-4 border-t border-grey-200">
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
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
