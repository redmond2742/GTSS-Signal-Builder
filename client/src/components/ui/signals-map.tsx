import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Signal } from "@shared/schema";
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

export function SignalsMap({ signals, onSignalSelect, className }: SignalsMapProps) {
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
            eventHandlers={{
              click: () => onSignalSelect?.(signal),
            }}
          >
            <Popup>
              <div className="p-2">
                <h4 className="font-semibold text-sm">{signal.signalId}</h4>
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
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}