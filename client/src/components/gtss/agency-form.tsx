import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAgencySchema, type InsertAgency, type Agency } from "@shared/schema";
import { agencyStorage } from "@/lib/localStorage";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { MapPin, Shuffle, Target, Crosshair } from "lucide-react";
import L from "leaflet";

// Map picker component for location selection
function LocationPicker({ onLocationSelect }: { onLocationSelect: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function AgencyForm() {
  const { agency, setAgency, signals, phases, detectors } = useGTSSStore();
  const { toast } = useToast();
  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lon: number;
    city?: string;
    state?: string;
    displayName?: string;
  } | null>(null);
  const [isGeocodingUserLocation, setIsGeocodingUserLocation] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]);

  const saveAgency = (data: InsertAgency) => {
    try {
      const savedAgency = agencyStorage.save(data);
      setAgency(savedAgency);
      toast({
        title: "Success",
        description: "Agency information saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save agency information",
        variant: "destructive",
      });
    }
  };

  const form = useForm<InsertAgency>({
    resolver: zodResolver(insertAgencySchema),
    defaultValues: {
      agencyId: "",
      agencyName: "",
      agencyUrl: "",
      agencyTimezone: "America/Los_Angeles",
      agencyLanguage: "en",
      agencyEmail: "",
    },
  });

  useEffect(() => {
    if (agency) {
      form.reset({
        agencyId: agency.agencyId,
        agencyName: agency.agencyName,
        agencyUrl: agency.agencyUrl ?? "",
        agencyTimezone: agency.agencyTimezone,
        agencyLanguage: agency.agencyLanguage ?? "en",
        agencyEmail: agency.agencyEmail ?? "",
      });
    }
  }, [agency, form]);

  const onSubmit = (data: InsertAgency) => {
    saveAgency(data);
  };

  const generateAgencyId = (state: string, agencyName: string): string => {
    // Get state abbreviation
    const stateAbbreviations: Record<string, string> = {
      'California': 'CA', 'Texas': 'TX', 'Florida': 'FL', 'New York': 'NY',
      'Pennsylvania': 'PA', 'Illinois': 'IL', 'Ohio': 'OH', 'Georgia': 'GA',
      'North Carolina': 'NC', 'Michigan': 'MI', 'Virginia': 'VA', 'Washington': 'WA',
      'Arizona': 'AZ', 'Massachusetts': 'MA', 'Tennessee': 'TN', 'Indiana': 'IN',
      'Missouri': 'MO', 'Maryland': 'MD', 'Wisconsin': 'WI', 'Minnesota': 'MN',
      'Colorado': 'CO', 'Alabama': 'AL', 'Louisiana': 'LA', 'Kentucky': 'KY',
      'Oregon': 'OR', 'Oklahoma': 'OK', 'Connecticut': 'CT', 'Utah': 'UT',
      'Iowa': 'IA', 'Nevada': 'NV', 'Arkansas': 'AR', 'Mississippi': 'MS',
      'Kansas': 'KS', 'New Mexico': 'NM', 'Nebraska': 'NE', 'West Virginia': 'WV',
      'Idaho': 'ID', 'Hawaii': 'HI', 'New Hampshire': 'NH', 'Maine': 'ME',
      'Rhode Island': 'RI', 'Montana': 'MT', 'Delaware': 'DE', 'South Dakota': 'SD',
      'North Dakota': 'ND', 'Alaska': 'AK', 'Vermont': 'VT', 'Wyoming': 'WY'
    };

    const stateCode = stateAbbreviations[state] || state.toUpperCase().substring(0, 2);
    
    // Extract city name from agency name
    const words = agencyName.replace(/department|transportation|traffic|signals?|management|dot|city|county/gi, '')
      .trim().split(/\s+/);
    const cityCode = words[0] ? words[0].substring(0, 3).toUpperCase() : 'AGN';
    
    return `${stateCode}_${cityCode}_001`;
  };

  const handleLocationClick = async (lat: number, lon: number) => {
    try {
      // Reverse geocode the selected location
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`);
      const data = await response.json();
      
      const locationInfo = {
        lat,
        lon,
        city: data.address?.city || data.address?.town || data.address?.village || "",
        state: data.address?.state || "",
        displayName: data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      };
      
      setSelectedLocation(locationInfo);
      
      // Auto-populate agency name and ID
      if (locationInfo.city && locationInfo.state) {
        const agencyName = `${locationInfo.city} Department of Transportation`;
        const agencyId = generateAgencyId(locationInfo.state, agencyName);
        
        form.setValue("agencyName", agencyName);
        form.setValue("agencyId", agencyId);
        
        // Update store with coordinates for map centering
        if (agency) {
          setAgency({
            ...agency,
            agencyId,
            agencyName,

          });
        }
      }
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





  return (
    <div className="max-w-4xl space-y-6">
      {/* Agency Information Form */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200">
          <CardTitle className="text-lg font-semibold text-grey-800">Agency Configuration</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Integrated Location Picker */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-medium">Agency Location</h3>
                    <p className="text-xs text-grey-600">
                      Select your agency's location. This will be used as the center point for signal maps.
                    </p>
                  </div>
                  <Button 
                    type="button"
                    onClick={handleGetUserLocation}
                    disabled={isGeocodingUserLocation}
                    variant="outline"
                    className="h-7 px-2 text-xs"
                  >
                    <Crosshair className="w-3 h-3 mr-1" />
                    {isGeocodingUserLocation ? "Locating..." : "Use My Location"}
                  </Button>
                </div>

                <div className="h-64 relative">
                  <MapContainer
                    center={mapCenter}
                    zoom={selectedLocation ? 12 : 6}
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
                  </MapContainer>
                </div>

                {selectedLocation && (
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-green-800 text-sm">Selected Location</div>
                          <div className="text-xs text-green-700">
                            {selectedLocation.city && selectedLocation.state 
                              ? `${selectedLocation.city}, ${selectedLocation.state}`
                              : selectedLocation.displayName
                            }
                          </div>
                          <div className="text-xs text-green-600">
                            {selectedLocation.lat.toFixed(6)}, {selectedLocation.lon.toFixed(6)}
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                          <MapPin className="w-3 h-3 mr-1" />
                          Auto-populated
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Agency Information Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="agencyId"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-medium">
                      Agency ID <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., TM_001" className="h-7 px-2 text-xs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

                    <FormField
                      control={form.control}
                      name="agencyName"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-xs font-medium">
                            Agency Name <span className="text-red-500">*</span>
                          </FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Los Angeles Department of Transportation" 
                              className="h-7 px-2 text-xs"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

              <FormField
                control={form.control}
                name="agencyUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agency URL</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://agency-website.com" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="agencyTimezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Timezone <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="America/New_York">America/New_York</SelectItem>
                        <SelectItem value="America/Chicago">America/Chicago</SelectItem>
                        <SelectItem value="America/Denver">America/Denver</SelectItem>
                        <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="agencyLanguage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Language</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="agencyEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agency Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="agency@domain.com" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />



              </div>

              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  className="h-8 px-4 text-xs bg-primary-600 hover:bg-primary-700"
                  disabled={false}
                >
                  Save Agency Information
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Quick Preview */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200">
          <CardTitle className="text-lg font-semibold text-grey-800">Configuration Preview</CardTitle>
          <p className="text-sm text-grey-600">Current configuration summary</p>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-primary-600 font-medium">Signal Intersections</p>
                  <p className="text-xl font-bold text-primary-700">{signals.length}</p>
                </div>
                <MapPin className="text-primary-500 w-5 h-5" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>


    </div>
  );
}
