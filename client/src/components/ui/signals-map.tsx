import { useEffect, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Signal } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X, Edit } from "lucide-react";
import { useGTSSStore } from "@/store/gtss-store";
import "leaflet/dist/leaflet.css";

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface SignalsMapProps {
  signals: Signal[];
  onSignalSelect?: (signal: Signal) => void;
  onSignalUpdate?: (signalId: string, updates: Partial<Signal>) => void;
  className?: string;
}

function MapBounds({ signals }: { signals: Signal[] }) {
  const map = useMap();

  useEffect(() => {
    if (signals.length > 0) {
      const group = new L.FeatureGroup(
        signals.map(signal => 
          L.marker([signal.cntLat, signal.cntLon])
        )
      );
      
      if (signals.length === 1) {
        // If only one signal, center on it with reasonable zoom
        map.setView([signals[0].cntLat, signals[0].cntLon], 15);
      } else {
        // If multiple signals, fit all markers in view
        map.fitBounds(group.getBounds(), { padding: [20, 20] });
      }
    }
  }, [signals, map]);

  return null;
}

function QuickEditPopup({ signal, onUpdate, onSignalSelect }: { 
  signal: Signal; 
  onUpdate?: (updates: Partial<Signal>) => void;
  onSignalSelect?: (signal: Signal) => void;
}) {
  const [formData, setFormData] = useState({
    signalId: signal.signalId,
    streetName1: signal.streetName1,
    streetName2: signal.streetName2,
  });

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    // Auto-save on change
    onUpdate?.(newData);
  };

  return (
    <div className="p-3 min-w-64">
      <h4 className="font-semibold text-sm mb-3">Signal Details</h4>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-grey-600 block mb-1">Signal ID</label>
          <Input
            value={formData.signalId}
            onChange={(e) => handleInputChange('signalId', e.target.value)}
            className="text-xs h-7"
            placeholder="Optional Signal ID"
          />
        </div>
        <div>
          <label className="text-xs text-grey-600 block mb-1">Street 1</label>
          <Input
            value={formData.streetName1}
            onChange={(e) => handleInputChange('streetName1', e.target.value)}
            className="text-xs h-7"
            placeholder="Main Street"
          />
        </div>
        <div>
          <label className="text-xs text-grey-600 block mb-1">Street 2</label>
          <Input
            value={formData.streetName2}
            onChange={(e) => handleInputChange('streetName2', e.target.value)}
            className="text-xs h-7"
            placeholder="First Avenue"
          />
        </div>
        <div className="pt-1 space-y-1">
          <p className="text-xs text-grey-500">
            Control: {signal.controlType}
          </p>
          <p className="text-xs text-grey-500">
            Location: {signal.cntLat.toFixed(4)}, {signal.cntLon.toFixed(4)}
          </p>
          {signal.cabinetType && (
            <p className="text-xs text-grey-500">
              Cabinet: {signal.cabinetType}
            </p>
          )}
        </div>
        <div className="pt-2">
          <Button onClick={() => onSignalSelect?.(signal)} variant="outline" size="sm" className="text-xs h-6 w-full">
            Edit Full Details
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SignalsMap({ signals, onSignalSelect, onSignalUpdate, className }: SignalsMapProps) {
  const agency = useGTSSStore((state) => state.agency);
  
  // Use agency coordinates as starting point for map center
  const center: [number, number] = useMemo(() => {
    // First priority: use agency coordinates if available
    if (agency?.agencyLat && agency?.agencyLon) {
      return [agency.agencyLat, agency.agencyLon];
    }
    // Second priority: center on existing signals
    if (signals.length > 0) {
      return [signals[0].cntLat, signals[0].cntLon];
    }
    // Default: center of US
    return [39.8283, -98.5795];
  }, [agency?.agencyLat, agency?.agencyLon, signals]);

  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={signals.length > 0 ? 13 : 4}
        style={{ height: "400px", width: "100%" }}
        className="rounded-lg border border-grey-200"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapBounds signals={signals} />
        
        {signals.map((signal) => (
          <Marker
            key={signal.id}
            position={[signal.cntLat, signal.cntLon]}
          >
            <Popup>
              <QuickEditPopup
                signal={signal}
                onUpdate={(updates) => onSignalUpdate?.(signal.signalId, updates)}
                onSignalSelect={onSignalSelect}
              />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}