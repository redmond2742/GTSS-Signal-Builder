import { useState, useEffect } from "react";
import { Detector } from "@shared/schema";
import { useDetectors } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2 } from "lucide-react";
import DetectorModal from "./detector-modal";

export default function DetectorsTable() {
  const [editingDetector, setEditingDetector] = useState<Detector | null>(null);
  const [showModal, setShowModal] = useState(false);
  const { detectors } = useGTSSStore();
  const { toast } = useToast();
  const detectorHooks = useDetectors();

  const handleEdit = (detector: Detector) => {
    setEditingDetector(detector);
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this detector?")) {
      try {
        detectorHooks.delete(id);
        toast({
          title: "Success",
          description: "Detector deleted successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete detector",
          variant: "destructive",
        });
      }
    }
  };

  const handleAdd = () => {
    setEditingDetector(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingDetector(null);
  };



  return (
    <div className="max-w-6xl">
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-grey-800">Detection Systems</CardTitle>
            <p className="text-sm text-grey-600">Configure vehicle and pedestrian detection equipment</p>
          </div>
          <Button onClick={handleAdd} className="bg-primary-600 hover:bg-primary-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Detector
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-grey-50 border-b border-grey-200">
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Signal ID</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Channel</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Phase</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Technology</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Purpose</TableHead>
                  <TableHead className="text-xs font-medium text-grey-500 uppercase tracking-wider">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detectors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-grey-500">
                      No detectors configured. Add your first detector to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  detectors.map((detector) => (
                    <TableRow key={detector.id}>
                      <TableCell className="font-medium text-grey-900">{detector.signalId}</TableCell>
                      <TableCell className="text-grey-600">{detector.detectorChannel}</TableCell>
                      <TableCell className="text-grey-600">{detector.phase}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                          {detector.detTechnologyType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-grey-600">{detector.purpose}</TableCell>
                      <TableCell className="space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(detector)}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(detector.id)}
                          className="text-red-600 hover:text-red-700"
disabled={false}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {showModal && (
        <DetectorModal
          detector={editingDetector}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
