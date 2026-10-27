import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MapTileLayers from "@/components/ui/map-tile-layers";
import { sortBySequence, useMapScrollZoom, type Corridor, type CorridorSignal } from "gtss";
import type { Signal } from "gtss/schema";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowRight, Map as MapIcon, Plus } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Tooltip, useMap } from "react-leaflet";

interface CorridorsOverviewMapProps {
  corridors: readonly Corridor[];
  corridorSignals: readonly CorridorSignal[];
  signals: readonly Signal[];
  /** Open one corridor's own page (corridorSignals.txt). */
  onOpenCorridor?: (corridorId: string) => void;
  /** Start a new corridor. */
  onNewCorridor?: () => void;
}

/** Distinct, readable on the street tiles, and not the green or red of signal timing. */
const PALETTE = [
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#4f46e5",
  "#ea580c",
  "#0d9488",
  "#9333ea",
];
const corridorColour = (index: number) => PALETTE[index % PALETTE.length];

/** Frame every corridor once, and again only when the set of points changes. */
function FitAll({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap();
  const latest = useRef(points);
  latest.current = points;
  useEffect(() => {
    const pts = latest.current;
    if (pts.length === 0) return;
    if (pts.length === 1) map.setView(pts[0], 15);
    else map.fitBounds(L.latLngBounds(pts), { padding: [28, 28] });
  }, [fitKey, map]);
  return null;
}

/**
 * Every corridor on one map, each a line of its own colour through its signals
 * in order. The page for one corridor (corridorSignals.txt) is where its order
 * is edited; this is the lay of the land, and the way into each.
 */
export default function CorridorsOverviewMap({
  corridors,
  corridorSignals,
  signals,
  onOpenCorridor,
  onNewCorridor,
}: CorridorsOverviewMapProps) {
  const mapScrollZoom = useMapScrollZoom();
  const [hovered, setHovered] = useState<string | null>(null);
  const byId = new Map(signals.map((s) => [s.signalId, s]));

  const lines = corridors.map((corridor, index) => {
    const members = sortBySequence(
      corridorSignals.filter((cs) => cs.corridorId === corridor.corridorId),
    );
    const stops = members.flatMap((cs) => {
      const s = byId.get(cs.signalId);
      return s && s.latitude != null && s.longitude != null
        ? [
            {
              signalId: cs.signalId,
              sequence: cs.sequence,
              at: [s.latitude, s.longitude] as [number, number],
            },
          ]
        : [];
    });
    return {
      corridor,
      colour: corridorColour(index),
      stops,
      signalCount: members.length,
      unplaced: members.length - stops.length,
    };
  });

  const points = lines.flatMap((l) => l.stops.map((s) => s.at));
  const fitKey = points
    .map(([lat, lng]) => `${lat},${lng}`)
    .sort()
    .join("|");

  return (
    <Card>
      <CardHeader className="border-b border-grey-200 bg-grey-50 px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-grey-800">
            <MapIcon className="h-4 w-4 text-primary-600" />
            Corridors
            <span className="text-xs font-normal text-grey-500">
              {corridors.length} corridor{corridors.length === 1 ? "" : "s"}
            </span>
          </CardTitle>
          {onNewCorridor && (
            <Button variant="outline" onClick={onNewCorridor} className="h-7 px-2 text-xs">
              <Plus className="mr-1 h-3 w-3" />
              New corridor
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          {points.length === 0 ? (
            <div className="flex h-[380px] items-center justify-center rounded-lg border border-grey-200 bg-grey-50 p-4 text-center text-sm text-grey-500">
              None of the corridors&rsquo; signals have coordinates yet, so there is nothing to
              draw.
            </div>
          ) : (
            <div className="h-[380px] w-full" style={{ position: "relative", zIndex: 1 }}>
              <MapContainer
                center={points[0]}
                zoom={14}
                scrollWheelZoom={mapScrollZoom}
                style={{ height: "100%", width: "100%", zIndex: 1 }}
                className="rounded-lg"
              >
                <MapTileLayers />
                <FitAll points={points} fitKey={fitKey} />
                {lines.map(({ corridor, colour, stops }) => {
                  const lit = hovered === corridor.corridorId;
                  const dim = hovered !== null && !lit;
                  const open = onOpenCorridor
                    ? { click: () => onOpenCorridor(corridor.corridorId) }
                    : {};
                  const hover = {
                    mouseover: () => setHovered(corridor.corridorId),
                    mouseout: () => setHovered(null),
                  };
                  const label = `${corridor.corridorId}${corridor.name ? ` — ${corridor.name}` : ""}`;
                  return (
                    <Fragment key={corridor.corridorId}>
                      {stops.length > 1 && (
                        <Polyline
                          positions={stops.map((s) => s.at)}
                          pathOptions={{
                            color: colour,
                            weight: lit ? 8 : 5,
                            opacity: dim ? 0.35 : 0.85,
                          }}
                          eventHandlers={{ ...open, ...hover }}
                        >
                          <Tooltip sticky>{label}</Tooltip>
                        </Polyline>
                      )}
                      {stops.map((s, i) => (
                        <CircleMarker
                          key={s.signalId}
                          center={s.at}
                          // The first signal is a little larger: where the run starts.
                          radius={i === 0 ? 6 : 4}
                          pathOptions={{
                            color: "#ffffff",
                            weight: 1.5,
                            fillColor: colour,
                            fillOpacity: dim ? 0.4 : 1,
                          }}
                          eventHandlers={{ ...open, ...hover }}
                        >
                          <Tooltip direction="top" offset={[0, -4]}>
                            {`${label}: ${s.sequence ?? i + 1}. ${s.signalId}`}
                          </Tooltip>
                        </CircleMarker>
                      ))}
                    </Fragment>
                  );
                })}
              </MapContainer>
            </div>
          )}

          <ul
            className="flex max-h-[380px] flex-col gap-1 overflow-y-auto"
            aria-label="Corridors on the map"
          >
            {lines.map(({ corridor, colour, signalCount, unplaced }) => (
              <li key={corridor.corridorId}>
                <div
                  onMouseEnter={() => setHovered(corridor.corridorId)}
                  onMouseLeave={() => setHovered(null)}
                  className={`flex items-start gap-2 rounded border px-2 py-1.5 text-xs ${
                    hovered === corridor.corridorId
                      ? "border-grey-400 bg-grey-50"
                      : "border-grey-200"
                  }`}
                >
                  <span
                    className="mt-1 inline-block h-1.5 w-5 shrink-0 rounded-full"
                    style={{ background: colour }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-grey-800">{corridor.corridorId}</span>
                    {corridor.name && (
                      <span className="block truncate text-grey-600">{corridor.name}</span>
                    )}
                    <span className="block text-[11px] text-grey-500">
                      {corridor.primaryDirection ?? "No direction"} · {signalCount} signal
                      {signalCount === 1 ? "" : "s"}
                      {unplaced > 0 ? ` · ${unplaced} not on the map (no coordinates)` : ""}
                    </span>
                  </span>
                  {onOpenCorridor && (
                    <Button
                      variant="ghost"
                      onClick={() => onOpenCorridor(corridor.corridorId)}
                      aria-label={`Open ${corridor.corridorId}'s signals`}
                      title="Open its signals, in order (corridorSignals.txt)"
                      className="h-6 w-6 shrink-0 p-0"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
