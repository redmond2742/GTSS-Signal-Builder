import MapTileLayers from "@/components/ui/map-tile-layers";
import type { CorridorSignal } from "gtss";
import { sortBySequence, useMapScrollZoom } from "gtss";
import type { Signal } from "gtss/schema";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  Tooltip,
  useMap,
} from "react-leaflet";

/** What a pin says: its place in the run, the signal it is, or both. */
export type PinLabelMode = "sequence" | "signalId" | "both";

interface CorridorsMapProps {
  /** Corridor members, in any order — this component sorts by `sequence`. */
  corridorSignals: readonly CorridorSignal[];
  signals: readonly Signal[];
  labelMode?: PinLabelMode;
  /** Highlight one stop in the corridor, e.g. the row under the cursor. */
  highlightedSignalId?: string | null;
  /** Pointer entered / left a pin, so the list beside the map can follow. */
  onSignalHover?: (signalId: string | null) => void;
  onSignalSelect?: (signalId: string) => void;
  /**
   * GTSS signals not in the corridor, drawn as small grey dots. Clicking one calls
   * `onCandidateSelect`, which is how a signal is added from the map.
   */
  candidates?: readonly Signal[];
  onCandidateSelect?: (signalId: string) => void;
  /** A second line for a candidate's tooltip, e.g. its street names. */
  candidateLabel?: (signalId: string) => string;
  /** What clicking a stop does, added to its hover title ("click to take it out"). */
  selectHint?: string;
  /**
   * Frame every signal, stops and candidates alike, rather than just the stops.
   * While a corridor is being picked that set doesn't change, so the map holds
   * still instead of jumping to each new stop.
   */
  frameAll?: boolean;
  className?: string;
}

/** A signal placed in the corridor, with its position in the run. */
interface Stop {
  sequence: number;
  signalId: string;
  direction: string | null;
  lat: number;
  lng: number;
}

// Signal IDs are free text from an imported file and go into divIcon markup,
// which Leaflet assigns as innerHTML. Escape them.
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const PIN_HEIGHT = 26;
const PIN_CHAR_WIDTH = 6.6;

const pinText = (stop: Stop, mode: PinLabelMode) => {
  if (mode === "signalId") return stop.signalId;
  if (mode === "both") return `${stop.sequence} · ${stop.signalId}`;
  return String(stop.sequence);
};

/**
 * Pin for one stop. A corridor's story is its ORDER, so by default the sequence
 * number is the marker rather than a tooltip you have to hunt for; the signal ID
 * is a toggle away for when you are matching the map to a timing sheet.
 * Text pins grow to fit and turn from a disc into a pill.
 */
const stopIcon = (stop: Stop, mode: PinLabelMode, highlighted: boolean) => {
  const text = pinText(stop, mode);
  const disc = mode === "sequence";
  const width = disc
    ? PIN_HEIGHT
    : Math.max(PIN_HEIGHT, Math.round(text.length * PIN_CHAR_WIDTH) + 16);
  return L.divIcon({
    className: "gtss-corridor-stop",
    html:
      `<div role="img" aria-label="Stop ${stop.sequence}: signal ${escapeHtml(stop.signalId)}" ` +
      `style="width:${width}px;height:${PIN_HEIGHT}px;` +
      `display:flex;align-items:center;justify-content:center;` +
      `border-radius:${PIN_HEIGHT / 2}px;white-space:nowrap;` +
      `background:${highlighted ? "#ec4899" : "#2563eb"};color:#fff;` +
      `font:600 12px/1 ui-sans-serif,system-ui,sans-serif;` +
      `border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);">${escapeHtml(text)}</div>`,
    iconSize: [width, PIN_HEIGHT],
    iconAnchor: [width / 2, PIN_HEIGHT / 2],
    popupAnchor: [0, -(PIN_HEIGHT / 2 + 1)],
  });
};

/**
 * Fit the view to the corridor when it changes — not when it is merely
 * re-rendered. `fitKey` stands in for "which signals, where": hovering a list
 * row or reordering the stops rebuilds `points` every time, and refitting on
 * that would throw away whatever pan and zoom the user had settled on.
 */
