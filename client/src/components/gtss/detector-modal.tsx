import { useEffect } from "react";
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
import { X } from "lucide-react";

interface DetectorModalProps {
  detector: Detector | null;
  onClose: () => void;
}

export default function DetectorModal({ detector, onClose }: DetectorModalProps) {
  const { signals, phases, addDetector, updateDetector } = useGTSSStore();
  const { toast } = useToast();
  const detectorHooks = useDetectors();

  const form = useForm<InsertDetector>({
    resolver: zodResolver(insertDetectorSchema),
    defaultValues: {
      signalId: "",
      detectorChannel: "",
      phase: 1,
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

  const onSubmit = (data: InsertDetector) => {
    try {
      if (detector) {
        const updated = detectorHooks.update(detector.id, data);
        updateDetector(detector.id, updated);
        toast({
          title: "Success",
          description: "Detector updated successfully",
        });
      } else {
        const created = detectorHooks.create(data);
        addDetector(created);
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
    }
  };

  const isLoading = createDetectorMutation.isPending || updateDetectorMutation.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-screen overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {detector ? "Edit Detector" : "Add Detector"}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                          // Fallback to generic phase numbers
                          return [1, 2, 3, 4, 5, 6, 7, 8].map((phaseNum) => (
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
