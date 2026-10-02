import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { DemoIntersection } from "gtss";
import {
  Intersection3D,
  mirrorApproachLanes,
  type Intersection3DHandle,
  type IntersectionInput,
} from "gtss-3d";
import { Download } from "lucide-react";
import { useMemo, useRef, useState } from "react";

interface Intersection3DPanelProps {
  intersection: DemoIntersection;
  isLht: boolean;
  onExported?: () => void;
}

/** 3D demo view; loaded lazily so three.js stays out of the main bundle. */
export default function Intersection3DPanel({
  intersection,
  isLht,
  onExported,
}: Intersection3DPanelProps) {
  const viewRef = useRef<Intersection3DHandle>(null);
  const [showDetectors, setShowDetectors] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showSignals, setShowSignals] = useState(true);

  // Demo lane configs are authored for right-hand traffic.
  const input = useMemo<IntersectionInput>(
    () => ({
      signalId: intersection.signal.signalId,
      approaches: isLht
        ? intersection.approaches.map(mirrorApproachLanes)
        : intersection.approaches,
      phases: intersection.phases,
      detectors: intersection.detectors,
    }),
    [intersection, isLht],
  );

  const handleExport = () => {
    const url = viewRef.current?.toDataUrl("image/jpeg", 0.92);
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `demo-${intersection.id}-3d.jpg`;
    link.click();
    onExported?.();
  };

  const toggles = [
    { id: "3d-detectors", label: "Detectors", checked: showDetectors, set: setShowDetectors },
    { id: "3d-signals", label: "Signals", checked: showSignals, set: setShowSignals },
    { id: "3d-labels", label: "Street names", checked: showLabels, set: setShowLabels },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-grey-500">
          Lane configuration, markings, slip lanes, signals and detection zones in 3D. Drag to
          orbit, right-drag to pan, scroll to zoom.
        </span>
        <div className="flex items-center gap-3">
          {toggles.map((toggle) => (
            <div key={toggle.id} className="flex items-center gap-1.5">
              <Switch id={toggle.id} checked={toggle.checked} onCheckedChange={toggle.set} />
              <Label htmlFor={toggle.id} className="text-xs">
                {toggle.label}
              </Label>
            </div>
          ))}
          <Button
            onClick={handleExport}
            variant="outline"
            size="sm"
            className="h-7 text-xs flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            <span>Export JPG</span>
          </Button>
        </div>
      </div>
      <div className="border border-grey-200 rounded-lg overflow-hidden bg-white h-[520px]">
        <Intersection3D
          ref={viewRef}
          input={input}
          isLht={isLht}
          showDetectors={showDetectors}
          showLabels={showLabels}
          showSignals={showSignals}
        />
      </div>
    </div>
  );
}
