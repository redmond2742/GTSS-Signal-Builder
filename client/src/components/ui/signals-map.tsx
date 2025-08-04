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
      const validSignals = signals.filter(signal => signal.latitude && signal.longitude);
      if (validSignals.length === 0) return;
      
      const group = new L.FeatureGroup(
        validSignals.map(signal => 
          L.marker([signal.latitude, signal.longitude])
        )
      );
      
      if (validSignals.length === 1) {
        // If only one signal, center on it with reasonable zoom
        map.setView([validSignals[0].latitude, validSignals[0].longitude], 15);
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
            Location: {signal.latitude?.toFixed(4)}, {signal.longitude?.toFixed(4)}
          </p>
          <p className="text-xs text-grey-500">
            Agency: {signal.agencyId}
          </p>
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

export default function SignalsMap({ signals, onSignalSelect, onSignalUpdate, className }: SignalsMapProps) {
  const agency = useGTSSStore((state) => state.agency);
  
  // Use agency coordinates as starting point for map center
  const center: [number, number] = useMemo(() => {
    // First priority: use agency coordinates if available
    if (agency?.latitude && agency?.longitude) {
      return [agency.latitude, agency.longitude];
    }
    // Second priority: center on existing signals
    if (signals.length > 0 && signals[0].latitude && signals[0].longitude) {
      return [signals[0].latitude, signals[0].longitude];
    }
    // Default: center of US
    return [39.8283, -98.5795];
  }, [agency?.latitude, agency?.longitude, signals]);

  return (
    <div className={className} style={{ position: 'relative', zIndex: 1 }}>
      <MapContainer
        center={center}
        zoom={signals.length === 1 ? 15 : signals.length > 0 ? 13 : 4}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
        className="rounded-lg"
        key={`map-${signals.length}-${center[0]}-${center[1]}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapBounds signals={signals} />
        
        {signals.filter(signal => signal.latitude && signal.longitude).map((signal) => (
          <Marker
            key={signal.id}
            position={[signal.latitude, signal.longitude]}

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