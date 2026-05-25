import { useState, useMemo, useEffect } from "react";
import { MapContainer, Marker, Polyline, useMapEvents } from "react-leaflet";
import MapTileLayers from "@/components/ui/map-tile-layers";
import L from "leaflet";
import { useApproaches } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Plus, Minus, Save, MapPin } from "lucide-react";
import { getSignalDisplayName, suggestStreetNameForApproach } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface PendingApproach {
  id?: string; // existing approach ID for updates
  approachId: string; // user-editable approach identifier
  bearing: number;
  streetName: string;
  postedSpeed: number | null;
  direction: string;
}

interface BulkApproachModalProps {
  onClose: () => void;
  preSelectedSignalId?: string;
  /** When true, render in-place (no Dialog wrapper). Defaults to false. */
  inline?: boolean;
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

// Get cardinal direction from bearing
const getDirectionFromBearing = (bearing: number): string => {
  const normalized = ((bearing % 360) + 360) % 360;
  if (normalized >= 337.5 || normalized < 22.5) return "N";
  if (normalized >= 22.5 && normalized < 67.5) return "NE";
  if (normalized >= 67.5 && normalized < 112.5) return "E";
  if (normalized >= 112.5 && normalized < 157.5) return "SE";
  if (normalized >= 157.5 && normalized < 202.5) return "S";
  if (normalized >= 202.5 && normalized < 247.5) return "SW";
  if (normalized >= 247.5 && normalized < 292.5) return "W";
  return "NW";
};

// Approach line colors (16 colors for up to 16 approaches)
const approachColors = [
  "#3b82f6", "#22c55e", "#ef4444", "#f97316", // blue, green, red, orange
  "#8b5cf6", "#ec4899", "#14b8a6", "#eab308", // violet, pink, teal, yellow
  "#6366f1", "#84cc16", "#f43f5e", "#06b6d4", // indigo, lime, rose, cyan
  "#a855f7", "#10b981", "#f59e0b", "#64748b", // purple, emerald, amber, slate
];

export default function BulkApproachModal({ onClose, preSelectedSignalId, inline = false }: BulkApproachModalProps) {
  const { signals, approaches: existingApproaches } = useGTSSStore();
  const { toast } = useToast();
  const approachHooks = useApproaches();

  const [selectedSignalId, setSelectedSignalId] = useState<string>(preSelectedSignalId || "");
  const [numApproaches, setNumApproaches] = useState(4);
  const [baseBearing, setBaseBearing] = useState<number | null>(null);
  const [angleOffset, setAngleOffset] = useState(0);
  const [pendingApproaches, setPendingApproaches] = useState<PendingApproach[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  // Map click behavior: "rotateAll" sets Approach 1 and rotates the rest;
  // "oneClick" snaps only the single nearest approach line to the clicked angle.
  const [clickMode, setClickMode] = useState<"rotateAll" | "oneClick">("rotateAll");

  // Get selected signal
  const selectedSignal = useMemo(() => {
    return signals.find(s => s.signalId === selectedSignalId);
  }, [signals, selectedSignalId]);

  // Get unique street names from existing approaches for autocomplete
  const uniqueStreetNames = useMemo(() => {
    const names = new Set<string>();
    existingApproaches.forEach(a => {
      if (a.streetName && a.streetName.trim()) {
        names.add(a.streetName.trim());
      }
    });
    return Array.from(names).sort();
  }, [existingApproaches]);

  // Generate approaches based on current settings
  const generateApproaches = (base: number, count: number, offset: number, preserveData = true) => {
    const angleStep = 360 / count;
    const newApproaches: PendingApproach[] = [];
    const canSuggest =
      selectedSignal?.latitude != null && selectedSignal?.longitude != null;

    for (let i = 0; i < count; i++) {
      const bearing = (base + offset + (i * angleStep)) % 360;
      const normalizedBearing = ((bearing % 360) + 360) % 360;

      const carriedStreet =
        (preserveData && pendingApproaches[i]?.streetName) || "";
      // If this row has no street name yet, try to suggest one from approaches
      // at nearby signals that point along the same street.
      let streetName = carriedStreet;
      if (!streetName && canSuggest) {
        const suggestion = suggestStreetNameForApproach({
          bearing: Math.round(normalizedBearing),
          signalLat: selectedSignal!.latitude!,
          signalLng: selectedSignal!.longitude!,
          currentSignalId: selectedSignalId,
          signals,
          approaches: existingApproaches,
        });
        if (suggestion) streetName = suggestion;
      }

      newApproaches.push({
        id: preserveData ? pendingApproaches[i]?.id : undefined,
        approachId: preserveData && pendingApproaches[i]?.approachId || `${selectedSignalId}-${i + 1}`,
        bearing: Math.round(normalizedBearing),
        streetName,
        postedSpeed: preserveData && pendingApproaches[i]?.postedSpeed || null,
        direction: getDirectionFromBearing(normalizedBearing),
      });
    }

    setPendingApproaches(newApproaches);
  };

  // Handle map click. Computes the bearing from the signal toward the clicked
  // point, then either rotates all approaches (rotateAll) or snaps the single
  // nearest approach line to that angle (oneClick).
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
    bearing = (bearing + 360) % 360;
    const rounded = Math.round(bearing);

    if (clickMode === "oneClick") {
      // Snap only the nearest approach line to the clicked angle.
      if (pendingApproaches.length === 0) return;
      const angDist = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
      let nearestIdx = 0;
      let best = Infinity;
      pendingApproaches.forEach((a, i) => {
        const dist = angDist(a.bearing, rounded);
        if (dist < best) {
          best = dist;
          nearestIdx = i;
        }
      });
      // Reuse handleBearingChange so the direction label + street-name
      // suggestion update consistently for the snapped approach.
      handleBearingChange(nearestIdx, String(rounded));
      return;
    }

    // Default: set Approach 1 base bearing and rotate the rest.
    setBaseBearing(rounded);
    generateApproaches(bearing, numApproaches, angleOffset, true);
  };

  // Handle number of approaches change
  const handleNumApproachesChange = (delta: number) => {
    const newCount = Math.max(1, Math.min(16, numApproaches + delta));
    setNumApproaches(newCount);
    if (baseBearing !== null) {
      generateApproaches(baseBearing, newCount, angleOffset, true);
    }
  };

  // Handle individual bearing change with wrap-around
  const handleBearingChange = (index: number, value: string) => {
    const bearing = value === "" ? 0 : parseInt(value);
    // Wrap around: -1 becomes 359, 360 becomes 0
    const normalizedBearing = ((bearing % 360) + 360) % 360;
    setPendingApproaches(prev => {
      const updated = [...prev];
      updated[index].bearing = normalizedBearing;
      updated[index].direction = getDirectionFromBearing(normalizedBearing);

      // Try to auto-suggest a street name from nearby signals' approaches,
      // but only if this row's street name is still empty (so we never
      // overwrite a manually entered name).
      if (!updated[index].streetName.trim() && selectedSignal?.latitude != null && selectedSignal?.longitude != null) {
        const suggestion = suggestStreetNameForApproach({
          bearing: normalizedBearing,
          signalLat: selectedSignal.latitude,
          signalLng: selectedSignal.longitude,
          currentSignalId: selectedSignalId,
          signals,
          approaches: existingApproaches,
        });
        if (suggestion) {
          updated[index].streetName = suggestion;
        }
      }

      return updated;
    });
  };

  // Handle approach ID change
  const handleApproachIdChange = (index: number, value: string) => {
    setPendingApproaches(prev => {
      const updated = [...prev];
      updated[index].approachId = value;
      return updated;
    });
  };

  // Handle angle offset change
  const handleAngleOffsetChange = (value: number[]) => {
    const newOffset = value[0];
    setAngleOffset(newOffset);
    if (baseBearing !== null) {
      generateApproaches(baseBearing, numApproaches, newOffset, true);
    }
  };

  // Find opposite approach index (approximately 180° away)
  const findOppositeApproachIndex = (index: number, approaches: PendingApproach[]): number | null => {
    if (approaches.length < 2) return null;

    const currentBearing = approaches[index].bearing;
    const targetBearing = (currentBearing + 180) % 360;

    let closestIndex: number | null = null;
    let closestDiff = 360;

    for (let i = 0; i < approaches.length; i++) {
      if (i === index) continue;

      const diff = Math.abs(((approaches[i].bearing - targetBearing + 180) % 360) - 180);
      if (diff < closestDiff && diff < 45) { // Within 45° of opposite
        closestDiff = diff;
        closestIndex = i;
      }
    }

    return closestIndex;
  };

  // Handle street name change with auto-fill for opposite approach
  const handleStreetNameChange = (index: number, value: string) => {
    setPendingApproaches(prev => {
      const updated = [...prev];
      updated[index].streetName = value;

      const oppositeIndex = findOppositeApproachIndex(index, updated);
      if (oppositeIndex !== null) {
        const opp = updated[oppositeIndex].streetName;
        // Fill if opposite is empty OR was auto-filled from a previous keystroke
        // (its value is a prefix of what we're typing, so it should keep following)
        if (!opp || value.startsWith(opp)) {
          updated[oppositeIndex].streetName = value;
        }
      }

      return updated;
    });
  };

  // Handle speed change with auto-fill for other approaches on the same street.
  // Matches the street-name auto-fill pattern: target gets updated if it's empty
  // or if it equals the source's previous speed (i.e. it was tracking us).
  const handleSpeedChange = (index: number, value: string) => {
    const newSpeed = value ? parseInt(value) : null;
    setPendingApproaches(prev => {
      const updated = [...prev];
      const prevSpeed = updated[index].postedSpeed;
      updated[index].postedSpeed = newSpeed;

      const myStreet = updated[index].streetName.trim();
      if (!myStreet) return updated;

      for (let i = 0; i < updated.length; i++) {
        if (i === index) continue;
        if (updated[i].streetName.trim() !== myStreet) continue;
        const other = updated[i].postedSpeed;
        // Fill empty rows, or keep already-in-sync rows in sync as we edit.
        if (other === null || other === prevSpeed) {
          updated[i].postedSpeed = newSpeed;
        }
      }

      return updated;
    });
  };

  // Calculate polyline endpoints for visualization
  const getApproachLineEndpoint = (bearing: number, signalLat: number, signalLng: number): [number, number] => {
    // Extend line in direction traffic comes FROM (opposite of bearing)
    const oppositeBearing = (bearing + 180) % 360;
    const distance = 0.002; // About 200m
    const bearingRad = oppositeBearing * Math.PI / 180;

    const endLat = signalLat + distance * Math.cos(bearingRad);
    const endLng = signalLng + distance * Math.sin(bearingRad) / Math.cos(signalLat * Math.PI / 180);

    return [endLat, endLng];
  };

  // Save all approaches (create new or update existing)
  const handleSaveAll = async () => {
    if (!selectedSignalId) {
      toast({
        title: "No Signal Selected",
        description: "Please select a signal first",
        variant: "destructive",
      });
      return;
    }

    if (pendingApproaches.length === 0) {
      toast({
        title: "No Approaches",
        description: "Click on the map to set the approach directions",
        variant: "destructive",
      });
      return;
    }

    // Validate that all approaches have street names
    const missingNames = pendingApproaches.filter(a => !a.streetName.trim());
    if (missingNames.length > 0) {
      toast({
        title: "Missing Street Names",
        description: "Please enter street names for all approaches",
        variant: "destructive",
      });
      return;
    }

    // Validate that all approaches have IDs
    const missingIds = pendingApproaches.filter(a => !a.approachId.trim());
    if (missingIds.length > 0) {
      toast({
        title: "Missing Approach IDs",
        description: "Please enter IDs for all approaches",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      let updatedCount = 0;
      let createdCount = 0;

      for (const approach of pendingApproaches) {
        if (approach.id) {
          // Update existing approach
          approachHooks.update(approach.id, {
            signalId: selectedSignalId,
            approachId: approach.approachId,
            streetName: approach.streetName,
            compassBearing: approach.bearing,
            postedSpeed: approach.postedSpeed,
          });
          updatedCount++;
        } else {
          // Create new approach
          approachHooks.save({
            signalId: selectedSignalId,
            approachId: approach.approachId,
            streetName: approach.streetName,
            compassBearing: approach.bearing,
            postedSpeed: approach.postedSpeed,
          });
          createdCount++;
        }
      }

      const messages = [];
      if (updatedCount > 0) messages.push(`Updated ${updatedCount}`);
      if (createdCount > 0) messages.push(`Created ${createdCount}`);

      toast({
        title: "Success",
        description: `${messages.join(", ")} approach${updatedCount + createdCount > 1 ? "es" : ""}`,
      });

      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save approaches",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Load existing approaches or initialize with defaults when signal is selected
  useEffect(() => {
    if (selectedSignal) {
      // Check if this signal has existing approaches
      const signalApproaches = existingApproaches.filter(a => a.signalId === selectedSignalId);

      if (signalApproaches.length > 0) {
        // Load existing approaches for editing
        setIsEditMode(true);
        setNumApproaches(signalApproaches.length);
        setAngleOffset(0);

        const loadedApproaches: PendingApproach[] = signalApproaches.map(a => ({
          id: a.id,
          approachId: a.approachId,
          bearing: a.compassBearing || 0,
          streetName: a.streetName,
          postedSpeed: a.postedSpeed,
          direction: getDirectionFromBearing(a.compassBearing || 0),
        }));

        setPendingApproaches(loadedApproaches);

        // Set base bearing from first approach if available
        if (signalApproaches[0]?.compassBearing !== null) {
          setBaseBearing(signalApproaches[0].compassBearing);
        } else {
          setBaseBearing(0);
        }
      } else {
        // No existing approaches - generate new ones
        setIsEditMode(false);
        setAngleOffset(0);
        setBaseBearing(0);
        // Reset to default 4 approaches for new signals
        setNumApproaches(4);
        setPendingApproaches([]);
        // Generate after state updates
        setTimeout(() => {
          const angleStep = 360 / 4;
          const canSuggest =
            selectedSignal?.latitude != null && selectedSignal?.longitude != null;
          const newApproaches: PendingApproach[] = [];
          for (let i = 0; i < 4; i++) {
            const bearing = (i * angleStep) % 360;
            // Try to auto-suggest a street name from nearby signals' approaches.
            let streetName = "";
            if (canSuggest) {
              const suggestion = suggestStreetNameForApproach({
                bearing: Math.round(bearing),
                signalLat: selectedSignal!.latitude!,
                signalLng: selectedSignal!.longitude!,
                currentSignalId: selectedSignalId,
                signals,
                approaches: existingApproaches,
              });
              if (suggestion) streetName = suggestion;
            }
            newApproaches.push({
              approachId: `${selectedSignalId}-${i + 1}`,
              bearing: Math.round(bearing),
              streetName,
              postedSpeed: null,
              direction: getDirectionFromBearing(bearing),
            });
          }
          setPendingApproaches(newApproaches);
        }, 0);
      }
    }
  }, [selectedSignalId]);

  const titleText = isEditMode ? "Edit Approaches" : "Add Multiple Approaches";
  const titleBadge = pendingApproaches.length > 0 && (
    <Badge variant="secondary" className={isEditMode ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}>
      {pendingApproaches.length} approach{pendingApproaches.length !== 1 ? "es" : ""}
    </Badge>
  );

  const body = (
    <>
        <div className="space-y-4">
          {/* Signal Selector */}
          <div>
            <Label className="text-sm font-medium">Signal *</Label>
            <Select value={selectedSignalId} onValueChange={setSelectedSignalId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a signal" />
              </SelectTrigger>
              <SelectContent>
                {signals.filter(s => s.latitude && s.longitude).map((signal) => (
                  <SelectItem key={signal.signalId} value={signal.signalId}>
                    {getSignalDisplayName(signal, existingApproaches)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSignal && selectedSignal.latitude && selectedSignal.longitude ? (
            <>
              {/* Controls Row */}
              <div className="flex items-center gap-6 p-3 bg-grey-50 rounded-lg">
                {/* Number of Approaches */}
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">Approaches:</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleNumApproachesChange(-1)}
                      disabled={numApproaches <= 1}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <Input
                      type="number"
                      min="1"
                      max="16"
                      value={numApproaches}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        const clamped = Math.max(1, Math.min(16, val));
                        setNumApproaches(clamped);
                        if (baseBearing !== null) {
                          generateApproaches(baseBearing, clamped, angleOffset, true);
                        }
                      }}
                      className="w-12 h-7 text-center text-sm px-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleNumApproachesChange(1)}
                      disabled={numApproaches >= 16}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Angle Offset */}
                <div className="flex items-center gap-2 flex-1">
                  <Label className="text-sm whitespace-nowrap">Rotate All:</Label>
                  <Slider
                    value={[angleOffset]}
                    onValueChange={handleAngleOffsetChange}
                    min={0}
                    max={359}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-10 text-sm text-right">{angleOffset}°</span>
                </div>
              </div>

              {/* Map */}
              <div className="border border-grey-200 rounded-lg overflow-hidden">
                <div className="p-2 bg-blue-50 border-b border-blue-200">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <MapPin className="w-4 h-4 flex-shrink-0" />
                      <span>
                        {clickMode === "oneClick"
                          ? "1-Click: click the map to snap the nearest approach line to that angle"
                          : "Click the map to set Approach 1 direction (rotates all approaches)"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant={clickMode === "rotateAll" ? "default" : "outline"}
                        onClick={() => setClickMode("rotateAll")}
                        className="h-7 px-2 text-xs"
                      >
                        Rotate All
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={clickMode === "oneClick" ? "default" : "outline"}
                        onClick={() => setClickMode("oneClick")}
                        className="h-7 px-2 text-xs"
                      >
                        1-Click
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="h-64">
                  <MapContainer
                    center={[selectedSignal.latitude, selectedSignal.longitude]}
                    zoom={17}
                    scrollWheelZoom={false}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <MapTileLayers />
                    <MapClickHandler onMapClick={handleMapClick} />

                    {/* Signal marker */}
                    <Marker position={[selectedSignal.latitude, selectedSignal.longitude]} />

                    {/* Approach direction lines */}
                    {pendingApproaches.map((approach, idx) => {
                      const endpoint = getApproachLineEndpoint(
                        approach.bearing,
                        selectedSignal.latitude!,
                        selectedSignal.longitude!
                      );
                      return (
                        <Polyline
                          key={idx}
                          positions={[
                            [selectedSignal.latitude!, selectedSignal.longitude!],
                            endpoint
                          ]}
                          color={approachColors[idx]}
                          weight={4}
                          opacity={0.8}
                        />
                      );
                    })}
                  </MapContainer>
                </div>
              </div>

              {/* Approach Details Table */}
              {pendingApproaches.length > 0 && (
                <div className="border border-grey-200 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-grey-50">
                        <TableHead className="w-12 text-xs"></TableHead>
                        <TableHead className="w-20 text-xs">ID *</TableHead>
                        <TableHead className="w-60 text-xs">Angle</TableHead>
                        <TableHead className="w-48 text-xs">Street Name *</TableHead>
                        <TableHead className="w-20 text-xs">Speed (mph)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingApproaches.map((approach, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: approachColors[idx] }}
                              />
                              <span className="text-xs text-grey-500">{approach.direction}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <Input
                              value={approach.approachId}
                              onChange={(e) => handleApproachIdChange(idx, e.target.value)}
                              placeholder="ID"
                              className="h-8 text-sm w-20"
                            />
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                inputMode="numeric"
                                value={approach.bearing}
                                onChange={(e) => handleBearingChange(idx, e.target.value)}
                                className="h-8 text-sm w-16 flex-shrink-0"
                                title="Enter any number — values are normalized to 0–359° (e.g. 450 → 90, -10 → 350)."
                              />
                              <span className="text-xs text-grey-500 flex-shrink-0">°</span>
                              <Slider
                                value={[approach.bearing]}
                                onValueChange={(v) => handleBearingChange(idx, String(v[0]))}
                                min={0}
                                max={359}
                                step={1}
                                className="flex-1 min-w-0"
                                aria-label="Approach angle"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <Input
                              value={approach.streetName}
                              onChange={(e) => handleStreetNameChange(idx, e.target.value)}
                              placeholder="Street"
                              className="h-8 text-sm w-full"
                              list={`street-suggestions-${idx}`}
                            />
                            <datalist id={`street-suggestions-${idx}`}>
                              {uniqueStreetNames.map((name) => (
                                <option key={name} value={name} />
                              ))}
                            </datalist>
                          </TableCell>
                          <TableCell className="py-2">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={approach.postedSpeed || ""}
                              onChange={(e) => handleSpeedChange(idx, e.target.value)}
                              placeholder="35"
                              className="h-8 text-sm w-20"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          ) : selectedSignalId ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                Selected signal does not have coordinates. Please edit the signal to add latitude/longitude first.
              </p>
            </div>
          ) : null}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-grey-200">
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={!selectedSignalId || pendingApproaches.length === 0 || isProcessing}
              className="bg-primary-600 hover:bg-primary-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {isProcessing
                ? "Saving..."
                : isEditMode
                  ? `Save ${pendingApproaches.length} Approach${pendingApproaches.length !== 1 ? "es" : ""}`
                  : `Create ${pendingApproaches.length} Approach${pendingApproaches.length !== 1 ? "es" : ""}`
              }
            </Button>
          </div>
        </div>
    </>
  );

  if (inline) {
    return (
      <div className="rounded-lg border border-grey-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span>{titleText}</span>
            {titleBadge}
          </h2>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{titleText}</span>
            {titleBadge}
          </DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
