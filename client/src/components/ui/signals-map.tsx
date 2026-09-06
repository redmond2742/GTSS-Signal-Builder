import { PhaseDiagram } from "@/components/gtss/phase-diagram-svg";
import { Button } from "@/components/ui/button";
import { Approach, getDerivedStreetNames, Phase, Signal, useGTSSStore } from "gtss";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import MapTileLayers from "./map-tile-layers";

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});



interface SignalsMapProps {
  signals: Signal[];
  approaches?: Approach[];
  phases?: Phase[];
  onSignalSelect?: (signal: Signal) => void;
  onSignalUpdate?: (signalId: string, updates: Partial<Signal>) => void;
  /** Signal whose marker should be drawn in the highlight color (e.g. hovered row). */
  highlightedSignalId?: string | null;
  /** Optional completeness lookup so the popup can show the same %-bar as the table. */
  getCompletenessPct?: (signalId: string) => number;
  className?: string;
}

// Distinct icon used when a signal is being hovered in the list — bright pink
// dot with a white border and a soft halo so it pops against the default blue pins.
const highlightedSignalIcon = L.divIcon({
  className: "highlighted-signal-marker",
  html:
    '<div style="position:relative;width:22px;height:22px;">' +
    '<div style="position:absolute;inset:0;border-radius:50%;background:#ec4899;opacity:0.35;animation:none;"></div>' +
    '<div style="position:absolute;left:4px;top:4px;width:14px;height:14px;border-radius:50%;background:#ec4899;border:3px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>' +
    "</div>",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// Calculate endpoint for approach arrow based on bearing and distance
function getApproachEndpoint(
  lat: number,
  lng: number,
  bearing: number,
  distanceMeters: number = 50
): [number, number] {
  const R = 6371000; // Earth's radius in meters
  const bearingRad = (bearing * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceMeters / R) +
    Math.cos(lat1) * Math.sin(distanceMeters / R) * Math.cos(bearingRad)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(distanceMeters / R) * Math.cos(lat1),
    Math.cos(distanceMeters / R) - Math.sin(lat1) * Math.sin(lat2)
  );

  return [(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI];
}

// Approach arrow colors by index
export const approachColors = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f97316", // orange
  "#8b5cf6", // purple
  "#ef4444", // red
  "#14b8a6", // teal
  "#eab308", // yellow
  "#ec4899", // pink
];

function MapBounds({ signals }: { signals: Signal[] }) {
  const map = useMap();

  useEffect(() => {
    if (signals.length > 0) {
      const validSignals = signals.filter(signal => signal.latitude && signal.longitude);
      if (validSignals.length === 0) return;

      const group = new L.FeatureGroup(
        validSignals.map(signal =>
          L.marker([signal.latitude, signal.longitude])
        )
      );

      if (validSignals.length === 1) {
        // If only one signal, center on it with reasonable zoom
        map.setView([validSignals[0].latitude, validSignals[0].longitude], 15);
      } else {
        // If multiple signals, fit all markers in view
        map.fitBounds(group.getBounds(), { padding: [20, 20] });
      }
    }
  }, [signals, map]);

  return null;
}

// Compact map popup: street-name title, phase diagram with the intersection
// number in the middle, optional completeness bar, and a Full Details button.
function SignalPopup({
  signal,
  approaches,
  phases,
  getCompletenessPct,
  onSignalSelect,
}: {
  signal: Signal;
  approaches: Approach[];
  phases: Phase[];
  getCompletenessPct?: (signalId: string) => number;
  onSignalSelect?: (signal: Signal) => void;
}) {
  const signalApproaches = approaches.filter((a) => a.signalId === signal.signalId);
  const signalPhases = phases.filter((p) => p.signalId === signal.signalId);
  const derived = getDerivedStreetNames(signal.signalId, approaches);
  const s1 = derived.streetName1 || signal.streetName1;
  const s2 = derived.streetName2 || signal.streetName2;
  const title = s1 && s2 ? `${s1} & ${s2}` : s1 || s2 || signal.signalId;

  const pct = getCompletenessPct?.(signal.signalId);
  const barColor =
    pct === undefined ? ""
      : pct === 100 ? "bg-green-500"
        : pct >= 75 ? "bg-blue-500"
          : pct >= 50 ? "bg-amber-500"
            : pct >= 25 ? "bg-orange-500"
              : "bg-grey-300";
  const textColor = pct === 100 ? "text-green-700" : "text-grey-700";

  return (
    <div className="p-1 w-[260px]">
      <h3 className="text-sm font-semibold text-center text-grey-800 mb-1">{title}</h3>
      <div className="w-full h-[240px]">
        <PhaseDiagram
          phases={signalPhases}
          approaches={signalApproaches}
          intersectionId={signal.signalId}
        />
      </div>
      {pct !== undefined && (
        <div className="flex items-center gap-2 mt-1 mb-1 px-1">
          <span className="text-[10px] uppercase tracking-wide font-medium text-grey-500 flex-shrink-0">Complete</span>
          <div className="flex-1 h-1.5 bg-grey-200 rounded-full overflow-hidden">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <span className={`font-mono text-[11px] w-9 text-right ${textColor}`}>{pct}%</span>
        </div>
      )}
      <Button
        onClick={() => onSignalSelect?.(signal)}
        variant="outline"
        size="sm"
        className="text-xs h-7 w-full mt-1"
      >
        Full Details
      </Button>
    </div>
  );
}

export default function SignalsMap({ signals, approaches, phases, onSignalSelect, getCompletenessPct, highlightedSignalId, className }: SignalsMapProps) {
  const agency = useGTSSStore((state) => state.agency);

  // Use agency coordinates as starting point for map center
  const center: [number, number] = useMemo(() => {
    // First priority: use agency coordinates if available
    if (agency?.latitude && agency?.longitude) {
      return [agency.latitude, agency.longitude];
    }
    // Second priority: center on existing signals
    if (signals.length > 0 && signals[0].latitude && signals[0].longitude) {
      return [signals[0].latitude, signals[0].longitude];
    }
    // Default: center of US
    return [39.8283, -98.5795];
  }, [agency?.latitude, agency?.longitude, signals]);

  return (
    <div className={className} style={{ position: 'relative', zIndex: 1 }}>
      <MapContainer
        center={center}
        zoom={signals.length === 1 ? 15 : signals.length > 0 ? 13 : 4}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
        className="rounded-lg"
        key={`map-${signals.length}-${center[0]}-${center[1]}`}
      >
        <MapTileLayers />

        <MapBounds signals={signals} />

        {signals.filter(signal => signal.latitude && signal.longitude).map((signal) => (
          <Marker
            key={signal.id}
            position={[signal.latitude, signal.longitude]}
            icon={highlightedSignalId === signal.signalId ? highlightedSignalIcon : new L.Icon.Default()}
            zIndexOffset={highlightedSignalId === signal.signalId ? 1000 : 0}
          >
            <Popup minWidth={272}>
              <SignalPopup
                signal={signal}
                approaches={approaches || []}
                phases={phases || []}
                getCompletenessPct={getCompletenessPct}
                onSignalSelect={onSignalSelect}
              />
            </Popup>
          </Marker>
        ))}

        {/* Render approach arrows */}
        {approaches && signals.filter(signal => signal.latitude && signal.longitude).map((signal) => {
          const signalApproaches = approaches.filter(a => a.signalId === signal.signalId && a.compassBearing !== null);
          return signalApproaches.map((approach, idx) => {
            // Approach bearing indicates where traffic comes FROM, so add 180 to point the line toward the intersection
            const lineDirection = (approach.compassBearing! + 180) % 360;
            const endpoint = getApproachEndpoint(
              signal.latitude,
              signal.longitude,
              lineDirection,
              60 // distance in meters
            );
            const color = approachColors[idx % approachColors.length];
            return (
              <Polyline
                key={approach.id}
                positions={[
                  [signal.latitude, signal.longitude],
                  endpoint,
                ]}
                color={color}
                weight={4}
                opacity={0.8}
              />
            );
          });
        })}
      </MapContainer>
    </div>
  );
}