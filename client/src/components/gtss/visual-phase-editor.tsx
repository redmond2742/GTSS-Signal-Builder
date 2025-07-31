import { useState, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { useMapEvents } from "react-leaflet/hooks";
import { Signal, InsertPhase } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Save, RotateCcw } from "lucide-react";
import L from "leaflet";

interface PendingPhase {
  id: string;
  phase: number;
  bearing: number;
  movementType: string;
  isPedestrian: boolean;
  isOverlap: boolean;
  channelOutput: string;
  postedSpeedLimit?: number;
  vehicleDetectionIds: string;
  pedAudibleEnabled: boolean;
}

interface VisualPhaseEditorProps {
  signal: Signal;
  onPhasesCreate: (phases: InsertPhase[]) => void;
  onClose: () => void;
}

// Custom map component to handle drawing bearing lines
function BearingDrawer({ 
  signal, 
  pendingPhases, 
  onPhaseAdd 
}: { 
  signal: Signal; 
  pendingPhases: PendingPhase[];
  onPhaseAdd: (bearing: number) => void;
}) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<L.LatLng | null>(null);

  useMapEvents({
    click(e) {
      if (!isDrawing) {
        // Start drawing from signal location
        setIsDrawing(true);
        setStartPoint(L.latLng(signal.cntLat, signal.cntLon));
      } else {
        // End drawing and calculate bearing
        if (startPoint) {
          const bearing = calculateBearing(startPoint, e.latlng);
          onPhaseAdd(bearing);
          setIsDrawing(false);
          setStartPoint(null);
        }
      }
    },
  });

  return null;
}

// Calculate bearing between two points
function calculateBearing(start: L.LatLng, end: L.LatLng): number {
  const startLat = start.lat * Math.PI / 180;
  const startLng = start.lng * Math.PI / 180;
  const endLat = end.lat * Math.PI / 180;
  const endLng = end.lng * Math.PI / 180;

  const dLng = endLng - startLng;

  const y = Math.sin(dLng) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360; // Normalize to 0-360

  return Math.round(bearing);
}

// Get bearing line endpoint for visualization
function getBearingEndpoint(signal: Signal, bearing: number, distance: number = 0.001): [number, number] {
  const lat1 = signal.cntLat * Math.PI / 180;
  const lon1 = signal.cntLon * Math.PI / 180;
  const bearingRad = bearing * Math.PI / 180;
  
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance) + Math.cos(lat1) * Math.sin(distance) * Math.cos(bearingRad));
  const lon2 = lon1 + Math.atan2(Math.sin(bearingRad) * Math.sin(distance) * Math.cos(lat1), Math.cos(distance) - Math.sin(lat1) * Math.sin(lat2));
  
  return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

