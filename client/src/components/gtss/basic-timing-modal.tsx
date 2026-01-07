import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBasicTimingSchema, type InsertBasicTiming, type BasicTiming } from "@shared/schema";
import { useBasicTimings } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Trash2, Clock } from "lucide-react";

interface BasicTimingModalProps {
  timing: BasicTiming | null;
  onClose: () => void;
  preSelectedSignalId?: string;
}

export default function BasicTimingModal({ timing, onClose, preSelectedSignalId }: BasicTimingModalProps) {
  const { signals, phases } = useGTSSStore();
  const { toast } = useToast();
  const timingHooks = useBasicTimings();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<InsertBasicTiming>({
    resolver: zodResolver(insertBasicTimingSchema),
    defaultValues: {
      phase: 2,
      signalId: preSelectedSignalId || "",
      pedWalk: undefined,
      pedClearance: undefined,
      leadingPedInterval: undefined,
      minGreen: undefined,
      maxGreen: undefined,
      yellow: undefined,
      allRed: undefined,
      vehRecallType: "None",
      pedRecall: false,
    },
  });

  useEffect(() => {
    if (timing) {
      form.reset({
        phase: timing.phase,
        signalId: timing.signalId,
        pedWalk: timing.pedWalk || undefined,
        pedClearance: timing.pedClearance || undefined,
        leadingPedInterval: timing.leadingPedInterval || undefined,
        minGreen: timing.minGreen || undefined,
        maxGreen: timing.maxGreen || undefined,
        yellow: timing.yellow || undefined,
        allRed: timing.allRed || undefined,
        vehRecallType: (timing.vehRecallType as "None" | "Min" | "Max" | "Soft") || "None",
        pedRecall: timing.pedRecall || false,
      });
    }
  }, [timing, form]);

  const selectedSignalId = form.watch("signalId");

  // Get phases for selected signal
  const signalPhases = phases.filter(p => p.signalId === selectedSignalId);
  const uniquePhaseNumbers = Array.from(new Set(signalPhases.map(p => p.phase))).sort((a, b) => a - b);

  const onSubmit = async (data: InsertBasicTiming) => {
    setIsLoading(true);
    try {
      if (timing) {
        timingHooks.update(timing.id, data);
        toast({
          title: "Success",
          description: "Basic timing updated successfully",
        });
      } else {
        timingHooks.save(data);
        toast({
          title: "Success",
          description: "Basic timing created successfully",
        });
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: timing ? "Failed to update timing" : "Failed to create timing",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    if (timing && confirm("Are you sure you want to delete this timing configuration?")) {
      timingHooks.delete(timing.id);
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-screen overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {timing ? "Edit Basic Timing" : "Add Basic Timing"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="signalId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Signal *</FormLabel>
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
                name="phase"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phase *</FormLabel>
                    {uniquePhaseNumbers.length > 0 ? (
                      <Select
                        onValueChange={(v) => field.onChange(parseInt(v))}
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select phase" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {uniquePhaseNumbers.map((phaseNum) => (
                            <SelectItem key={phaseNum} value={phaseNum.toString()}>
                              Phase {phaseNum}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="16"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Pedestrian Timing Section */}
            <div className="border rounded-lg p-4 bg-grey-50">
              <h4 className="text-sm font-medium text-grey-700 mb-3">Pedestrian Timing</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="pedWalk"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Walk (seconds)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="7"
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
                  name="pedClearance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Clearance (seconds)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="15"
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
                  name="leadingPedInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>LPI (seconds)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="3"
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
            </div>

            {/* Vehicle Timing Section */}
            <div className="border rounded-lg p-4 bg-grey-50">
              <h4 className="text-sm font-medium text-grey-700 mb-3">Vehicle Timing</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="minGreen"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min Green (s)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="10"
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
                  name="maxGreen"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Green (s)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="45"
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
                  name="yellow"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Yellow (s)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="4"
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
                  name="allRed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>All-Red (s)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="2"
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
            </div>

            {/* Recall Settings Section */}
            <div className="border rounded-lg p-4 bg-grey-50">
              <h4 className="text-sm font-medium text-grey-700 mb-3">Recall Settings</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vehRecallType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle Recall Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || "None"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select recall type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="None">None</SelectItem>
                          <SelectItem value="Min">Min (Minimum Green)</SelectItem>
                          <SelectItem value="Max">Max (Force to Max)</SelectItem>
                          <SelectItem value="Soft">Soft (Extend if Demand)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pedRecall"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3 bg-white">
                      <div className="space-y-0.5">
                        <FormLabel>Pedestrian Recall</FormLabel>
                        <p className="text-xs text-grey-500">
                          Automatically recall pedestrian phase each cycle
                        </p>
                      </div>
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
              </div>
            </div>

            <div className="flex justify-between space-x-3 border-t border-grey-200 pt-4">
              <div>
                {timing && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    className="flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Timing</span>
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
                  {isLoading ? "Saving..." : (timing ? "Save Changes" : "Create Timing")}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
