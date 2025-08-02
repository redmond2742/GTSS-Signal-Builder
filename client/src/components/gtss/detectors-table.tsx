import { useState, useEffect } from "react";
import { Detector } from "@shared/schema";
import { useDetectors } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import DetectorModal from "./detector-modal";

export default function DetectorsTable() {
  const [editingDetector, setEditingDetector] = useState<Detector | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState<string>("");
  const { detectors, signals } = useGTSSStore();
  
  // Auto-select first signal on mount
  useEffect(() => {
    if (signals.length > 0 && !selectedSignalId) {
      setSelectedSignalId(signals[0].signalId);
    }
  }, [signals, selectedSignalId]);
  const { toast } = useToast();
  const detectorHooks = useDetectors();

  // Filter detectors by selected signal
  const filteredDetectors = selectedSignalId 
    ? detectors.filter(detector => detector.signalId === selectedSignalId)
    : [];

  // Get signal display name
  const getSignalDisplayName = (signalId: string) => {
    const signal = signals.find(s => s.signalId === signalId);
    return signal 
      ? `${signal.signalId} - ${signal.streetName1} & ${signal.streetName2}`
      : signalId;
  };

  const handleEdit = (detector: Detector) => {
    setEditingDetector(detector);
    setShowModal(true);
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
        <CardHeader className="bg-grey-50 border-b border-grey-200">
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-grey-800">Detection Systems</CardTitle>
              <p className="text-sm text-grey-600">Configure vehicle and pedestrian detection equipment</p>
            </div>
            <Button onClick={handleAdd} className="bg-primary-600 hover:bg-primary-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Detector
            </Button>
          </div>
          
          {/* Signal Selection */}
          <div className="mt-4 flex items-center space-x-4">
            <div className="flex-1 max-w-md">
              <label className="block text-sm font-medium text-grey-700 mb-2">
                Select Signal to View Detectors
              </label>
              <Select value={selectedSignalId} onValueChange={setSelectedSignalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a signal to view its detectors" />
                </SelectTrigger>
                <SelectContent>
                  {signals.map((signal) => (
                    <SelectItem key={signal.id} value={signal.signalId}>
                      {getSignalDisplayName(signal.signalId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedSignalId && (
              <div className="flex items-center space-x-2 text-sm text-grey-600">
                <span>Showing {filteredDetectors.length} detector(s)</span>
              </div>
            )}
          </div>
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

                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedSignalId ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-grey-500">
                      Please select a signal above to view its detectors.
                    </TableCell>
                  </TableRow>
                ) : filteredDetectors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-grey-500">
                      No detectors configured for this signal. Add your first detector to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDetectors.map((detector) => (
                    <TableRow 
                      key={detector.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleEdit(detector)}
                    >
                      <TableCell className="font-medium text-grey-900">{detector.signalId}</TableCell>
                      <TableCell className="text-grey-600">{detector.detectorChannel}</TableCell>
                      <TableCell className="text-grey-600">{detector.phase}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                          {detector.detTechnologyType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-grey-600">{detector.purpose}</TableCell>
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
