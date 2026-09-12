import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import MapTileLayers from "@/components/ui/map-tile-layers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { getSignalDisplayName, useDetectors, useGTSSStore, useMapScrollZoom } from "gtss";
import { type Detector, type InsertDetector, insertDetectorSchema } from "gtss/schema";
import { MapPin, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { MapContainer, Marker, Popup } from "react-leaflet";
import { approachColorFor } from "./approach-colors";
// Removed image import for simplified interface

const compassDirections = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const bearingToDirection = (bearing?: number | null) => {
  if (bearing === null || bearing === undefined || Number.isNaN(bearing)) {
    return "";
  }
  const normalized = ((bearing % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % compassDirections.length;
  return compassDirections[index];
};

const formatPurposeForDescription = (purpose?: string) => {
  if (!purpose) {
    return "";
  }
  if (purpose === "Stop Bar") {
    return "Stopbar";
  }
  return purpose;
};

const buildDetectorDescription = (direction: string, purpose: string, lane: string) => {
  const parts: string[] = [];
  if (direction) {
    parts.push(direction);
  }
  if (purpose) {
    parts.push(purpose);
  }
  if (lane) {
    parts.push(`Lane ${lane}`);
  }
  return parts.join(" ").trim();
};

const incrementLastNumber = (value: string) => {
  const match = value.match(/(\d+)(?!.*\d)/);
  if (!match) {
    return value;
  }
  const nextValue = String(parseInt(match[1], 10) + 1).padStart(match[1].length, "0");
  return value.replace(/(\d+)(?!.*\d)/, nextValue);
};

// Radix Select can't carry an empty string as a value, so "no phase" / "no
// approach" ride these sentinels and are converted to null on the way into the
// form. A detector without a phase — a count detector, typically — is located
// by its approach and distance from the stop bar instead.
const NO_PHASE = "__none__";
const NO_APPROACH = "__none__";

const incrementAllNumbers = (value: string) => {
  if (!value) {
    return value;
  }
  return value.replace(/\d+/g, (match) => String(parseInt(match, 10) + 1));
};

interface DetectorModalProps {
  detector: Detector | null;
  onClose: () => void;
  preSelectedSignalId?: string;
}

export default function DetectorModal({
  detector,
  onClose,
  preSelectedSignalId,
}: DetectorModalProps) {
  const mapScrollZoom = useMapScrollZoom();
  const { signals, phases, approaches, agency } = useGTSSStore();
  const { toast } = useToast();
  const detectorHooks = useDetectors();
  // const [, setSelectedZone] = useState<'stopbar' | 'advance' | 'count' | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState<string>(
    detector?.signalId || preSelectedSignalId || "",
  );
  const [, setLockedValues] = useState({ length: false, stopbarSetback: false });
  const [isDescriptionDirty, setIsDescriptionDirty] = useState(Boolean(detector?.description));
  const [hasCreatedDetector, setHasCreatedDetector] = useState(false);

  const form = useForm<InsertDetector>({
    resolver: zodResolver(insertDetectorSchema),
    defaultValues: {
      signalId: preSelectedSignalId || "",
      channel: "",
      phase: 2,
      description: "",
      purpose: "Stop Bar",
      vehicleType: "Vehicle",
      lane: "1",
      technologyType: "Inductance Loop",
      length: undefined,
      stopbarSetbackDist: 0,
      approachId: null,
    },
  });

  const isMetric = agency?.agencyIsMetric ?? false;
  //  const speedUnit = isMetric ? "km/h" : "mph";
  const lengthUnit = isMetric ? "m" : "feet";

  useEffect(() => {
    if (detector) {
      form.reset({
        signalId: detector.signalId,
        channel: detector.channel,
        phase: detector.phase,
        description: detector.description ?? "",
        purpose: detector.purpose,
        vehicleType: detector.vehicleType ?? "",
        lane: detector.lane ?? "",
        technologyType: detector.technologyType,
        length: detector.length ?? undefined,
        stopbarSetbackDist: detector.stopbarSetbackDist ?? undefined,
        approachId: detector.approachId ?? null,
      });
      setSelectedSignalId(detector.signalId);
      setIsDescriptionDirty(Boolean(detector.description));
      setHasCreatedDetector(false);
    } else {
      setIsDescriptionDirty(false);
      setHasCreatedDetector(false);
    }
  }, [detector, form]);

  // Update available phases when signal ID changes
  //const availablePhases = phases.filter(phase => phase.signalId === selectedSignalId);
  const isSignalSelected = selectedSignalId && selectedSignalId !== "";

  // Handle signal ID change - update map location
  const handleSignalChange = (signalId: string) => {
    setSelectedSignalId(signalId);
    form.setValue("signalId", signalId);
  };
  /*
  const handleZoneClick = (zone: 'stopbar' | 'advance' | 'count', event: React.MouseEvent) => {
    event.preventDefault();
    setSelectedZone(zone);

    // Auto-configure detector based on zone
    if (zone === 'stopbar') {
      form.setValue('purpose', 'Stop Bar');
      if (!lockedValues.stopbarSetback) form.setValue('stopbarSetbackDist', 0);
      if (!lockedValues.length) form.setValue('length', isMetric ? 1.8 : 6.0);
    } else if (zone === 'advance') {
      form.setValue('purpose', 'Advanced Loop');
      if (!lockedValues.stopbarSetback) form.setValue('stopbarSetbackDist', isMetric ? 76.0 : 250.0);
      if (!lockedValues.length) form.setValue('length', isMetric ? 7.6 : 25.0);
    } else {
      form.setValue('purpose', 'Count Detector');
      // Count detectors report volume rather than calling a phase, so drop the
      // phase and let the approach locate them.
      form.setValue('phase', null);
      if (!lockedValues.stopbarSetback) form.setValue('stopbarSetbackDist', isMetric ? 152.0 : 500.0);
      if (!lockedValues.length) form.setValue('length', isMetric ? 1.8 : 6.0);
    }
  };*/

  const onSubmit = async (data: InsertDetector) => {
    setIsLoading(true);
    try {
      if (detector) {
        detectorHooks.update(detector.id, data);
        toast({
          title: "Success",
          description: "Detector updated successfully",
        });
        onClose();
      } else {
        detectorHooks.save(data);
        toast({
          title: "Success",
          description: "Detector created successfully",
        });
        const nextChannel = incrementLastNumber(data.channel);
        const nextLane = incrementAllNumbers(data.lane ?? "");
        form.setValue("channel", nextChannel);
        form.setValue("lane", nextLane);
        setHasCreatedDetector(true);
      }
    } catch {
      toast({
        title: "Error",
        description: detector ? "Failed to update detector" : "Failed to create detector",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    if (detector && confirm("Are you sure you want to delete this detector?")) {
      detectorHooks.delete(detector.id);
      toast({
        title: "Success",
        description: "Detector deleted successfully",
      });
      onClose();
    }
  };

  const handleQuickDuplicate = form.handleSubmit(async (data: InsertDetector) => {
    setIsLoading(true);
    try {
      detectorHooks.save(data);
      toast({
        title: "Success",
        description: "Adjacent lane detector created successfully",
      });
      const nextChannel = incrementLastNumber(data.channel);
      const nextLane = incrementAllNumbers(data.lane ?? "");
      form.setValue("channel", nextChannel);
      form.setValue("lane", nextLane);
    } catch {
      toast({
        title: "Error",
        description: "Failed to create adjacent lane detector",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const watchedPurpose = form.watch("purpose");
  const watchedPhase = form.watch("phase");
  const watchedLane = form.watch("lane");
  const watchedApproachId = form.watch("approachId");

  useEffect(() => {
    if (isDescriptionDirty) {
      return;
    }
    const selectedPhase = phases.find(
      (phase) => phase.signalId === selectedSignalId && phase.phase === watchedPhase,
    );
    // Bearing comes from the detector's own approach when it has one (the only
    // source for a phase-less count detector), otherwise from the phase's.
    const approachId = watchedApproachId || selectedPhase?.approachId || null;
    const approach = approachId ? approaches.find((a) => a.approachId === approachId) : null;
    const direction = bearingToDirection(approach?.compassBearing ?? null);
    const formattedPurpose = formatPurposeForDescription(watchedPurpose ?? "");
    const laneValue = watchedLane?.toString().trim() ?? "";
    const description = buildDetectorDescription(direction, formattedPurpose, laneValue);
    form.setValue("description", description);
  }, [
    form,
    isDescriptionDirty,
    phases,
    approaches,
    selectedSignalId,
    watchedApproachId,
    watchedLane,
    watchedPhase,
    watchedPurpose,
  ]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-screen overflow-auto">
        <DialogHeader>
          <DialogTitle>{detector ? "Edit Detector" : "Add Detector"}</DialogTitle>
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
                        handleSignalChange(value);
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
                            {getSignalDisplayName(signal, approaches)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Detector Type Quick Setup removed per user request */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Detector Channel *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., CH_01" {...field} disabled={!isSignalSelected} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(() => {
                const selectedSignalId = form.watch("signalId");
                const signalPhases = selectedSignalId
                  ? phases
                      .filter((p) => p.signalId === selectedSignalId)
                      .sort((a, b) => a.phase - b.phase)
                  : [];

                if (!selectedSignalId) {
                  return (
                    <div className="p-3 bg-warning-50 border border-warning-200 rounded-md">
                      <p className="text-sm text-warning-700">
                        Please select a signal first to see available phases and approaches.
                      </p>
                    </div>
                  );
                }

                return (
                  <FormField
                    control={form.control}
                    name="phase"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phase</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(value === NO_PHASE ? null : parseInt(value))
                          }
                          value={field.value == null ? NO_PHASE : field.value.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select phase" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NO_PHASE}>No phase (count detector)</SelectItem>
                            {signalPhases.map((phase) => {
                              const approach = phase.approachId
                                ? approaches.find((a) => a.approachId === phase.approachId)
                                : null;
                              const direction = bearingToDirection(
                                approach?.compassBearing ?? null,
                              );
                              const bearingLabel = direction ? ` (${direction})` : "";
                              return (
                                <SelectItem key={phase.id} value={phase.phase.toString()}>
                                  Phase {phase.phase} - {phase.movementType}
                                  {bearingLabel}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-grey-500">
                          {signalPhases.length === 0
                            ? "No phases configured for this signal — leave unassigned and pick an approach below."
                            : "Optional. Leave unassigned for detectors that don't call a phase."}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                );
              })()}

              {/* Approach — the only thing locating a detector that has no
                  phase, and an override for one that does. */}
              <FormField
                control={form.control}
                name="approachId"
                render={({ field }) => {
                  const signalApproaches = approaches.filter(
                    (a) => a.signalId === selectedSignalId,
                  );
                  return (
                    <FormItem>
                      <FormLabel>Approach</FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === NO_APPROACH ? null : value)
                        }
                        value={field.value || NO_APPROACH}
                        disabled={!isSignalSelected}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select approach" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_APPROACH}>None</SelectItem>
                          {signalApproaches.map((approach) => {
                            const direction = bearingToDirection(approach.compassBearing);
                            // Same swatch color the approach map draws this leg in.
                            const color = approachColorFor(signalApproaches, approach.approachId);
                            const name = [approach.approachId, approach.streetName]
                              .filter(Boolean)
                              .join(" · ");
                            const bearingLabel =
                              approach.compassBearing != null
                                ? ` (${approach.compassBearing}°${direction ? ` ${direction}` : ""})`
                                : "";
                            return (
                              <SelectItem key={approach.approachId} value={approach.approachId}>
                                <span className="flex items-center gap-2">
                                  <span
                                    className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                    style={{ backgroundColor: color ?? "transparent" }}
                                  />
                                  <span>
                                    {name}
                                    {bearingLabel}
                                  </span>
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-grey-500">
                        {signalApproaches.length === 0
                          ? "No approaches configured for this signal yet."
                          : "Optional. Required to place a detector that has no phase."}
                      </p>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purpose *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={!isSignalSelected}
                    >
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
                name="technologyType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Technology Type *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={!isSignalSelected}
                    >
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
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value || undefined}
                      disabled={!isSignalSelected}
                    >
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
                        <SelectItem value="Bike">Bike</SelectItem>
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
                    <FormLabel>Lane Number</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="e.g., 1-3"
                        {...field}
                        disabled={!isSignalSelected}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <p className="text-xs text-gray-500">Example: 1-3 for multiple lanes.</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="length"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{`Length (${lengthUnit})`}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="6.0"
                        {...field}
                        disabled={!isSignalSelected}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value ? parseFloat(value) : undefined);
                          // Lock the value when manually changed
                          setLockedValues((prev) => ({ ...prev, length: true }));
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
                name="stopbarSetbackDist"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{`Stopbar Setback (${lengthUnit})`}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        {...field}
                        disabled={!isSignalSelected}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value !== "" ? parseFloat(value) : undefined);
                          // Lock the value when manually changed
                          setLockedValues((prev) => ({ ...prev, stopbarSetbackDist: true }));
                        }}
                        value={field.value !== null && field.value !== undefined ? field.value : ""}
                      />
                    </FormControl>
                    <p className="text-xs text-grey-500">
                      Distance from the stop bar: positive approaching it, negative past it.
                    </p>
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
                      <Input
                        placeholder="Detector description"
                        {...field}
                        disabled={!isSignalSelected}
                        value={field.value || ""}
                        onChange={(event) => {
                          setIsDescriptionDirty(true);
                          field.onChange(event);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Map section */}
            {isSignalSelected && (
              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="text-lg font-medium mb-3 flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                  Signal Location
                </h3>
                <div className="h-64 rounded-lg overflow-hidden border">
                  {(() => {
                    const selectedSignal = signals.find((s) => s.signalId === selectedSignalId);
                    return selectedSignal ? (
                      <MapContainer
                        key={selectedSignalId} // Force remount when signal changes
                        center={[selectedSignal.latitude || 0, selectedSignal.longitude || 0]}
                        zoom={18}
                        scrollWheelZoom={mapScrollZoom}
                        style={{ height: "100%", width: "100%" }}
                      >
                        <MapTileLayers />
                        <Marker
                          position={[selectedSignal.latitude || 0, selectedSignal.longitude || 0]}
                        >
                          <Popup>
                            <div className="text-center">
                              <div className="font-medium">{selectedSignal.signalId}</div>
                              <div className="text-xs text-gray-600">
                                {selectedSignal.streetName1} & {selectedSignal.streetName2}
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      </MapContainer>
                    ) : null;
                  })()}
                </div>
              </div>
            )}

            <div className="flex justify-between space-x-3 pt-4 border-t border-grey-200">
              <div>
                {detector && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    className="flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Detector</span>
                  </Button>
                )}
              </div>
              <div className="flex space-x-3">
                {!detector && hasCreatedDetector && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleQuickDuplicate}
                    disabled={isLoading}
                  >
                    Quick Duplicate Adjacent Lane
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-primary-600 hover:bg-primary-700"
                  disabled={isLoading}
                >
                  {isLoading ? "Saving..." : detector ? "Save Changes" : "Create Detector"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
