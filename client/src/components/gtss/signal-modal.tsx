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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPicker } from "@/components/ui/map";
import { X, MapPin, Edit3 } from "lucide-react";

interface SignalModalProps {
  signal: Signal | null;
  onClose: () => void;
}

export default function SignalModal({ signal, onClose }: SignalModalProps) {
  const { agency, addSignal, updateSignal } = useGTSSStore();
  const { toast } = useToast();
  const signalHooks = useSignals();

  const form = useForm<InsertSignal>({
    resolver: zodResolver(insertSignalSchema),
    defaultValues: {
      signalId: "",
      agencyId: agency?.agencyId || "",
      streetName1: "",
      streetName2: "",
      cntLat: 39.8283,
      cntLon: -98.5795,
      cabinetType: "",
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
        cabinetType: signal.cabinetType || "",
        cabinetLat: signal.cabinetLat || undefined,
        cabinetLon: signal.cabinetLon || undefined,
        hasBatteryBackup: signal.hasBatteryBackup || false,
        hasCctv: signal.hasCctv || false,
      });
    } else {
      form.reset({
        signalId: "",
        agencyId: agency?.agencyId || "",
        streetName1: "",
        streetName2: "",
        cntLat: agency?.agencyLat || 39.8283,
        cntLon: agency?.agencyLon || -98.5795,
        cabinetType: "",
        hasBatteryBackup: false,
        hasCctv: false,
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

  // Calculate map center based on agency coordinates or fallback
  const getMapCenter = (): [number, number] => {
    if (agency?.agencyLat && agency?.agencyLon) {
      return [agency.agencyLat, agency.agencyLon];
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
            </div>

            {/* Location Selection Section */}
            <div className="col-span-2 space-y-4">
              <h3 className="text-lg font-medium text-grey-800 border-b border-grey-200 pb-2">Intersection Location</h3>
              
              <Tabs defaultValue="map" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="map" className="text-sm">
                    <MapPin className="w-4 h-4 mr-2" />
                    Map Selection
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="text-sm">
                    <Edit3 className="w-4 h-4 mr-2" />
                    Manual Entry
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="map" className="space-y-4">
                  <div className="text-sm text-grey-600 mb-3">
                    Click on the map to select the intersection location
                  </div>
                  <MapPicker
                    center={getMapCenter()}
                    selectedPosition={form.watch("cntLat") && form.watch("cntLon") ? [form.watch("cntLat"), form.watch("cntLon")] : undefined}
                    onLocationSelect={async (lat, lng) => {
                      form.setValue("cntLat", lat);
                      form.setValue("cntLon", lng);
                      
                      // Try to auto-populate street names using reverse geocoding
                      try {
                        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
                        const data = await response.json();
                        
                        if (data.address) {
                          const streetName = data.address.road || data.address.street || "";
                          const intersectingStreet = data.address.neighbourhood || data.address.suburb || "";
                          
                          if (streetName) {
                            form.setValue("streetName1", streetName);
                          }
                          if (intersectingStreet && intersectingStreet !== streetName) {
                            form.setValue("streetName2", intersectingStreet);
                          }
                        }
                      } catch (error) {
                        console.log("Geocoding failed, manual entry required");
                      }
                    }}
                    className="w-full"
                  />
                  <div className="text-xs text-grey-500 flex items-center gap-4">
                    <span>Selected: {form.watch("cntLat").toFixed(6)}, {form.watch("cntLon").toFixed(6)}</span>
                  </div>
                </TabsContent>

                <TabsContent value="manual" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>
                </TabsContent>
              </Tabs>
            </div>



            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Saving..." : signal ? "Update Signal" : "Create Signal"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}