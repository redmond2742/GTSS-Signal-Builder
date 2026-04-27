import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertApproachSchema, type InsertApproach, type Approach } from "@shared/schema";
import { useApproaches } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MapContainer, Marker, Popup, Polyline, useMapEvents } from "react-leaflet";
import { Trash2, MapPin, Navigation } from "lucide-react";
import { getSignalDisplayName } from "@/lib/utils";
import MapTileLayers from "@/components/ui/map-tile-layers";

interface ApproachModalProps {
  approach: Approach | null;
  onClose: () => void;
  preSelectedSignalId?: string;
}

// Map click handler component
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function ApproachModal({ approach, onClose, preSelectedSignalId }: ApproachModalProps) {
  const { signals, approaches } = useGTSSStore();
  const { toast } = useToast();
  const approachHooks = useApproaches();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<InsertApproach>({
    resolver: zodResolver(insertApproachSchema),
    defaultValues: {
      approachId: "",
      signalId: preSelectedSignalId || "",
      streetName: "",
      compassBearing: undefined,
      postedSpeed: undefined,
    },
  });

  useEffect(() => {
    if (approach) {
      form.reset({
        approachId: approach.approachId,
        signalId: approach.signalId,
        streetName: approach.streetName,
        compassBearing: approach.compassBearing || undefined,
        postedSpeed: approach.postedSpeed || undefined,
      });
    }
  }, [approach, form]);

  const selectedSignalId = form.watch("signalId");
  const selectedSignal = signals.find(s => s.signalId === selectedSignalId);
  const compassBearing = form.watch("compassBearing");

  // Get unique street names from all approaches for autocomplete
  const uniqueStreetNames = useMemo(() => {
    const names = new Set<string>();
    approaches.forEach(a => {
      if (a.streetName && a.streetName.trim()) {
        names.add(a.streetName.trim());
      }
    });
    return Array.from(names).sort();
  }, [approaches]);

  // Calculate bearing for approach direction (direction vehicles travel TOWARD the intersection)
  // User clicks where traffic is coming FROM, we calculate the approach direction (opposite)
  const handleMapClick = (clickLat: number, clickLng: number) => {
    if (!selectedSignal || !selectedSignal.latitude || !selectedSignal.longitude) return;

    const signalLat = selectedSignal.latitude;
    const signalLng = selectedSignal.longitude;

    // Calculate bearing from clicked point TO the signal (approach direction)
    const dLng = (signalLng - clickLng) * Math.PI / 180;
    const lat1 = clickLat * Math.PI / 180;
    const lat2 = signalLat * Math.PI / 180;

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;  // Normalize to 0-360

    form.setValue('compassBearing', Math.round(bearing));
  };

  // Calculate end point for bearing visualization line (shows where traffic comes FROM)
  const getBearingEndPoint = () => {
    if (!selectedSignal || !selectedSignal.latitude || !selectedSignal.longitude || !compassBearing) {
      return null;
    }

    const distance = 0.002; // degrees (~200m at equator)
    // Show line in opposite direction of bearing (where traffic comes FROM)
    const oppositeBearing = (compassBearing + 180) % 360;
    const bearingRad = (oppositeBearing * Math.PI) / 180;
    const endLat = selectedSignal.latitude + distance * Math.cos(bearingRad);
    const endLon = selectedSignal.longitude + distance * Math.sin(bearingRad);

    return { lat: endLat, lng: endLon };
  };

  const getBearingDirection = (bearing: number | null | undefined) => {
    if (bearing === undefined || bearing === null) return '';
    if (bearing >= 337.5 || bearing < 22.5) return 'N';
    if (bearing >= 22.5 && bearing < 67.5) return 'NE';
    if (bearing >= 67.5 && bearing < 112.5) return 'E';
    if (bearing >= 112.5 && bearing < 157.5) return 'SE';
    if (bearing >= 157.5 && bearing < 202.5) return 'S';
    if (bearing >= 202.5 && bearing < 247.5) return 'SW';
    if (bearing >= 247.5 && bearing < 292.5) return 'W';
    if (bearing >= 292.5 && bearing < 337.5) return 'NW';
    return '';
  };

  const onSubmit = async (data: InsertApproach) => {
    setIsLoading(true);
    try {
      if (approach) {
        approachHooks.update(approach.id, data);
        toast({
          title: "Success",
          description: "Approach updated successfully",
        });
      } else {
        approachHooks.save(data);
        toast({
          title: "Success",
          description: "Approach created successfully",
        });
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: approach ? "Failed to update approach" : "Failed to create approach",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    if (approach && confirm("Are you sure you want to delete this approach?")) {
      approachHooks.delete(approach.id);
      onClose();
    }
  };

  const bearingEndPoint = getBearingEndPoint();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-screen overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {approach ? "Edit Approach" : "Add Approach"}
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
                            {getSignalDisplayName(signal, approaches)}
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
                name="approachId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approach ID</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Auto-generated if left blank"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="streetName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Name *</FormLabel>
                    <FormControl>
                      <>
                        <Input
                          placeholder="e.g., Main Street NB"
                          list="street-name-suggestions"
                          autoComplete="off"
                          {...field}
                        />
                        <datalist id="street-name-suggestions">
                          {uniqueStreetNames.map((name) => (
                            <option key={name} value={name} />
                          ))}
                        </datalist>
                      </>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="postedSpeed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Posted Speed (mph)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="100"
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
                name="compassBearing"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className="flex items-center gap-2">
                      <Navigation className="w-4 h-4" />
                      Compass Bearing (degrees)
                      {field.value !== undefined && (
                        <span className="text-sm font-normal text-blue-600">
                          {field.value}° {getBearingDirection(field.value)}
                        </span>
                      )}
                    </FormLabel>
                    <div className="flex gap-4">
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="360"
                          placeholder="0-360"
                          className="w-32"
                          {...field}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(value ? parseInt(value) : undefined);
                          }}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <p className="text-xs text-grey-500 self-center">
                        Click on the map below to set the direction of travel for this approach
                      </p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Map section with clickable bearing selector */}
            {selectedSignalId && (
              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="text-lg font-medium mb-3 flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                  Click Map to Set Approach Direction
                </h3>
                <p className="text-sm text-grey-600 mb-3">
                  Click anywhere on the map to define the direction vehicles travel on this approach.
                  The bearing angle will be calculated automatically.
                </p>
                <div className="h-72 rounded-lg overflow-hidden border">
                  {selectedSignal && selectedSignal.latitude && selectedSignal.longitude ? (
                    <MapContainer
                      center={[selectedSignal.latitude, selectedSignal.longitude]}
                      zoom={17}
                      style={{ height: "100%", width: "100%", cursor: "crosshair" }}
                    >
                      <MapTileLayers />
                      <MapClickHandler onMapClick={handleMapClick} />
                      <Marker position={[selectedSignal.latitude, selectedSignal.longitude]}>
                        <Popup>
                          <div className="text-center">
                            <div className="font-medium">{selectedSignal.signalId}</div>
                            <div className="text-xs text-gray-600">
                              {selectedSignal.streetName1} & {selectedSignal.streetName2}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                      {bearingEndPoint && (
                        <Polyline
                          positions={[
                            [selectedSignal.latitude, selectedSignal.longitude],
                            [bearingEndPoint.lat, bearingEndPoint.lng]
                          ]}
                          color="#2563eb"
                          weight={4}
                          opacity={0.8}
                        />
                      )}
                    </MapContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-grey-100">
                      <p className="text-grey-500">Signal location not available</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between space-x-3 border-t border-grey-200 pt-4">
              <div>
                {approach && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    className="flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Approach</span>
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
                  {isLoading ? "Saving..." : (approach ? "Save Changes" : "Create Approach")}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
