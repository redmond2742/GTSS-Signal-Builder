import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertApproachSchema, type Approach, type InsertApproach } from "@shared/schema";
import { useApproaches } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface ApproachModalProps {
  approach: Approach | null;
  onClose: () => void;
}

export default function ApproachModal({ approach, onClose }: ApproachModalProps) {
  const { signals } = useGTSSStore();
  const { toast } = useToast();
  const approachHooks = useApproaches();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<InsertApproach>({
    resolver: zodResolver(insertApproachSchema),
    defaultValues: {
      approachId: "",
      signalId: "",
      streetName: "",
      compassBearing: "",
      postedSpeed: null,
    },
  });

  useEffect(() => {
    if (approach) {
      form.reset({
        approachId: approach.approachId,
        signalId: approach.signalId,
        streetName: approach.streetName,
        compassBearing: approach.compassBearing,
        postedSpeed: approach.postedSpeed ?? null,
      });
    } else {
      form.reset({
        approachId: "",
        signalId: signals[0]?.signalId ?? "",
        streetName: "",
        compassBearing: "",
        postedSpeed: null,
      });
    }
  }, [approach, form, signals]);

  const onSubmit = async (data: InsertApproach) => {
    setIsLoading(true);
    try {
      if (approach) {
        approachHooks.update(approach.id, data);
        toast({
          title: "Success",
          description: "Approach updated successfully",
        });
      } else {
        approachHooks.save(data);
        toast({
          title: "Success",
          description: "Approach created successfully",
        });
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: approach ? "Failed to update approach" : "Failed to create approach",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    if (approach && confirm("Are you sure you want to delete this approach?")) {
      approachHooks.delete(approach.id);
      toast({
        title: "Success",
        description: "Approach deleted successfully",
      });
      onClose();
    }
  };

  if (signals.length === 0) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Approach</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-grey-600">
            <p>No signals are configured yet.</p>
            <p>Add a signal first so approaches can be assigned correctly.</p>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{approach ? "Edit Approach" : "Add Approach"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="approachId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approach ID *</FormLabel>
                    <FormControl>
                      <Input placeholder="APP_001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="signalId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Signal ID *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select signal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {signals.map((signal) => (
                          <SelectItem key={signal.signalId} value={signal.signalId}>
                            {signal.signalId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="streetName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Main St" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="compassBearing"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compass Bearing *</FormLabel>
                    <FormControl>
                      <Input placeholder="NB" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="postedSpeed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Posted Speed (mph)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="35"
                        value={field.value ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          field.onChange(value === "" ? null : parseFloat(value));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-between space-x-3 border-t border-grey-200 pt-4">
              <div>
                {approach && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    className="flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Approach</span>
                  </Button>
                )}
              </div>
              <div className="flex space-x-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Saving..." : approach ? "Save Changes" : "Create Approach"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