export default function VisualPhaseEditor({ signal, onPhasesCreate, onClose }: VisualPhaseEditorProps) {
  const [pendingPhases, setPendingPhases] = useState<PendingPhase[]>([]);
  const [editingPhase, setEditingPhase] = useState<PendingPhase | null>(null);
  const [isDrawMode, setIsDrawMode] = useState(true);

  const handlePhaseAdd = (bearing: number) => {
    const nextPhaseNumber = Math.max(0, ...pendingPhases.map(p => p.phase)) + 1;
    const newPhase: PendingPhase = {
      id: `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      phase: nextPhaseNumber <= 8 ? nextPhaseNumber : 1,
      bearing,
      movementType: "Through",
      isPedestrian: false,
      isOverlap: false,
      channelOutput: "",
      postedSpeedLimit: undefined,
      vehicleDetectionIds: "",
      pedAudibleEnabled: false,
    };
    
    setPendingPhases(prev => [...prev, newPhase]);
    setEditingPhase(newPhase);
  };

  const handlePhaseUpdate = (phaseId: string, updates: Partial<PendingPhase>) => {
    setPendingPhases(prev => prev.map(p => p.id === phaseId ? { ...p, ...updates } : p));
    if (editingPhase?.id === phaseId) {
      setEditingPhase(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const handlePhaseDelete = (phaseId: string) => {
    setPendingPhases(prev => prev.filter(p => p.id !== phaseId));
    if (editingPhase?.id === phaseId) {
      setEditingPhase(null);
    }
  };

  const handleSaveAll = () => {
    const phasesToCreate: InsertPhase[] = pendingPhases.map(p => ({
      phase: p.phase,
      signalId: signal.signalId,
      movementType: p.movementType as any,
      isPedestrian: p.isPedestrian,
      isOverlap: p.isOverlap,
      channelOutput: p.channelOutput,
      compassBearing: p.bearing,
      postedSpeedLimit: p.postedSpeedLimit,
      vehicleDetectionIds: p.vehicleDetectionIds,
      pedAudibleEnabled: p.pedAudibleEnabled,
    }));
    
    onPhasesCreate(phasesToCreate);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] space-x-4">
      {/* Map Section */}
      <div className="flex-1 relative">
        <div className="absolute top-4 left-4 z-[1000] bg-white p-3 rounded-lg shadow-lg border">
          <div className="flex items-center space-x-3">
            <div className="text-sm font-medium">
              {signal.signalId} - {signal.streetName1} & {signal.streetName2}
            </div>
            <Badge variant={isDrawMode ? "default" : "secondary"}>
              {isDrawMode ? "Click to draw phase directions" : "Edit mode"}
            </Badge>
          </div>
          <div className="text-xs text-grey-600 mt-1">
            Phases: {pendingPhases.length} | Click from signal center outward to set bearing
          </div>
        </div>

        <MapContainer
          center={[signal.cntLat, signal.cntLon]}
          zoom={18}
          style={{ height: "100%", width: "100%" }}
          className="rounded-lg border"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* Signal location marker */}
          <Marker position={[signal.cntLat, signal.cntLon]}>
            <Popup>
              <div className="text-center">
                <div className="font-medium">{signal.signalId}</div>
                <div className="text-xs text-grey-600">
                  {signal.streetName1} & {signal.streetName2}
                </div>
              </div>
            </Popup>
          </Marker>

          {/* Phase bearing markers */}
          {pendingPhases.map((phase) => {
            const [endLat, endLon] = getBearingEndpoint(signal, phase.bearing);
            return (
              <Marker 
                key={phase.id} 
                position={[endLat, endLon]}
                eventHandlers={{
                  click: () => setEditingPhase(phase)
                }}
              >
                <Popup>
                  <div className="text-center">
                    <div className="font-medium">Phase {phase.phase}</div>
                    <div className="text-xs">Bearing: {phase.bearing}°</div>
                    <div className="text-xs">{phase.movementType}</div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {isDrawMode && (
            <BearingDrawer 
              signal={signal}
              pendingPhases={pendingPhases}
              onPhaseAdd={handlePhaseAdd}
            />
          )}
        </MapContainer>
      </div>

      {/* Phase List and Editor */}
      <div className="w-96 space-y-4 overflow-y-auto">
        {/* Phase List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              Phases ({pendingPhases.length})
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDrawMode(!isDrawMode)}
                className="text-xs"
              >
                {isDrawMode ? "Edit Mode" : "Draw Mode"}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingPhases.length === 0 ? (
              <div className="text-xs text-grey-500 text-center py-4">
                Click on map to add phases
              </div>
            ) : (
              pendingPhases.map((phase) => (
                <div 
                  key={phase.id}
                  className={`p-2 border rounded cursor-pointer transition-colors ${
                    editingPhase?.id === phase.id 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-grey-200 hover:border-grey-300'
                  }`}
                  onClick={() => setEditingPhase(phase)}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Phase {phase.phase}</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePhaseDelete(phase.id);
                      }}
                      className="h-6 w-6 p-0 text-grey-500 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="text-xs text-grey-600">
                    {phase.movementType} • {phase.bearing}°
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Phase Editor */}
        {editingPhase && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Edit Phase {editingPhase.phase}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Movement Type</Label>
                <Select 
                  value={editingPhase.movementType} 
                  onValueChange={(value) => handlePhaseUpdate(editingPhase.id, { movementType: value })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Through">Through</SelectItem>
                    <SelectItem value="Left Turn">Left Turn</SelectItem>
                    <SelectItem value="Right Turn">Right Turn</SelectItem>
                    <SelectItem value="U-Turn">U-Turn</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Phase Number</Label>
                <Input
                  type="number"
                  min="1"
                  max="8"
                  value={editingPhase.phase}
                  onChange={(e) => handlePhaseUpdate(editingPhase.id, { phase: parseInt(e.target.value) || 1 })}
                  className="h-8"
                />
              </div>

              <div>
                <Label className="text-xs">Bearing (degrees)</Label>
                <Input
                  type="number"
                  min="0"
                  max="359"
                  value={editingPhase.bearing}
                  onChange={(e) => handlePhaseUpdate(editingPhase.id, { bearing: parseInt(e.target.value) || 0 })}
                  className="h-8"
                />
              </div>

              <div>
                <Label className="text-xs">Channel Output</Label>
                <Input
                  value={editingPhase.channelOutput}
                  onChange={(e) => handlePhaseUpdate(editingPhase.id, { channelOutput: e.target.value })}
                  placeholder="e.g., 1,2"
                  className="h-8"
                />
              </div>

              <div>
                <Label className="text-xs">Posted Speed Limit (mph)</Label>
                <Input
                  type="number"
                  value={editingPhase.postedSpeedLimit || ""}
                  onChange={(e) => handlePhaseUpdate(editingPhase.id, { postedSpeedLimit: parseInt(e.target.value) || undefined })}
                  className="h-8"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={editingPhase.isPedestrian}
                  onCheckedChange={(checked) => handlePhaseUpdate(editingPhase.id, { isPedestrian: checked })}
                />
                <Label className="text-xs">Pedestrian Phase</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={editingPhase.isOverlap}
                  onCheckedChange={(checked) => handlePhaseUpdate(editingPhase.id, { isOverlap: checked })}
                />
                <Label className="text-xs">Overlap Phase</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={editingPhase.pedAudibleEnabled}
                  onCheckedChange={(checked) => handlePhaseUpdate(editingPhase.id, { pedAudibleEnabled: checked })}
                />
                <Label className="text-xs">Audible Pedestrian Signal</Label>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          <Button 
            onClick={handleSaveAll}
            disabled={pendingPhases.length === 0}
            className="w-full"
            size="sm"
          >
            <Save className="w-4 h-4 mr-2" />
            Create {pendingPhases.length} Phases
          </Button>
          <Button 
            variant="outline" 
            onClick={() => {
              setPendingPhases([]);
              setEditingPhase(null);
            }}
            disabled={pendingPhases.length === 0}
            className="w-full" 
            size="sm"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Clear All
          </Button>
          <Button variant="outline" onClick={onClose} className="w-full" size="sm">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}