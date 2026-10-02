import { useEffect, useState } from "react";
import type { ControlPosition } from "leaflet";
import { LayersControl, TileLayer, useMap } from "react-leaflet";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Free tier is 200,000 raster tile requests/month (~6,600/day).
// Cap at 5,000 tiles/day to stay safely under the limit with buffer for
// month-end spikes. Using 512px tiles + zoomOffset=-1 means each request
// covers 4x the area of a default 256px tile.
const DAILY_TILE_LIMIT = 5000;

const counterKey = () => {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `mapbox_tiles_${ymd}`;
};

const readCount = (): number => {
  try {
    return parseInt(localStorage.getItem(counterKey()) || "0", 10) || 0;
  } catch {
    return 0;
  }
};

const writeCount = (n: number) => {
  try {
    localStorage.setItem(counterKey(), String(n));
  } catch {
    // localStorage unavailable — ignore
  }
};

export default function MapTileLayers({ position = "topright" }: { position?: ControlPosition }) {
  const [overLimit, setOverLimit] = useState(() => readCount() >= DAILY_TILE_LIMIT);
  const mapboxAvailable = !!MAPBOX_TOKEN && !overLimit;

  // Render a LayersControl with a Streets base layer and a Satellite base layer.
  // Use Mapbox satellite when available (and not rate-limited); otherwise fall
  // back to Esri World Imagery so users always have a satellite option.

  const handleTileLoadStart = () => {
    const next = readCount() + 1;
    writeCount(next);
    if (next >= DAILY_TILE_LIMIT) setOverLimit(true);
  };

  return (
    <>
      <LayersControl position={position}>
        <LayersControl.BaseLayer checked name="Streets">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Satellite">
          {mapboxAvailable ? (
            <TileLayer
              attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url={`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`}
              tileSize={512}
              zoomOffset={-1}
              maxZoom={22}
              eventHandlers={{ tileloadstart: handleTileLoadStart }}
            />
          ) : (
            <TileLayer
              attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={22}
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
        </LayersControl.BaseLayer>
      </LayersControl>

      {/* Ensure Leaflet invalidates size when the map container resizes */}
      <MapResizeHandler />
    </>
  );
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    if (!container) return;

    let raf = 0 as number | undefined;
    const ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          map.invalidateSize();
        } catch {
          //
        }
      });
    });
    ro.observe(container);

    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          map.invalidateSize();
        } catch {
          //
        }
      });
    };

    container.addEventListener("transitionend", onResize);
    window.addEventListener("resize", onResize);

    return () => {
      ro.disconnect();
      container.removeEventListener("transitionend", onResize);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [map]);

  return null;
}
