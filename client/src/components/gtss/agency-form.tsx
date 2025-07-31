import { useEffect } from "react";
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
import { MapPin, Shuffle, Target } from "lucide-react";

export default function AgencyForm() {
  const { agency, setAgency, signals, phases, detectors } = useGTSSStore();
  const { toast } = useToast();

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
                    <FormControl>
                      <Input placeholder="Agency name" {...field} />
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
    </div>
  );
}
