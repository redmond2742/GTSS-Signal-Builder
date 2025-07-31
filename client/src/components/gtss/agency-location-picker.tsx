import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Crosshair, Check } from "lucide-react";
import L from "leaflet";

interface LocationInfo {
  lat: number;
  lon: number;
  city?: string;
  state?: string;
  country?: string;
  displayName?: string;
}

interface AgencyLocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationSelect: (location: LocationInfo) => void;
  suggestedLocation?: [number, number];
}

function LocationPicker({ onLocationSelect }: { onLocationSelect: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function AgencyLocationPicker({ isOpen, onClose, onLocationSelect, suggestedLocation }: AgencyLocationPickerProps) {
  const [selectedLocation, setSelectedLocation] = useState<LocationInfo | null>(null);
  const [isGeocodingUserLocation, setIsGeocodingUserLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(suggestedLocation || [39.8283, -98.5795]);

  useEffect(() => {
    if (suggestedLocation) {
      setMapCenter(suggestedLocation);
    }
  }, [suggestedLocation]);

  const handleLocationClick = async (lat: number, lon: number) => {
    try {
      // Reverse geocode the selected location
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`);
      const data = await response.json();
      
      const locationInfo: LocationInfo = {
        lat,
        lon,
        city: data.address?.city || data.address?.town || data.address?.village || "",
        state: data.address?.state || "",
        country: data.address?.country || "",
        displayName: data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      };
      
      setSelectedLocation(locationInfo);
    } catch (error) {
      console.error("Geocoding failed:", error);
      setSelectedLocation({
        lat,
        lon,
        displayName: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      });
    }
  };

  const handleGetUserLocation = () => {
    setIsGeocodingUserLocation(true);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setUserLocation([lat, lon]);
          setMapCenter([lat, lon]);
          handleLocationClick(lat, lon);
          setIsGeocodingUserLocation(false);
        },
        (error) => {
          console.error("Geolocation failed:", error);
          setIsGeocodingUserLocation(false);
          // Try IP-based location as fallback
          fetch('https://ipapi.co/json/')
            .then(response => response.json())
            .then(data => {
              if (data.latitude && data.longitude) {
                const lat = data.latitude;
                const lon = data.longitude;
                setUserLocation([lat, lon]);
                setMapCenter([lat, lon]);
                handleLocationClick(lat, lon);
              }
            })
            .catch(() => {
              setIsGeocodingUserLocation(false);
            });
        }
      );
    } else {
      // Browser doesn't support geolocation, try IP-based location
      fetch('https://ipapi.co/json/')
        .then(response => response.json())
        .then(data => {
          if (data.latitude && data.longitude) {
            const lat = data.latitude;
            const lon = data.longitude;
            setUserLocation([lat, lon]);
            setMapCenter([lat, lon]);
            handleLocationClick(lat, lon);
          }
          setIsGeocodingUserLocation(false);
        })
        .catch(() => {
          setIsGeocodingUserLocation(false);
        });
    }
  };

  const handleConfirmLocation = () => {
    if (selectedLocation) {
      onLocationSelect(selectedLocation);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Select Agency Location</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-grey-600">
              Click on the map to select your agency's location, or use your current location as a starting point.
            </p>
            <Button 
              onClick={handleGetUserLocation}
              disabled={isGeocodingUserLocation}
              variant="outline"
              size="sm"
            >
              <Crosshair className="w-4 h-4 mr-2" />
              {isGeocodingUserLocation ? "Locating..." : "Use My Location"}
            </Button>
          </div>

          <div className="h-96 relative">
            <MapContainer
              center={mapCenter}
              zoom={suggestedLocation ? 10 : 4}
              style={{ height: "100%", width: "100%" }}
              className="rounded-lg border"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              <LocationPicker onLocationSelect={handleLocationClick} />
              
              {selectedLocation && (
                <Marker position={[selectedLocation.lat, selectedLocation.lon]} />
              )}
              
              {userLocation && (
                <Marker 
                  position={userLocation}
                  eventHandlers={{
                    add: (e) => {
                      const marker = e.target;
                      marker.setIcon(L.divIcon({
                        className: 'user-location-marker',
                        html: '<div style="background: #3b82f6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
                        iconSize: [16, 16],
                        iconAnchor: [8, 8]
                      }));
                    }
                  }}
                />
              )}
            </MapContainer>
          </div>

          {selectedLocation && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Selected Location</div>
                    <div className="text-sm text-grey-600">
                      {selectedLocation.city && selectedLocation.state 
                        ? `${selectedLocation.city}, ${selectedLocation.state}`
                        : selectedLocation.displayName
                      }
                    </div>
                    <div className="text-xs text-grey-500">
                      {selectedLocation.lat.toFixed(6)}, {selectedLocation.lon.toFixed(6)}
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    <MapPin className="w-3 h-3 mr-1" />
                    Selected
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmLocation}
              disabled={!selectedLocation}
            >
              <Check className="w-4 h-4 mr-2" />
              Confirm Location
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}