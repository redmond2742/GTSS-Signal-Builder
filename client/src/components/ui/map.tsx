import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface MapPickerProps {
  center: [number, number];
  zoom?: number;
  onLocationSelect: (lat: number, lng: number) => void;
  selectedPosition?: [number, number];
  className?: string;
}

function LocationMarker({ onLocationSelect, selectedPosition }: { 
  onLocationSelect: (lat: number, lng: number) => void;
  selectedPosition?: [number, number];
}) {
  const [position, setPosition] = useState<[number, number] | null>(selectedPosition || null);

  const map = useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      setPosition([lat, lng]);
      onLocationSelect(lat, lng);
    },
  });

  useEffect(() => {
    if (selectedPosition) {
      setPosition(selectedPosition);
      map.setView(selectedPosition, map.getZoom());
    }
  }, [selectedPosition, map]);

  return position === null ? null : (
    <Marker position={position} />
  );
}

export function MapPicker({ center, zoom = 13, onLocationSelect, selectedPosition, className }: MapPickerProps) {
  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "400px", width: "100%" }}
        className="rounded-lg border border-grey-200"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker 
          onLocationSelect={onLocationSelect} 
          selectedPosition={selectedPosition}
        />
      </MapContainer>
    </div>
  );
}