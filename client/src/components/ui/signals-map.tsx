import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Signal } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X, Edit } from "lucide-react";
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

function QuickEditPopup({ signal, onUpdate, onEdit }: { 
  signal: Signal; 
  onUpdate?: (updates: Partial<Signal>) => void;
  onEdit: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    signalId: signal.signalId,
    streetName1: signal.streetName1,
    streetName2: signal.streetName2,
  });

  const handleSave = () => {
    onUpdate?.(formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({
      signalId: signal.signalId,
      streetName1: signal.streetName1,
      streetName2: signal.streetName2,
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="p-3 min-w-64">
        <h4 className="font-semibold text-sm mb-3">Quick Edit Signal</h4>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-grey-600 block mb-1">Signal ID</label>
            <Input
              value={formData.signalId}
              onChange={(e) => setFormData(prev => ({ ...prev, signalId: e.target.value }))}
              className="text-xs h-7"
              placeholder="Signal ID"
            />
          </div>
          <div>
            <label className="text-xs text-grey-600 block mb-1">Street 1</label>
            <Input
              value={formData.streetName1}
              onChange={(e) => setFormData(prev => ({ ...prev, streetName1: e.target.value }))}
              className="text-xs h-7"
              placeholder="Main Street"
            />
          </div>
          <div>
            <label className="text-xs text-grey-600 block mb-1">Street 2</label>
            <Input
              value={formData.streetName2}
              onChange={(e) => setFormData(prev => ({ ...prev, streetName2: e.target.value }))}
              className="text-xs h-7"
              placeholder="First Avenue"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} size="sm" className="text-xs h-7 flex-1">
              <Check className="w-3 h-3 mr-1" />
              Save
            </Button>
            <Button onClick={handleCancel} variant="outline" size="sm" className="text-xs h-7 flex-1">
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-sm">{signal.signalId}</h4>
        <Button 
          onClick={() => setIsEditing(true)} 
          variant="ghost" 
          size="sm" 
          className="text-xs h-6 w-6 p-0"
        >
          <Edit className="w-3 h-3" />
        </Button>
      </div>
      <p className="text-xs text-grey-600 mb-1">
        {signal.streetName1} & {signal.streetName2}
      </p>
      <p className="text-xs text-grey-500">
        Control: {signal.controlType}
      </p>
      <p className="text-xs text-grey-500">
        Coordinates: {signal.cntLat.toFixed(4)}, {signal.cntLon.toFixed(4)}
      </p>
      {signal.cabinetType && (
        <p className="text-xs text-grey-500">
          Cabinet: {signal.cabinetType}
        </p>
      )}
      <div className="pt-2">
        <Button onClick={onEdit} variant="outline" size="sm" className="text-xs h-6 w-full">
          Full Edit
        </Button>
      </div>
    </div>
  );
}

export function SignalsMap({ signals, onSignalSelect, onSignalUpdate, className }: SignalsMapProps) {
  // Default center (center of US) if no signals
  const defaultCenter: [number, number] = [39.8283, -98.5795];
  const center = signals.length > 0 ? [signals[0].cntLat, signals[0].cntLon] as [number, number] : defaultCenter;

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
                onEdit={() => onSignalSelect?.(signal)}
              />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}