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
// Removed image import for simplified interface

interface DetectorModalProps {
  detector: Detector | null;
  onClose: () => void;
}

export default function DetectorModal({ detector, onClose }: DetectorModalProps) {
  const { signals, phases } = useGTSSStore();
  const { toast } = useToast();
  const detectorHooks = useDetectors();
  const [selectedZone, setSelectedZone] = useState<'stopbar' | 'advance' | 'count' | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState<string>(detector?.signalId || "");
  const [lockedValues, setLockedValues] = useState({ length: false, stopbarSetback: false });

  const form = useForm<InsertDetector>({
    resolver: zodResolver(insertDetectorSchema),
    defaultValues: {
      signalId: "",
      detectorChannel: "",
      phase: 2,
      description: "",
      purpose: "Advance",
      vehicleType: "Vehicle",
      lane: "",
      detTechnologyType: "Inductance Loop",
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
      setSelectedSignalId(detector.signalId);
    }
  }, [detector, form]);

  // Update available phases when signal ID changes
  const availablePhases = phases.filter(phase => phase.signalId === selectedSignalId);

  const handleZoneClick = (zone: 'stopbar' | 'advance' | 'count', event: React.MouseEvent) => {
    event.preventDefault();
    setSelectedZone(zone);
    
    // Auto-configure detector based on zone
    if (zone === 'stopbar') {
      form.setValue('purpose', 'Stop Bar');
      if (!lockedValues.stopbarSetback) form.setValue('stopbarSetback', 4.0);
      if (!lockedValues.length) form.setValue('length', 6.0);
      toast({
        title: "Stop Bar Detector Selected",
        description: "Configured for presence detection at stop bar",
      });
    } else if (zone === 'advance') {
      form.setValue('purpose', 'Advanced Loop');
      if (!lockedValues.stopbarSetback) form.setValue('stopbarSetback', 250.0);
      if (!lockedValues.length) form.setValue('length', 25.0);
      toast({
        title: "Advanced Loop Selected", 
        description: "Configured for advance detection",
      });
    } else {
      form.setValue('purpose', 'Count Detector');
      if (!lockedValues.stopbarSetback) form.setValue('stopbarSetback', 500.0);
      if (!lockedValues.length) form.setValue('length', 6.0);
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
                        setSelectedSignalId(value);
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

            {/* Detector Type Selection */}
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h3 className="text-lg font-medium mb-3 flex items-center">
                <Target className="w-5 h-5 mr-2 text-blue-600" />
                Detector Type Quick Setup
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={(e) => handleZoneClick('stopbar', e)}
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    selectedZone === 'stopbar' 
                      ? 'bg-red-100 border-red-500 text-red-700' 
                      : 'bg-white border-gray-200 hover:border-red-300 hover:bg-red-50'
                  }`}
                >
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-8 h-8 bg-red-500 rounded flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <h4 className="font-medium">Stop Bar</h4>
                    <p className="text-xs text-gray-600 mt-1">Presence detection at stop line</p>
                    <p className="text-xs text-gray-500">4ft setback, 6ft length</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={(e) => handleZoneClick('advance', e)}
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    selectedZone === 'advance' 
                      ? 'bg-green-100 border-green-500 text-green-700' 
                      : 'bg-white border-gray-200 hover:border-green-300 hover:bg-green-50'
                  }`}
                >
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-8 h-8 bg-green-500 rounded flex items-center justify-center">
                      <Target className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <h4 className="font-medium">Advanced Loop</h4>
                    <p className="text-xs text-gray-600 mt-1">Advance detection upstream</p>
                    <p className="text-xs text-gray-500">250ft setback, 25ft length</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={(e) => handleZoneClick('count', e)}
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    selectedZone === 'count' 
                      ? 'bg-blue-100 border-blue-500 text-blue-700' 
                      : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
                      <div className="w-3 h-3 bg-white rounded-full"></div>
                    </div>
                  </div>
                  <div className="text-center">
                    <h4 className="font-medium">Count Detector</h4>
                    <p className="text-xs text-gray-600 mt-1">Traffic counting far upstream</p>
                    <p className="text-xs text-gray-500">500ft setback, 6ft length</p>
                  </div>
                </button>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                          // Lock the value when manually changed
                          setLockedValues(prev => ({ ...prev, stopbarSetback: true }));
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
