import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSignalSchema, type InsertSignal, type Signal } from "@shared/schema";
import { useSignals } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPicker } from "@/components/ui/map";
import { MapPin, Trash2 } from "lucide-react";

interface SignalModalProps {
  signal: Signal | null;
  onClose: () => void;
}

export default function SignalModal({ signal, onClose }: SignalModalProps) {
  const { agency } = useGTSSStore();
  const { toast } = useToast();
  const signalHooks = useSignals();

  const form = useForm<InsertSignal>({
    resolver: zodResolver(insertSignalSchema),
    defaultValues: {
      signalId: "",
      agencyId: agency?.agencyId || "",
      latitude: 39.8283,
      longitude: -98.5795,
    },
  });

  useEffect(() => {
    if (signal) {
      form.reset({
        signalId: signal.signalId,
        agencyId: signal.agencyId,
        latitude: signal.latitude,
        longitude: signal.longitude,
      });
    } else {
      form.reset({
        signalId: "",
        agencyId: agency?.agencyId || "",
        latitude: 39.8283,
        longitude: -98.5795,
      });
    }
  }, [signal, form, agency]);

  const onSubmit = async (data: InsertSignal) => {
    setIsLoading(true);
    try {
      if (signal) {
        signalHooks.update(signal.signalId, data);
        toast({
          title: "Success",
          description: "Signal updated successfully",
        });
      } else {
        signalHooks.save(data);
        toast({
          title: "Success",
          description: "Signal created successfully",
        });
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: signal ? "Failed to update signal" : "Failed to create signal",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const [isLoading, setIsLoading] = useState(false);

  // Calculate map center based on signal coordinates, then agency, then default
  const getMapCenter = (): [number, number] => {
    // If editing a signal, center on its coordinates
    if (signal && signal.latitude && signal.longitude) {
      return [signal.latitude, signal.longitude];
    }
    // Otherwise use agency coordinates if available
    if (agency?.latitude && agency?.longitude) {
      return [agency.latitude, agency.longitude];
    }
    return [39.8283, -98.5795]; // Default center of US
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-screen overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {signal ? "Edit Signal Location" : "Add Signal Location"}
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
                    <FormLabel>Signal ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional (e.g., SIG_001)" {...field} />
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

            </div>

            {/* Location Selection Section */}
            <div className="col-span-2 space-y-4">
              <h3 className="text-lg font-medium text-grey-800 border-b border-grey-200 pb-2">Intersection Location</h3>
              
              <div className="w-full">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium">Map Selection & Coordinates</span>
                </div>

                <div className="space-y-4">
                  <div className="text-sm text-grey-600 mb-3">
                    Click on the map to select the intersection location
                  </div>
                  <MapPicker
                    center={getMapCenter()}
                    selectedPosition={form.watch("latitude") !== undefined && form.watch("longitude") !== undefined ? [form.watch("latitude"), form.watch("longitude")] : undefined}
                    onLocationSelect={async (lat, lng) => {
                      form.setValue("latitude", lat);
                      form.setValue("longitude", lng);
                    }}
                    className="w-full"
                  />

                  
                  {/* Editable coordinate fields */}
                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border mt-3">
                    <FormField
                      control={form.control}
                      name="latitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-gray-600">Latitude *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              placeholder="39.8283"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              className="text-sm"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="longitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-gray-600">Longitude *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              placeholder="-98.5795"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              className="text-sm"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between space-x-3 pt-4 border-t">
              <div>
                {signal && (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={() => {
                      if (confirm("Are you sure you want to delete this signal? This action cannot be undone.")) {
                        signalHooks.delete(signal.signalId);
                        toast({
                          title: "Success",
                          description: "Signal deleted successfully",
                        });
                        onClose();
                      }
                    }}
                    className="flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Signal</span>
                  </Button>
                )}
              </div>
              <div className="flex space-x-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Saving..." : signal ? "Update Signal" : "Create Signal"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
