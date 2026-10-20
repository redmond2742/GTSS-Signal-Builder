import MapTileLayers from "@/components/ui/map-tile-layers";
import type { CorridorSignal } from "gtss";
import { useMapScrollZoom } from "gtss";
import type { Signal } from "gtss/schema";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, Popup, useMap } from "react-leaflet";

interface CorridorsMapProps {
  /** Corridor members, in any order — this component sorts by `sequence`. */
  corridorSignals: readonly CorridorSignal[];
  signals: readonly Signal[];
  /** Highlight one stop in the corridor, e.g. the row under the cursor. */
  highlightedSignalId?: string | null;
  onSignalSelect?: (signalId: string) => void;
  className?: string;
}

/** A signal placed in the corridor, with its position in the run. */
interface Stop {
  sequence: number;
  signalId: string;
  direction: string | null;
  lat: number;
  lng: number;
  missing: false;
}

/**
 * Numbered pin. A corridor's story is its ORDER, so the sequence number is the
 * marker rather than a tooltip you have to hunt for.
 */
const stopIcon = (sequence: number, highlighted: boolean) =>
  L.divIcon({
    className: "gtss-corridor-stop",
    html:
      `<div role="img" aria-label="Stop ${sequence}" style="width:26px;height:26px;` +
      `display:flex;align-items:center;justify-content:center;border-radius:50%;` +
      `background:${highlighted ? "#ec4899" : "#2563eb"};color:#fff;` +
      `font:600 12px/1 ui-sans-serif,system-ui,sans-serif;` +
      `border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);">${sequence}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });

function FitToCorridor({ stops }: { stops: Stop[] }) {
  const map = useMap();
  useEffect(() => {
    if (stops.length === 0) return;
    if (stops.length === 1) {
      map.setView([stops[0].lat, stops[0].lng], 16);
      return;
    }
    const group = new L.FeatureGroup(stops.map((s) => L.marker([s.lat, s.lng])));
    map.fitBounds(group.getBounds(), { padding: [28, 28] });
  }, [stops, map]);
  return null;
}

/**
 * A corridor drawn in travel order: numbered pins joined by a polyline.
 *
 * Separate from `SignalsMap` on purpose. That component is 413 lines shared by
 * three pages and takes signals/approaches/phases as props; a corridor needs a
 * different marker, an ordered polyline and a different fit, and bolting a
 * fourth optional prop set onto it would make every existing caller carry the
 * weight.
 */
export default function CorridorsMap({
  corridorSignals,
  signals,
  highlightedSignalId,
  onSignalSelect,
  className,
}: CorridorsMapProps) {
  const mapScrollZoom = useMapScrollZoom();

  const byId = new Map(signals.map((s) => [s.signalId, s]));

  const ordered = [...corridorSignals].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  const stops: Stop[] = [];
  const unplaced: string[] = [];
  ordered.forEach((cs, index) => {
    const signal = byId.get(cs.signalId);
    if (!signal || signal.latitude == null || signal.longitude == null) {
      unplaced.push(cs.signalId);
      return;
    }
    stops.push({
      sequence: cs.sequence ?? index + 1,
      signalId: cs.signalId,
      direction: cs.direction,
      lat: signal.latitude,
      lng: signal.longitude,
      missing: false,
    });
  });

  if (stops.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-grey-200 bg-grey-50 p-4 text-center text-sm text-grey-500 ${className ?? ""}`}
      >
        {corridorSignals.length === 0
          ? "No corridor selected."
          : "None of this corridor's signals have coordinates yet, so it can't be drawn."}
      </div>
    );
  }

  const center: [number, number] = [stops[0].lat, stops[0].lng];

  return (
    <div className={className} style={{ position: "relative", zIndex: 1 }}>
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom={mapScrollZoom}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
        className="rounded-lg"
        key={`corridor-${stops.length}-${center[0]}-${center[1]}`}
      >
        <MapTileLayers />
        <FitToCorridor stops={stops} />

        {/* The run itself. `positions` already takes N points — the existing
            approach arrows just happen to pass two. */}
        {stops.length > 1 && (
          <Polyline
            positions={stops.map((s) => [s.lat, s.lng] as [number, number])}
            color="#2563eb"
            weight={4}
            opacity={0.65}
          />
        )}

        {stops.map((stop) => (
          <Marker
            key={`${stop.signalId}-${stop.sequence}`}
            position={[stop.lat, stop.lng]}
            icon={stopIcon(stop.sequence, highlightedSignalId === stop.signalId)}
            zIndexOffset={highlightedSignalId === stop.signalId ? 1000 : 0}
            alt={`Stop ${stop.sequence}: signal ${stop.signalId}`}
            title={`Stop ${stop.sequence}: signal ${stop.signalId}`}
            eventHandlers={{ click: () => onSignalSelect?.(stop.signalId) }}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-semibold">
                  {stop.sequence}. Signal {stop.signalId}
                </div>
                {stop.direction && <div className="text-grey-600">Direction {stop.direction}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {unplaced.length > 0 && (
        <p className="absolute bottom-1 left-1 z-[1000] rounded bg-white/90 px-2 py-1 text-[11px] text-amber-700 shadow">
          {unplaced.length} signal{unplaced.length === 1 ? "" : "s"} not drawn (no coordinates):{" "}
          {unplaced.slice(0, 3).join(", ")}
          {unplaced.length > 3 ? "…" : ""}
        </p>
      )}
    </div>
  );
}
