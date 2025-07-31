import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { insertSignalSchema, type InsertSignal, type Signal } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, MapPin, Save, Trash2 } from "lucide-react";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface PendingSignal {
  id: string;
  lat: number;
  lon: number;
  streetName1?: string;
  streetName2?: string;
}

interface BulkSignalModalProps {
  onClose: () => void;
}

function MapClickHandler({ onLocationAdd }: { onLocationAdd: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: async (e) => {
      const { lat, lng } = e.latlng;
      onLocationAdd(lat, lng);
    },
  });
  
  return null;
}

export default function BulkSignalModal({ onClose }: BulkSignalModalProps) {
  const { agency, addSignal } = useGTSSStore();
  const { toast } = useToast();
  const [pendingSignals, setPendingSignals] = useState<PendingSignal[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const getMapCenter = (): [number, number] => {
    // First priority: use agency coordinates if available
    if (agency?.agencyLat && agency?.agencyLon) {
      return [agency.agencyLat, agency.agencyLon];
    }
    
    if (!agency) return [39.8283, -98.5795]; // Center of US
    
    // Map agency names to common locations for better accuracy
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
  };

  const handleLocationAdd = async (lat: number, lon: number) => {
    const newSignal: PendingSignal = {
      id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      lat,
      lon,
    };

    // Try to auto-populate street names using reverse geocoding
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
      const data = await response.json();
      
      if (data.address) {
        const streetName = data.address.road || data.address.street || "";
        const intersectingStreet = data.address.neighbourhood || data.address.suburb || "";
        
        if (streetName) {
          newSignal.streetName1 = streetName;
        }
        if (intersectingStreet && intersectingStreet !== streetName) {
          newSignal.streetName2 = intersectingStreet;
        }
      }
    } catch (error) {
      console.log("Geocoding failed for location, will use manual entry");
    }

    setPendingSignals(prev => [...prev, newSignal]);
  };

  const handleRemoveSignal = (signalId: string) => {
    setPendingSignals(prev => prev.filter(s => s.id !== signalId));
  };

  const handleSaveAll = async () => {
    if (pendingSignals.length === 0) {
      toast({
        title: "No Signals",
        description: "Please add some signal locations first",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const signalsToCreate: InsertSignal[] = pendingSignals.map((signal, index) => ({
        signalId: "", // Will be auto-generated
        agencyId: agency?.agencyId || "",
        streetName1: signal.streetName1 || `Street ${index + 1}`,
        streetName2: signal.streetName2 || `Cross Street ${index + 1}`,
        cntLat: signal.lat,
        cntLon: signal.lon,
        controlType: "Actuated",
        cabinetType: "",
        hasBatteryBackup: false,
        hasCctv: false,
      }));

      // Create all signals
      const createdSignals: Signal[] = [];
      for (const signalData of signalsToCreate) {
        const response = await apiRequest("POST", "/api/signals", signalData);
        const signal = await response.json();
        createdSignals.push(signal);
        addSignal(signal);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      

      
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create some signals",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearAll = () => {
    setPendingSignals([]);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-screen overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-3">
            <span>Bulk Add Signal Locations</span>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
              {pendingSignals.length} locations
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col h-[calc(100vh-12rem)]">
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Instructions</span>
            </div>
            <p className="text-sm text-blue-700">
              Click anywhere on the map to add signal locations. Street names will be auto-populated when possible. 
              You can edit details later from the main signals table.
            </p>
          </div>

          <div className="flex-1 relative">
            <MapContainer
              center={getMapCenter()}
              zoom={13}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              <MapClickHandler onLocationAdd={handleLocationAdd} />
              
              {pendingSignals.map((signal) => (
                <Marker
                  key={signal.id}
                  position={[signal.lat, signal.lon]}
                />
              ))}
            </MapContainer>
          </div>

          {pendingSignals.length > 0 && (
            <div className="mt-4 p-4 bg-grey-50 border border-grey-200 rounded-lg max-h-40 overflow-y-auto">
              <h4 className="text-sm font-medium mb-3">Pending Signals ({pendingSignals.length})</h4>
              <div className="space-y-2">
                {pendingSignals.map((signal, index) => (
                  <div key={signal.id} className="flex items-center justify-between text-xs bg-white p-2 rounded border">
                    <div>
                      <span className="font-medium">Signal {index + 1}</span>
                      {signal.streetName1 && (
                        <span className="text-grey-600 ml-2">
                          {signal.streetName1}{signal.streetName2 ? ` & ${signal.streetName2}` : ""}
                        </span>
                      )}
                      <span className="text-grey-500 ml-2">
                        ({signal.lat.toFixed(4)}, {signal.lon.toFixed(4)})
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveSignal(signal.id)}
                      className="h-6 w-6 p-0 text-grey-500 hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-grey-200">
            <div className="flex space-x-2">
              {pendingSignals.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleClearAll}
                  disabled={isProcessing}
                  className="text-grey-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
              )}
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={onClose} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveAll}
                disabled={pendingSignals.length === 0 || isProcessing}
                className="bg-primary-600 hover:bg-primary-700"
              >
                <Save className="w-4 h-4 mr-2" />
                {isProcessing ? "Creating..." : `Create ${pendingSignals.length} Signals`}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}