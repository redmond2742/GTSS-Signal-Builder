import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { insertSignalSchema, type InsertSignal, type Signal } from "@shared/schema";
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

interface SignalModalProps {
  signal: Signal | null;
  onClose: () => void;
}

export default function SignalModal({ signal, onClose }: SignalModalProps) {
  const { agency, addSignal, updateSignal } = useGTSSStore();
  const { toast } = useToast();

  const createSignalMutation = useMutation({
    mutationFn: async (data: InsertSignal) => {
      const response = await apiRequest("POST", "/api/signals", data);
      return response.json();
    },
    onSuccess: (data: Signal) => {
      addSignal(data);
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      toast({
        title: "Success",
        description: "Signal created successfully",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create signal",
        variant: "destructive",
      });
    },
  });

  const updateSignalMutation = useMutation({
    mutationFn: async (data: InsertSignal) => {
      const response = await apiRequest("PUT", `/api/signals/${signal?.signalId}`, data);
      return response.json();
    },
    onSuccess: (data: Signal) => {
      updateSignal(signal!.signalId, data);
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      toast({
        title: "Success",
        description: "Signal updated successfully",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update signal",
        variant: "destructive",
      });
    },
  });

  const form = useForm<InsertSignal>({
    resolver: zodResolver(insertSignalSchema),
    defaultValues: {
      signalId: "",
      agencyId: agency?.agencyId || "",
      streetName1: "",
      streetName2: "",
      cntLat: 0,
      cntLon: 0,
      controlType: "Actuated",
      cabinetType: "",
      cabinetLat: undefined,
      cabinetLon: undefined,
      hasBatteryBackup: false,
      hasCctv: false,
    },
  });

  useEffect(() => {
    if (signal) {
      form.reset({
        signalId: signal.signalId,
        agencyId: signal.agencyId,
        streetName1: signal.streetName1,
        streetName2: signal.streetName2,
        cntLat: signal.cntLat,
        cntLon: signal.cntLon,
        controlType: signal.controlType,
        cabinetType: signal.cabinetType || "",
        cabinetLat: signal.cabinetLat || undefined,
        cabinetLon: signal.cabinetLon || undefined,
        hasBatteryBackup: signal.hasBatteryBackup,
        hasCctv: signal.hasCctv,
      });
    } else {
      form.reset({
        signalId: "",
        agencyId: agency?.agencyId || "",
        streetName1: "",
        streetName2: "",
        cntLat: 0,
        cntLon: 0,
        controlType: "Actuated",
        cabinetType: "",
        cabinetLat: undefined,
        cabinetLon: undefined,
        hasBatteryBackup: false,
        hasCctv: false,
      });
    }
  }, [signal, agency, form]);

  const onSubmit = (data: InsertSignal) => {
    if (signal) {
      updateSignalMutation.mutate(data);
    } else {
      createSignalMutation.mutate(data);
    }
  };

  const isLoading = createSignalMutation.isPending || updateSignalMutation.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-screen overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            {signal ? "Edit Signal Location" : "Add Signal Location"}
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
                name="signalId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Signal ID *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., SIG_001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="agencyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agency ID *</FormLabel>
                    <FormControl>
                      <Input {...field} disabled />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="streetName1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Name 1 *</FormLabel>
                    <FormControl>
                      <Input placeholder="Main Street" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="streetName2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Name 2 *</FormLabel>
                    <FormControl>
                      <Input placeholder="First Avenue" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cntLat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Center Latitude *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="40.7589"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cntLon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Center Longitude *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="-73.9851"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="controlType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Control Type *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select control type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Actuated">Actuated</SelectItem>
                        <SelectItem value="Pre-timed">Pre-timed</SelectItem>
                        <SelectItem value="Adaptive">Adaptive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cabinetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cabinet Type</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 332, 336" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cabinetLat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cabinet Latitude</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="40.7589"
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
                name="cabinetLon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cabinet Longitude</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="-73.9851"
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
                name="hasBatteryBackup"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-3">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Has Battery Backup</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hasCctv"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-3">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Has CCTV</FormLabel>
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
                {isLoading ? "Saving..." : (signal ? "Save Changes" : "Create Signal")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
