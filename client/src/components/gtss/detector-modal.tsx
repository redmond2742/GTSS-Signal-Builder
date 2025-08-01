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
import { X, MapPin, Target } from "lucide-react";
import approachImage from "@assets/generated_images/Single_approach_detector_placement_diagram_1778b27b.png";

interface DetectorModalProps {
  detector: Detector | null;
  onClose: () => void;
}

export default function DetectorModal({ detector, onClose }: DetectorModalProps) {
  const { signals, phases, addDetector, updateDetector } = useGTSSStore();
  const { toast } = useToast();
  const detectorHooks = useDetectors();
  const [selectedZone, setSelectedZone] = useState<'stopbar' | 'advance' | 'count' | null>(null);

  const form = useForm<InsertDetector>({
    resolver: zodResolver(insertDetectorSchema),
    defaultValues: {
      signalId: "",
      detectorChannel: "",
      phase: 2,
      description: "",
      purpose: "Advance",
      vehicleType: "",
      lane: "",
      detTechnologyType: "Loop",
      length: undefined,
      stopbarSetback: undefined,
    },
  });

  useEffect(() => {
    if (detector) {
      form.reset({
        signalId: detector.signalId,
        detectorChannel: detector.detectorChannel,
        phase: detector.phase,
        description: detector.description ?? "",
        purpose: detector.purpose,
        vehicleType: detector.vehicleType ?? "",
        lane: detector.lane ?? "",
        detTechnologyType: detector.detTechnologyType,
        length: detector.length ?? undefined,
        stopbarSetback: detector.stopbarSetback ?? undefined,
      });
    }
  }, [detector, form]);

  const handleZoneClick = (zone: 'stopbar' | 'advance' | 'count', event: React.MouseEvent) => {
    event.preventDefault();
    setSelectedZone(zone);
    
    // Auto-configure detector based on zone
    if (zone === 'stopbar') {
      form.setValue('purpose', 'Presence');
      form.setValue('stopbarSetback', 4.0);
      form.setValue('length', 6.0);
      toast({
        title: "Stop Bar Detector Selected",
        description: "Configured for presence detection at stop bar",
      });
    } else if (zone === 'advance') {
      form.setValue('purpose', 'Advance');
      form.setValue('stopbarSetback', 250.0);
      form.setValue('length', 25.0);
      toast({
        title: "Advanced Loop Selected", 
        description: "Configured for advance detection",
      });
    } else {
      form.setValue('purpose', 'Count');
      form.setValue('stopbarSetback', 500.0);
      form.setValue('length', 6.0);
      toast({
        title: "Count Detector Selected",
        description: "Configured for traffic counting",
      });
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
            {/* Approach Detector Placement Diagram */}
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h3 className="text-lg font-medium mb-3 flex items-center">
                <Target className="w-5 h-5 mr-2 text-blue-600" />
                Detector Placement Guide
              </h3>
              <div className="relative inline-block w-full">
                <img 
                  src={approachImage} 
                  alt="Traffic approach detector placement diagram"
                  className="w-full max-w-2xl mx-auto rounded border shadow-sm"
                />
                {/* Clickable overlay zones */}
                <div className="absolute inset-0 max-w-2xl mx-auto">
                  {/* Stop bar detector (near intersection) */}
                  <button
                    type="button"
                    onClick={(e) => handleZoneClick('stopbar', e)}
                    className={`absolute top-[40%] right-[15%] w-10 h-10 rounded border-2 ${
                      selectedZone === 'stopbar' 
                        ? 'bg-red-500 border-red-600 animate-pulse' 
                        : 'bg-red-400/80 border-red-500 hover:bg-red-500'
                    } flex items-center justify-center text-white text-xs font-bold transition-colors`}
                    title="Click for Stop Bar Detector"
                  >
                    <MapPin className="w-5 h-5" />
                  </button>
                  
                  {/* Advanced loop detector (middle distance) */}
                  <button
                    type="button"
                    onClick={(e) => handleZoneClick('advance', e)}
                    className={`absolute top-[40%] left-[50%] w-10 h-10 rounded border-2 ${
                      selectedZone === 'advance' 
                        ? 'bg-green-500 border-green-600 animate-pulse' 
                        : 'bg-green-400/80 border-green-500 hover:bg-green-500'
                    } flex items-center justify-center text-white text-xs font-bold transition-colors`}
                    title="Click for Advanced Loop Detector"
                  >
                    <Target className="w-5 h-5" />
                  </button>

                  {/* Count detector (far upstream) */}
                  <button
                    type="button"
                    onClick={(e) => handleZoneClick('count', e)}
                    className={`absolute top-[40%] left-[20%] w-10 h-10 rounded border-2 ${
                      selectedZone === 'count' 
                        ? 'bg-blue-500 border-blue-600 animate-pulse' 
                        : 'bg-blue-400/80 border-blue-500 hover:bg-blue-500'
                    } flex items-center justify-center text-white text-xs font-bold transition-colors`}
                    title="Click for Count Detector"
                  >
                    <div className="w-3 h-3 bg-white rounded-full"></div>
                  </button>
                </div>
              </div>
              <div className="mt-3 flex justify-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded"></div>
                  <span className="text-sm text-gray-600">Stop Bar</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded"></div> 
                  <span className="text-sm text-gray-600">Advanced Loop</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span className="text-sm text-gray-600">Count Detector</span>
                </div>
              </div>
              {selectedZone && (
                <div className="mt-3 p-3 rounded border bg-blue-50">
                  <Badge variant="outline" className="mb-2">
                    {selectedZone === 'stopbar' ? 'Stop Bar Detector' : 
                     selectedZone === 'advance' ? 'Advanced Loop Detector' : 'Count Detector'}
                  </Badge>
                  <p className="text-sm text-gray-600">
                    {selectedZone === 'stopbar' 
                      ? 'Configured for presence detection near the stop bar (4ft setback, 6ft length)'
                      : selectedZone === 'advance'
                      ? 'Configured for advance detection upstream (250ft setback, 25ft length)'
                      : 'Configured for traffic counting far upstream (500ft setback, 6ft length)'
                    }
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                name="detectorChannel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Detector Channel *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., CH_01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                        {(() => {
                          const selectedSignalId = form.watch("signalId");
                          if (selectedSignalId) {
                            // Show phases from the selected signal
                            const signalPhases = phases.filter(p => p.signalId === selectedSignalId);
                            if (signalPhases.length > 0) {
                              return signalPhases.map((phase) => (
                                <SelectItem key={phase.id} value={phase.phase.toString()}>
                                  Phase {phase.phase} - {phase.movementType}
                                </SelectItem>
                              ));
                            }
                          }
                          // Fallback to even phase numbers (2, 4, 6, 8)
                          return [2, 4, 6, 8].map((phaseNum) => (
                            <SelectItem key={phaseNum} value={phaseNum.toString()}>
                              Phase {phaseNum}
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purpose *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select purpose" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Advance">Advance</SelectItem>
                        <SelectItem value="Stop Bar">Stop Bar</SelectItem>
                        <SelectItem value="Extension">Extension</SelectItem>
                        <SelectItem value="Dilemma Zone">Dilemma Zone</SelectItem>
                        <SelectItem value="Count">Count</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="detTechnologyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Technology Type *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select technology" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Loop">Inductive Loop</SelectItem>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vehicle type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="All">All Vehicles</SelectItem>
                        <SelectItem value="Passenger">Passenger</SelectItem>
                        <SelectItem value="Commercial">Commercial</SelectItem>
                        <SelectItem value="Transit">Transit</SelectItem>
                        <SelectItem value="Emergency">Emergency</SelectItem>
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
                    <FormLabel>Lane</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Left, Through, Right" {...field} />
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
                      <Input placeholder="Detector description" {...field} />
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
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value ? parseFloat(value) : undefined);
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
                name="stopbarSetback"
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
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value ? parseFloat(value) : undefined);
                        }}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-grey-200">
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
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
