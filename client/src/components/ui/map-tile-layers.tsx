import { useState } from "react";
import { LayersControl, TileLayer } from "react-leaflet";

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

export default function MapTileLayers() {
  const [overLimit, setOverLimit] = useState(() => readCount() >= DAILY_TILE_LIMIT);
  const mapboxAvailable = !!MAPBOX_TOKEN && !overLimit;

  // Without a token (or when rate-limited), render a plain TileLayer so existing
  // maps keep working without the layer-control UI.
  if (!mapboxAvailable) {
    return (
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
    );
  }

  const handleTileLoadStart = () => {
    const next = readCount() + 1;
    writeCount(next);
    if (next >= DAILY_TILE_LIMIT) setOverLimit(true);
  };

  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Streets">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Satellite">
        <TileLayer
          attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`}
          tileSize={512}
          zoomOffset={-1}
          maxZoom={22}
          eventHandlers={{ tileloadstart: handleTileLoadStart }}
        />
      </LayersControl.BaseLayer>
    </LayersControl>
  );
}
