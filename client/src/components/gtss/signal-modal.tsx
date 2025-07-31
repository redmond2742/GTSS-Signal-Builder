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
                    center={(() => {
                      if (!agency) return [39.8283, -98.5795]; // Center of US
                      
                      // First try to geocode agency name for more accurate location
                      const agencyName = agency.agencyName.toLowerCase();
                      
                      // Major city mappings based on agency name patterns
                      if (agencyName.includes('new york') || agencyName.includes('nyc')) return [40.7589, -73.9851];
                      if (agencyName.includes('los angeles') || agencyName.includes('la ')) return [34.0522, -118.2437];
                      if (agencyName.includes('chicago')) return [41.8781, -87.6298];
                      if (agencyName.includes('houston')) return [29.7604, -95.3698];
                      if (agencyName.includes('phoenix')) return [33.4484, -112.0740];
                      if (agencyName.includes('philadelphia')) return [39.9526, -75.1652];
                      if (agencyName.includes('san antonio')) return [29.4241, -98.4936];
                      if (agencyName.includes('san diego')) return [32.7157, -117.1611];
                      if (agencyName.includes('dallas')) return [32.7767, -96.7970];
                      if (agencyName.includes('san jose')) return [37.3382, -121.8863];
                      if (agencyName.includes('austin')) return [30.2672, -97.7431];
                      if (agencyName.includes('seattle')) return [47.6062, -122.3321];
                      if (agencyName.includes('denver')) return [39.7392, -104.9903];
                      if (agencyName.includes('washington')) return [38.9072, -77.0369];
                      if (agencyName.includes('boston')) return [42.3601, -71.0589];
                      if (agencyName.includes('atlanta')) return [33.7490, -84.3880];
                      if (agencyName.includes('miami')) return [25.7617, -80.1918];
                      if (agencyName.includes('orlando')) return [28.5383, -81.3792];
                      if (agencyName.includes('tampa')) return [27.9506, -82.4572];
                      if (agencyName.includes('san francisco') || agencyName.includes('sf')) return [37.7749, -122.4194];
                      if (agencyName.includes('portland')) return [45.5152, -122.6784];
                      if (agencyName.includes('las vegas')) return [36.1699, -115.1398];
                      if (agencyName.includes('baltimore')) return [39.2904, -76.6122];
                      if (agencyName.includes('milwaukee')) return [43.0389, -87.9065];
                      if (agencyName.includes('detroit')) return [42.3314, -83.0458];
                      if (agencyName.includes('nashville')) return [36.1627, -86.7816];
                      if (agencyName.includes('memphis')) return [35.1495, -90.0490];
                      if (agencyName.includes('louisville')) return [38.2527, -85.7585];
                      if (agencyName.includes('oklahoma')) return [35.4676, -97.5164];
                      if (agencyName.includes('charlotte')) return [35.2271, -80.8431];
                      if (agencyName.includes('jacksonville')) return [30.3322, -81.6557];
                      if (agencyName.includes('indianapolis')) return [39.7684, -86.1581];
                      if (agencyName.includes('columbus')) return [39.9612, -82.9988];
                      if (agencyName.includes('fort worth')) return [32.7555, -97.3308];
                      if (agencyName.includes('el paso')) return [31.7619, -106.4850];
                      
                      // Enhanced geographic keyword matching
                      if (agencyName.includes('california') || agencyName.includes('ca')) return [36.7783, -119.4179];
                      if (agencyName.includes('texas') || agencyName.includes('tx')) return [31.9686, -99.9018];
                      if (agencyName.includes('florida') || agencyName.includes('fl')) return [27.7663, -82.6404];
                      if (agencyName.includes('new york') || agencyName.includes('ny')) return [42.1657, -74.9481];
                      if (agencyName.includes('pennsylvania') || agencyName.includes('pa')) return [41.2033, -77.1945];
                      if (agencyName.includes('illinois') || agencyName.includes('il')) return [40.3363, -89.0022];
                      if (agencyName.includes('ohio') || agencyName.includes('oh')) return [40.3888, -82.7649];
                      if (agencyName.includes('georgia') || agencyName.includes('ga')) return [33.0406, -83.6431];
                      if (agencyName.includes('north carolina') || agencyName.includes('nc')) return [35.5397, -79.8431];
                      if (agencyName.includes('michigan') || agencyName.includes('mi')) return [43.3266, -84.5361];
                      if (agencyName.includes('virginia') || agencyName.includes('va')) return [37.7693, -78.2057];
                      if (agencyName.includes('washington') || agencyName.includes('wa')) return [47.0379, -120.8015];
                      if (agencyName.includes('arizona') || agencyName.includes('az')) return [33.7298, -111.4312];
                      if (agencyName.includes('massachusetts') || agencyName.includes('ma')) return [42.2081, -71.0275];
                      if (agencyName.includes('tennessee') || agencyName.includes('tn')) return [35.7478, -86.7123];
                      if (agencyName.includes('indiana') || agencyName.includes('in')) return [39.8494, -86.2583];
                      if (agencyName.includes('missouri') || agencyName.includes('mo')) return [38.4561, -92.2884];
                      if (agencyName.includes('maryland') || agencyName.includes('md')) return [39.0639, -76.8021];
                      if (agencyName.includes('wisconsin') || agencyName.includes('wi')) return [44.2619, -89.6165];
                      if (agencyName.includes('minnesota') || agencyName.includes('mn')) return [45.6945, -93.9002];
                      if (agencyName.includes('colorado') || agencyName.includes('co')) return [39.0598, -105.3111];
                      if (agencyName.includes('alabama') || agencyName.includes('al')) return [32.3617, -86.7904];
                      if (agencyName.includes('louisiana') || agencyName.includes('la')) return [31.1695, -91.8678];
                      if (agencyName.includes('kentucky') || agencyName.includes('ky')) return [37.6681, -84.6701];
                      if (agencyName.includes('oregon') || agencyName.includes('or')) return [44.5722, -122.0709];
                      if (agencyName.includes('oklahoma') || agencyName.includes('ok')) return [35.5653, -96.9289];
                      if (agencyName.includes('connecticut') || agencyName.includes('ct')) return [41.5978, -72.7554];
                      if (agencyName.includes('utah') || agencyName.includes('ut')) return [40.1500, -111.8624];
                      if (agencyName.includes('iowa') || agencyName.includes('ia')) return [42.0115, -93.2105];
                      if (agencyName.includes('nevada') || agencyName.includes('nv')) return [38.3135, -117.0554];
                      if (agencyName.includes('arkansas') || agencyName.includes('ar')) return [34.9697, -92.3731];
                      if (agencyName.includes('mississippi') || agencyName.includes('ms')) return [32.7767, -89.6678];
                      if (agencyName.includes('kansas') || agencyName.includes('ks')) return [38.5266, -96.7265];
                      if (agencyName.includes('new mexico') || agencyName.includes('nm')) return [34.8405, -106.2485];
                      if (agencyName.includes('nebraska') || agencyName.includes('ne')) return [41.1254, -98.2681];
                      if (agencyName.includes('west virginia') || agencyName.includes('wv')) return [38.4912, -80.9540];
                      if (agencyName.includes('idaho') || agencyName.includes('id')) return [44.2405, -114.4788];
                      if (agencyName.includes('hawaii') || agencyName.includes('hi')) return [21.0943, -157.4983];
                      if (agencyName.includes('new hampshire') || agencyName.includes('nh')) return [43.4525, -71.5639];
                      if (agencyName.includes('maine') || agencyName.includes('me')) return [44.6939, -69.3819];
                      if (agencyName.includes('rhode island') || agencyName.includes('ri')) return [41.6809, -71.5118];
                      if (agencyName.includes('montana') || agencyName.includes('mt')) return [47.0527, -110.2140];
                      if (agencyName.includes('delaware') || agencyName.includes('de')) return [39.3185, -75.5071];
                      if (agencyName.includes('south dakota') || agencyName.includes('sd')) return [44.2998, -99.4388];
                      if (agencyName.includes('north dakota') || agencyName.includes('nd')) return [47.5289, -99.7840];
                      if (agencyName.includes('alaska') || agencyName.includes('ak')) return [61.2181, -149.9003];
                      if (agencyName.includes('vermont') || agencyName.includes('vt')) return [44.0459, -72.7107];
                      if (agencyName.includes('wyoming') || agencyName.includes('wy')) return [42.7559, -107.3025];
                      
                      // Fallback to timezone-based coordinates
                      const timezoneCoords: Record<string, [number, number]> = {
                        "America/New_York": [40.7589, -73.9851],
                        "America/Chicago": [41.8781, -87.6298],
                        "America/Denver": [39.7392, -104.9903],
                        "America/Los_Angeles": [34.0522, -118.2437],
                        "America/Phoenix": [33.4484, -112.0740],
                        "America/Anchorage": [61.2181, -149.9003],
                        "Pacific/Honolulu": [21.3099, -157.8581],
                      };
                      
                      return timezoneCoords[agency.agencyTimezone] || [39.8283, -98.5795];
                    })()}
                    selectedPosition={form.watch("cntLat") && form.watch("cntLon") ? [form.watch("cntLat"), form.watch("cntLon")] : undefined}
                    onLocationSelect={async (lat, lng) => {
                      form.setValue("cntLat", lat);
                      form.setValue("cntLon", lng);
                      
                      // Auto-populate street names using reverse geocoding
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

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
