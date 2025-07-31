import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { insertAgencySchema, type InsertAgency, type Agency } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Shuffle, Target } from "lucide-react";
import AgencyLocationPicker from "./agency-location-picker";

export default function AgencyForm() {
  const { agency, setAgency, signals, phases, detectors } = useGTSSStore();
  const { toast } = useToast();
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [detectedState, setDetectedState] = useState<string>("");

  const { data: agencyData, isLoading } = useQuery<Agency>({
    queryKey: ["/api/agency"],
  });

  const createOrUpdateAgencyMutation = useMutation({
    mutationFn: async (data: InsertAgency) => {
      const response = await apiRequest("POST", "/api/agency", data);
      return response.json();
    },
    onSuccess: (data: Agency) => {
      setAgency(data);
      queryClient.invalidateQueries({ queryKey: ["/api/agency"] });
      toast({
        title: "Success",
        description: "Agency information saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save agency information",
        variant: "destructive",
      });
    },
  });

  const form = useForm<InsertAgency>({
    resolver: zodResolver(insertAgencySchema),
    defaultValues: {
      agencyId: "",
      agencyName: "",
      agencyUrl: "",
      agencyTimezone: "America/Los_Angeles",
      agencyLanguage: "en",
      contactPerson: "",
      contactEmail: "",
    },
  });

  useEffect(() => {
    if (agencyData) {
      setAgency(agencyData);
      form.reset({
        agencyId: agencyData.agencyId,
        agencyName: agencyData.agencyName,
        agencyUrl: agencyData.agencyUrl ?? "",
        agencyTimezone: agencyData.agencyTimezone,
        agencyLanguage: agencyData.agencyLanguage ?? "en",
        contactPerson: agencyData.contactPerson ?? "",
        contactEmail: agencyData.contactEmail ?? "",
      });
    }
  }, [agencyData, setAgency, form]);

  const onSubmit = (data: InsertAgency) => {
    createOrUpdateAgencyMutation.mutate(data);
  };

  const handleAgencyNameChange = (value: string) => {
    form.setValue("agencyName", value);
    
    // Detect state from agency name
    const agencyName = value.toLowerCase();
    const stateDetected = detectStateFromName(agencyName);
    if (stateDetected) {
      setDetectedState(stateDetected);
    }
  };

  const detectStateFromName = (agencyName: string): string => {
    // State name mappings
    const statePatterns: Record<string, string> = {
      'california': 'California', 'ca': 'California',
      'texas': 'Texas', 'tx': 'Texas',
      'florida': 'Florida', 'fl': 'Florida',
      'new york': 'New York', 'ny': 'New York',
      'pennsylvania': 'Pennsylvania', 'pa': 'Pennsylvania',
      'illinois': 'Illinois', 'il': 'Illinois',
      'ohio': 'Ohio', 'oh': 'Ohio',
      'georgia': 'Georgia', 'ga': 'Georgia',
      'north carolina': 'North Carolina', 'nc': 'North Carolina',
      'michigan': 'Michigan', 'mi': 'Michigan',
      'virginia': 'Virginia', 'va': 'Virginia',
      'washington': 'Washington', 'wa': 'Washington',
      'arizona': 'Arizona', 'az': 'Arizona',
      'massachusetts': 'Massachusetts', 'ma': 'Massachusetts',
      'tennessee': 'Tennessee', 'tn': 'Tennessee',
      'indiana': 'Indiana', 'in': 'Indiana',
      'missouri': 'Missouri', 'mo': 'Missouri',
      'maryland': 'Maryland', 'md': 'Maryland',
      'wisconsin': 'Wisconsin', 'wi': 'Wisconsin',
      'minnesota': 'Minnesota', 'mn': 'Minnesota',
      'colorado': 'Colorado', 'co': 'Colorado',
      'alabama': 'Alabama', 'al': 'Alabama',
      'louisiana': 'Louisiana', 'la': 'Louisiana',
      'kentucky': 'Kentucky', 'ky': 'Kentucky',
      'oregon': 'Oregon', 'or': 'Oregon',
      'oklahoma': 'Oklahoma', 'ok': 'Oklahoma',
      'connecticut': 'Connecticut', 'ct': 'Connecticut',
      'utah': 'Utah', 'ut': 'Utah',
      'iowa': 'Iowa', 'ia': 'Iowa',
      'nevada': 'Nevada', 'nv': 'Nevada',
      'arkansas': 'Arkansas', 'ar': 'Arkansas',
      'mississippi': 'Mississippi', 'ms': 'Mississippi',
      'kansas': 'Kansas', 'ks': 'Kansas',
      'new mexico': 'New Mexico', 'nm': 'New Mexico',
      'nebraska': 'Nebraska', 'ne': 'Nebraska',
      'west virginia': 'West Virginia', 'wv': 'West Virginia',
      'idaho': 'Idaho', 'id': 'Idaho',
      'hawaii': 'Hawaii', 'hi': 'Hawaii',
      'new hampshire': 'New Hampshire', 'nh': 'New Hampshire',
      'maine': 'Maine', 'me': 'Maine',
      'rhode island': 'Rhode Island', 'ri': 'Rhode Island',
      'montana': 'Montana', 'mt': 'Montana',
      'delaware': 'Delaware', 'de': 'Delaware',
      'south dakota': 'South Dakota', 'sd': 'South Dakota',
      'north dakota': 'North Dakota', 'nd': 'North Dakota',
      'alaska': 'Alaska', 'ak': 'Alaska',
      'vermont': 'Vermont', 'vt': 'Vermont',
      'wyoming': 'Wyoming', 'wy': 'Wyoming',
    };

    for (const [pattern, state] of Object.entries(statePatterns)) {
      if (agencyName.includes(pattern)) {
        return state;
      }
    }
    return "";
  };

  const getSuggestedLocation = (): [number, number] | undefined => {
    const agencyName = form.watch("agencyName")?.toLowerCase() || "";
    
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
    
    // State-based fallbacks
    if (agencyName.includes('california') || agencyName.includes('ca')) return [36.7783, -119.4179];
    if (agencyName.includes('texas') || agencyName.includes('tx')) return [31.9686, -99.9018];
    if (agencyName.includes('florida') || agencyName.includes('fl')) return [27.7663, -82.6404];
    
    return undefined;
  };

  const handleLocationSelect = (location: any) => {
    if (location.city && location.state) {
      form.setValue("agencyName", `${location.city} ${form.watch("agencyName") || "DOT"}`);
      setDetectedState(location.state);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Agency Information Form */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200">
          <CardTitle className="text-lg font-semibold text-grey-800">Agency Configuration</CardTitle>
          <p className="text-sm text-grey-600">Basic information about your traffic management agency</p>
        </CardHeader>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="agencyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Agency ID <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., TM_001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="agencyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Agency Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <div className="space-y-2">
                      <FormControl>
                        <Input 
                          placeholder="e.g., Los Angeles Department of Transportation" 
                          {...field} 
                          onChange={(e) => handleAgencyNameChange(e.target.value)}
                        />
                      </FormControl>
                      {detectedState && (
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            <MapPin className="w-3 h-3 mr-1" />
                            Detected: {detectedState}
                          </Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowLocationPicker(true)}
                            className="text-xs"
                          >
                            <MapPin className="w-3 h-3 mr-1" />
                            Pick Location
                          </Button>
                        </div>
                      )}
                    </div>
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
                      <Input type="url" placeholder="https://agency-website.com" {...field} />
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                name="contactPerson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Person</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact person name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="md:col-span-2">
                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="contact@agency.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="md:col-span-2">
                <Button 
                  type="submit" 
                  className="bg-primary-600 hover:bg-primary-700"
                  disabled={createOrUpdateAgencyMutation.isPending}
                >
                  {createOrUpdateAgencyMutation.isPending ? "Saving..." : "Save Agency Information"}
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
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-primary-600 font-medium">Signal Intersections</p>
                  <p className="text-2xl font-bold text-primary-700">{signals.length}</p>
                </div>
                <MapPin className="text-primary-500 text-xl" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AgencyLocationPicker
        isOpen={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onLocationSelect={handleLocationSelect}
        suggestedLocation={getSuggestedLocation()}
      />
    </div>
  );
}