function FitToCorridor({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap();
  // Read through a ref so the effect depends on the key alone; `points` is a new
  // array every render and listing it would refit every render.
  const latest = useRef(points);
  latest.current = points;

  useEffect(() => {
    const pts = latest.current;
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], 16);
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [28, 28] });
  }, [fitKey, map]);
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
  labelMode = "sequence",
  highlightedSignalId,
  onSignalHover,
  onSignalSelect,
  candidates = [],
  onCandidateSelect,
  candidateLabel,
  selectHint,
  frameAll = false,
  className,
}: CorridorsMapProps) {
  const mapScrollZoom = useMapScrollZoom();

  const byId = new Map(signals.map((s) => [s.signalId, s]));

  const stops: Stop[] = [];
  const unplaced: string[] = [];
  sortBySequence(corridorSignals).forEach((cs, index) => {
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
    });
  });

  const candidatePoints = candidates
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => [c.latitude, c.longitude] as [number, number]);

  // An empty corridor still gets a map if there are signals to add from it.
  if (stops.length === 0 && candidatePoints.length === 0) {
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

  const points = stops.map((s) => [s.lat, s.lng] as [number, number]);
  // Frame the corridor; with no stops yet, frame the signals it could be built from.
  const framing = frameAll || points.length === 0 ? [...points, ...candidatePoints] : points;
  // Order-independent on purpose: moving a stop must not move the camera.
  const fitKey = framing
    .map(([lat, lng]) => `${lat},${lng}`)
    .sort()
    .join("|");

  return (
    <div className={className} style={{ position: "relative", zIndex: 1 }}>
      <MapContainer
        center={framing[0]}
        zoom={14}
        scrollWheelZoom={mapScrollZoom}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
        className="rounded-lg"
        key={fitKey}
      >
        <MapTileLayers />
        <FitToCorridor points={framing} fitKey={fitKey} />

        {/* The run itself. `positions` already takes N points — the existing
            approach arrows just happen to pass two. */}
        {points.length > 1 && (
          // Not clickable: drawn after the grey dots, it would otherwise sit on
          // top of any that lie along it and swallow the click meant for them.
          <Polyline
            positions={points}
            color="#2563eb"
            weight={4}
            opacity={0.65}
            interactive={false}
          />
        )}

        {/* Signals that could join the corridor. Under the corridor's own pins. */}
        {candidates
          .filter((c) => c.latitude != null && c.longitude != null)
          .map((c) => (
            <CircleMarker
              key={`cand-${c.signalId}`}
              center={[c.latitude, c.longitude]}
              radius={6}
              pathOptions={{
                color: "#6b7280",
                weight: 1.5,
                fillColor: "#d1d5db",
                fillOpacity: 0.9,
              }}
              eventHandlers={
                onCandidateSelect ? { click: () => onCandidateSelect(c.signalId) } : {}
              }
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {onCandidateSelect ? `Add ${c.signalId} to the corridor` : c.signalId}
                {candidateLabel?.(c.signalId) ? (
                  <div className="text-[10px] text-grey-500">{candidateLabel(c.signalId)}</div>
                ) : null}
              </Tooltip>
            </CircleMarker>
          ))}

        {stops.map((stop) => (
          <Marker
            key={`${stop.signalId}-${stop.sequence}`}
            position={[stop.lat, stop.lng]}
            icon={stopIcon(stop, labelMode, highlightedSignalId === stop.signalId)}
            zIndexOffset={highlightedSignalId === stop.signalId ? 1000 : 0}
            alt={`Stop ${stop.sequence}: signal ${stop.signalId}`}
            title={`Stop ${stop.sequence}: signal ${stop.signalId}${selectHint ? ` (${selectHint})` : ""}`}
            eventHandlers={{
              click: () => onSignalSelect?.(stop.signalId),
              mouseover: () => onSignalHover?.(stop.signalId),
              mouseout: () => onSignalHover?.(null),
            }}
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
