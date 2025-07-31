import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { insertPhaseSchema, type InsertPhase, type Phase } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface PhaseModalProps {
  phase: Phase | null;
  onClose: () => void;
  preSelectedSignalId?: string;
}

export default function PhaseModal({ phase, onClose, preSelectedSignalId }: PhaseModalProps) {
  const { signals, addPhase, updatePhase } = useGTSSStore();
  const { toast } = useToast();

  const createPhaseMutation = useMutation({
    mutationFn: async (data: InsertPhase) => {
      const response = await apiRequest("POST", "/api/phases", data);
      return response.json();
    },
    onSuccess: (data: Phase) => {
      addPhase(data);
      queryClient.invalidateQueries({ queryKey: ["/api/phases"] });
      toast({
        title: "Success",
        description: "Phase created successfully",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create phase",
        variant: "destructive",
      });
    },
  });

  const updatePhaseMutation = useMutation({
    mutationFn: async (data: InsertPhase) => {
      const response = await apiRequest("PUT", `/api/phases/${phase?.id}`, data);
      return response.json();
    },
    onSuccess: (data: Phase) => {
      updatePhase(phase!.id, data);
      queryClient.invalidateQueries({ queryKey: ["/api/phases"] });
      toast({
        title: "Success",
        description: "Phase updated successfully",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update phase",
        variant: "destructive",
      });
    },
  });

  const form = useForm<InsertPhase>({
    resolver: zodResolver(insertPhaseSchema),
    defaultValues: {
      phase: 1,
      signalId: preSelectedSignalId || "",
      movementType: "Through",
      isPedestrian: false,
      isOverlap: false,
      channelOutput: "",
      compassBearing: undefined,
      postedSpeedLimit: undefined,
      vehicleDetectionIds: "",
      pedAudibleEnabled: false,
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
        channelOutput: phase.channelOutput || "",
        compassBearing: phase.compassBearing || undefined,
        postedSpeedLimit: phase.postedSpeedLimit || undefined,
        vehicleDetectionIds: phase.vehicleDetectionIds || "",
        pedAudibleEnabled: phase.pedAudibleEnabled,
      });
    }
  }, [phase, form]);

  const onSubmit = (data: InsertPhase) => {
    if (phase) {
      updatePhaseMutation.mutate(data);
    } else {
      createPhaseMutation.mutate(data);
    }
  };

  const isLoading = createPhaseMutation.isPending || updatePhaseMutation.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-screen overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            {phase ? "Edit Phase" : "Add Phase"}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
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
                        <SelectItem value="U-Turn">U-Turn</SelectItem>
                        <SelectItem value="Pedestrian">Pedestrian</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="channelOutput"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel Output</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., CH_01" {...field} />
                    </FormControl>
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
                name="vehicleDetectionIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle Detection IDs</FormLabel>
                    <FormControl>
                      <Input placeholder="DET_01,DET_02" {...field} />
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
                    <FormItem className="flex items-center space-x-3">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>Is Pedestrian Phase</FormLabel>
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
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>Is Overlap Phase</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pedAudibleEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-3">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>Pedestrian Audible Enabled</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                {isLoading ? "Saving..." : (phase ? "Save Changes" : "Create Phase")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
