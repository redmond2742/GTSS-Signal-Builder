import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertApproachSchema, type Approach, type InsertApproach, type Signal } from "@shared/schema";
import { useApproaches } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MapContainer, Marker, Polyline, TileLayer, useMapEvents } from "react-leaflet";
import { Trash2 } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface ApproachModalProps {
  approach: Approach | null;
  onClose: () => void;
}

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function calculateBearing(start: L.LatLng, end: L.LatLng): number {
  const startLat = start.lat * (Math.PI / 180);
  const startLng = start.lng * (Math.PI / 180);
  const endLat = end.lat * (Math.PI / 180);
  const endLng = end.lng * (Math.PI / 180);
  const dLng = endLng - startLng;
  const y = Math.sin(dLng) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
  let bearing = Math.atan2(y, x) * (180 / Math.PI);
  bearing = (bearing + 360) % 360;
  return Math.round(bearing);
}

function formatCompassBearing(bearing: number): string {
  return `${bearing}`;
}

export default function ApproachModal({ approach, onClose }: ApproachModalProps) {
  const { signals } = useGTSSStore();
  const { toast } = useToast();
  const approachHooks = useApproaches();
  const [isLoading, setIsLoading] = useState(false);
  const [bearingLine, setBearingLine] = useState<[number, number] | null>(null);

  const form = useForm<InsertApproach>({
    resolver: zodResolver(insertApproachSchema),
    defaultValues: {
      approachId: "",
      signalId: "",
      streetName: "",
      compassBearing: "",
      postedSpeed: null,
    },
  });

  const selectedSignalId = form.watch("signalId");
  const selectedSignal = useMemo(
    () => signals.find((signal) => signal.signalId === selectedSignalId),
    [signals, selectedSignalId]
  );

  useEffect(() => {
    if (approach) {
      form.reset({
        approachId: approach.approachId,
        signalId: approach.signalId,
        streetName: approach.streetName,
        compassBearing: approach.compassBearing,
        postedSpeed: approach.postedSpeed ?? null,
      });
    } else {
      form.reset({
        approachId: "",
        signalId: signals[0]?.signalId ?? "",
        streetName: "",
        compassBearing: "",
        postedSpeed: null,
      });
    }
  }, [approach, form, signals]);

  useEffect(() => {
    setBearingLine(null);
  }, [selectedSignalId]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (selectedSignal?.latitude != null && selectedSignal?.longitude != null) {
      return [selectedSignal.latitude, selectedSignal.longitude];
    }
    return [39.8283, -98.5795];
  }, [selectedSignal]);

  const handleBearingSelect = (signal: Signal, endPoint: L.LatLng) => {
    const bearing = calculateBearing(L.latLng(signal.latitude, signal.longitude), endPoint);
    const compassLabel = formatCompassBearing(bearing);
    form.setValue("compassBearing", compassLabel, { shouldDirty: true });
    setBearingLine([endPoint.lat, endPoint.lng]);
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
      toast({
        title: "Success",
        description: "Approach deleted successfully",
      });
      onClose();
    }
  };

  if (signals.length === 0) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Approach</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-grey-600">
            <p>No signals are configured yet.</p>
            <p>Add a signal first so approaches can be assigned correctly.</p>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  function BearingSelector({ signal }: { signal: Signal }) {
    useMapEvents({
      click(event) {
        handleBearingSelect(signal, event.latlng);
      },
    });
    return null;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{approach ? "Edit Approach" : "Add Approach"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="approachId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approach ID *</FormLabel>
                    <FormControl>
                      <Input placeholder="APP_001" {...field} />
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select signal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {signals.map((signal) => (
                          <SelectItem key={signal.signalId} value={signal.signalId}>
                            {signal.signalId}
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
                name="streetName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Main St" {...field} />
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
                    <FormLabel>Compass Bearing *</FormLabel>
                    <FormControl>
                      <Input placeholder="135" {...field} />
                    </FormControl>
                    <FormDescription>
                      Click on the map to draw a direction line from the signal and auto-fill the bearing.
                    </FormDescription>
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
                        step="1"
                        placeholder="35"
                        value={field.value ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          field.onChange(value === "" ? null : parseFloat(value));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {selectedSignal && (
              <div className="space-y-3 rounded-lg border border-grey-200 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-grey-700">Approach Direction Map</p>
                  <p className="text-xs text-grey-500">
                    Click anywhere on the map to set the approach direction from the signal location.
                  </p>
                </div>
                <div className="h-64 overflow-hidden rounded-md border border-grey-200">
                  <MapContainer
                    center={mapCenter}
                    zoom={16}
                    key={`approach-bearing-${mapCenter[0]}-${mapCenter[1]}`}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={mapCenter} />
                    <BearingSelector signal={selectedSignal} />
                    {bearingLine && (
                      <Polyline
                        positions={[mapCenter, bearingLine]}
                        color="#2563eb"
                        weight={4}
                        opacity={0.8}
                      />
                    )}
                  </MapContainer>
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
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Saving..." : approach ? "Save Changes" : "Create Approach"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
