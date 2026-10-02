import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  computeDefaultDirections,
  DIVIDER_CODES,
  fromDisplayWidth,
  LANE_TYPE_CODES,
  parseLaneConfig,
  serializeLaneConfig,
  toDisplayWidth,
  type LaneCategory,
  type LaneDirection,
  type LaneSegment,
} from "gtss";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

interface LaneConfigEditorProps {
  laneConfig: string | null | undefined;
  laneWidth: string | null | undefined;
  laneDirection: string | null | undefined;
  isMetric: boolean;
  isLht: boolean;
  onChange: (laneConfig: string, laneWidth: string, laneDirection: string) => void;
  readOnly?: boolean;
}

const DIRECTION_ARROWS: Record<LaneDirection, string> = {
  I: "↑",
  O: "↓",
  B: "↕",
  T: "↑ ↓ ◷",
};

const DIRECTION_CYCLE: Record<LaneDirection, LaneDirection> = {
  I: "O",
  O: "B",
  B: "T",
  T: "I",
};

function cycleDirection(direction: LaneDirection): LaneDirection {
  return DIRECTION_CYCLE[direction];
}

const LANE_CATEGORY_LABELS: Record<LaneCategory, string> = {
  sidewalk: "Sidewalk",
  transit: "Transit",
  bike: "Bike",
  car: "Car",
  rail: "Rail",
};

const DIVIDER_GROUP_LABELS: Record<string, string> = {
  line: "Lines",
  barrier: "Dividers & Barriers",
  surface: "Non-driving Surfaces",
};

const MIN_PX_PER_SEGMENT = 18;
const DIAGRAM_WIDTH = 640;
const DIAGRAM_HEIGHT = 164;
const RECT_TOP = 10;
const RECT_HEIGHT = 80;
const DECAL_Y = RECT_TOP + RECT_HEIGHT / 2;
const DECAL_STROKE = "#1f2937";
const DECAL_LIGHT = "#ffffff";

const COMMON_LANE_CONFIGS = [
  { name: "Two-way residential", config: "S-C:C-S", widths: "60|0|132|0|132|0|60" },
  { name: "Two-way bike lanes", config: "S-B:C:C:B-S", widths: "60|0|60|0|132|0|132|0|60|0|60" },
  { name: "One-way couplet", config: "S-C:C|C:C-S", widths: "60|0|132|0|132|0|132|0|132|0|60" },
  { name: "Bus lane and general lane", config: "S-A:C|C-S", widths: "60|0|60|0|132|0|132|0|60" },
  { name: "Curbside parking", config: "S-K:C:C-S", widths: "60|0|84|0|132|0|132|0|60" },
  { name: "Protected bike lanes", config: "S-P#C:C#P-S", widths: "60|0|60|0|132|0|132|0|60|0|60" },
  {
    name: "Raised median arterial",
    config: "S-C:C=C:C-S",
    widths: "60|0|132|0|132|0|48|0|132|0|60",
  },
  { name: "Shoulder road", config: "S>C:C>C-S", widths: "60|0|60|0|132|0|60|0|132|0|60" },
] as const;

// Schematic road-marking decals painted on each lane type's pavement.
function laneDecal(code: string, cx: number, cy: number, key: string) {
  const transform = `translate(${cx}, ${cy})`;
  switch (code) {
    case "B":
    case "P":
      return (
        <g key={key} transform={transform} fill="none" stroke={DECAL_STROKE} strokeWidth={1.2}>
          <circle cx={-5} cy={4} r={3.5} />
          <circle cx={5} cy={4} r={3.5} />
          <path d="M-5,4 L-1,-4 L2,4 L-5,4 M-1,-4 L5,4 M-1,-4 L3,-5 L5,-3" />
          <circle cx={2} cy={4} r={1} />
        </g>
      );
    case "A":
      return (
        <g key={key} transform={transform} fill="none" stroke={DECAL_LIGHT} strokeWidth={1.2}>
          <path d="M0,-13 L8,-5 L0,3 L-8,-5 Z" />
          <text
            y={13}
            textAnchor="middle"
            fontSize={7.5}
            fontWeight="bold"
            fill={DECAL_LIGHT}
            stroke="none"
          >
            BUS
          </text>
        </g>
      );
    case "T":
      return (
        <g key={key} transform={transform} fill="none" stroke={DECAL_STROKE} strokeWidth={1.2}>
          <rect x={-7} y={-9} width={14} height={18} rx={2} />
          <rect x={-4} y={-6} width={8} height={5} rx={0.5} />
          <line x1={-4} y1={2} x2={4} y2={2} />
          <circle cx={-4} cy={7} r={1.5} fill={DECAL_STROKE} />
          <circle cx={4} cy={7} r={1.5} fill={DECAL_STROKE} />
        </g>
      );
    case "K":
      return (
        <g key={key} transform={transform} fill="none" stroke={DECAL_LIGHT} strokeWidth={1.2}>
          <rect x={-8} y={-9} width={16} height={18} />
          <text
            y={4.5}
            textAnchor="middle"
            fontSize={11}
            fontFamily="Arial, sans-serif"
            fontWeight="bold"
            fill={DECAL_LIGHT}
            stroke="none"
          >
            P
          </text>
        </g>
      );
    case "R":
    case "L":
      return (
        <g key={key} transform={transform} stroke={DECAL_STROKE} strokeWidth={1.2}>
          <line x1={-4} y1={-10} x2={-4} y2={10} />
          <line x1={4} y1={-10} x2={4} y2={10} />
          <path d="M-6,-7 L6,-7 M-6,-2 L6,-2 M-6,3 L6,3 M-6,8 L6,8" />
        </g>
      );
    case "C":
      return (
        <g key={key} transform={transform} fill="none" stroke="#ffffff" strokeWidth={1.2}>
          <path d="M-5,8 L-5,-3 L-3,-8 L3,-8 L5,-3 L5,8 Z" />
          <path d="M-3,-3 L3,-3 L2,-7 L-2,-7 Z" />
          <line x1={-5} y1={3} x2={5} y2={3} />
          <circle cx={-3} cy={6} r={1} fill={DECAL_LIGHT} />
          <circle cx={3} cy={6} r={1} fill={DECAL_LIGHT} />
        </g>
      );
    case "S":
      return (
        <g key={key} transform={transform}>
          <image
            href="/images/lane-config/WD.svg"
            x={-15}
            y={-15}
            width={30}
            height={30}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      );
    default:
      return null;
  }
}

function segmentDecals(segment: LaneSegment, rectX: number, width: number) {
  if (segment.kind !== "lane") return null;
  if (segment.parts.length === 2) {
    return (
      <>
        {laneDecal(segment.parts[0], rectX + width / 2, RECT_TOP + RECT_HEIGHT / 4, "decal-0")}
        {laneDecal(
          segment.parts[1],
          rectX + width / 2,
          RECT_TOP + (3 * RECT_HEIGHT) / 4,
          "decal-1",
        )}
      </>
    );
  }
  return laneDecal(segment.parts[0], rectX + width / 2, DECAL_Y, "decal-0");
}

function segmentColors(segment: LaneSegment): string[] {
  if (segment.kind === "divider") return [DIVIDER_CODES[segment.raw]?.color ?? "#999"];
  return segment.parts.map((part) => LANE_TYPE_CODES[part]?.color ?? "#999");
}

function LaneTypeIcon({ code }: { code: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 28"
      width="28"
      height="28"
      className="shrink-0 rounded-sm bg-gray-100"
    >
      {laneDecal(code, 14, 14, `modal-${code}`)}
    </svg>
  );
}

function CommonLaneConfigsDialog({
  isLht,
  onChoose,
}: {
  isLht: boolean;
  onChoose: (config: (typeof COMMON_LANE_CONFIGS)[number]) => void;
}) {
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Common Lane Configs</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {COMMON_LANE_CONFIGS.map((config) => (
          <button
            key={config.name}
            type="button"
            className="rounded-md border bg-background p-2 text-left transition-colors hover:bg-accent"
            onClick={() => onChoose(config)}
          >
            <span className="mb-1 block text-sm font-medium">{config.name}</span>
            <LaneConfigEditor
              laneConfig={config.config}
              laneWidth={config.widths}
              laneDirection={null}
              isMetric={false}
              isLht={isLht}
              readOnly
              onChange={() => undefined}
            />
          </button>
        ))}
      </div>
    </DialogContent>
  );
}

export function CommonLaneConfigsButton({
  isLht,
  onApply,
}: {
  isLht: boolean;
  onApply: (laneConfig: string, laneWidth: string, laneDirection: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<(typeof COMMON_LANE_CONFIGS)[number] | null>(
    null,
  );

  const requestConfig = (config: (typeof COMMON_LANE_CONFIGS)[number]) => {
    setPendingConfig(config);
    setOpen(false);
  };

  const confirmConfig = () => {
    if (!pendingConfig) return;
    const config = pendingConfig;
    const serialized = serializeLaneConfig(
      parseLaneConfig(config.config, config.widths, undefined, isLht),
    );
    onApply(serialized.laneConfig, serialized.laneWidth, serialized.laneDirection);
    setPendingConfig(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            Common Lane Configs
          </Button>
        </DialogTrigger>
        <CommonLaneConfigsDialog isLht={isLht} onChoose={requestConfig} />
      </Dialog>
      <Dialog
        open={pendingConfig !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingConfig(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Overwrite lane configuration?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Selecting &quot;{pendingConfig?.name}&quot; will overwrite the existing lane
            configuration, widths, and directions.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingConfig(null)}>
              No, keep current
            </Button>
            <Button type="button" onClick={confirmConfig}>
              Yes, overwrite
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoadChoiceMenu({
  onChoose,
  lanesOnly = false,
  title,
}: {
  onChoose: (code: string) => void;
  lanesOnly?: boolean;
  title: string;
}) {
  return (
    <DialogContent className="max-w-5xl p-4">
      <DialogHeader>
        <DialogTitle className="text-base">{title}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          {(["sidewalk", "transit", "bike", "car", "rail"] as LaneCategory[]).map((category) => (
            <div key={category} className="space-y-1">
              <h3 className="text-xs font-medium">{LANE_CATEGORY_LABELS[category]}</h3>
              <div className="grid grid-cols-1 gap-1">
                {Object.values(LANE_TYPE_CODES)
                  .filter((type) => type.category === category)
                  .map((type) => (
                    <Button
                      key={type.code}
                      type="button"
                      variant="outline"
                      className="justify-start h-9 min-h-0 gap-2 px-2 text-xs whitespace-normal text-left"
                      onClick={() => onChoose(type.code)}
                    >
                      <LaneTypeIcon code={type.code} />
                      <span>{type.label}</span>
                    </Button>
                  ))}
              </div>
            </div>
          ))}
        </div>
        {!lanesOnly && (
          <div className="grid grid-cols-2 gap-3">
            {(["line", "barrier", "surface"] as const).map((group) => (
              <div key={group} className="space-y-1">
                <h3 className="text-xs font-medium">{DIVIDER_GROUP_LABELS[group]}</h3>
                <div className="grid grid-cols-1 gap-1">
                  {Object.values(DIVIDER_CODES)
                    .filter((divider) => divider.category === group)
                    .map((divider) => (
                      <Button
                        key={divider.code}
                        type="button"
                        variant="outline"
                        className="justify-start h-8 min-h-0 px-2 text-xs whitespace-normal text-left"
                        onClick={() => onChoose(divider.code)}
                      >
                        <span className="font-mono font-semibold w-6 shrink-0">{divider.code}</span>
                        <span>{divider.label}</span>
                      </Button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DialogContent>
  );
}

export default function LaneConfigEditor({
  laneConfig,
  laneWidth,
  laneDirection,
  isMetric,
  isLht,
  onChange,
  readOnly = false,
}: LaneConfigEditorProps) {
  const segments = useMemo(
    () => parseLaneConfig(laneConfig, laneWidth, laneDirection, isLht),
    [laneConfig, laneWidth, laneDirection, isLht],
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [roadChoiceIndex, setRoadChoiceIndex] = useState<number | null>(null);
  const [combineLaneIndex, setCombineLaneIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [emptyAddOpen, setEmptyAddOpen] = useState(false);
  const [insertPosition, setInsertPosition] = useState<{
    index: number;
    side: "before" | "after";
  } | null>(null);

  const commit = (next: LaneSegment[]) => {
    const {
      laneConfig: nextConfig,
      laneWidth: nextWidth,
      laneDirection: nextDirection,
    } = serializeLaneConfig(next);
    onChange(nextConfig, nextWidth, nextDirection);
  };

  const updateSegment = (index: number, updates: Partial<LaneSegment>) => {
    const next = segments.map((segment, i) => (i === index ? { ...segment, ...updates } : segment));
    commit(next);
  };

  const addLaneMode = (code: string) => {
    if (combineLaneIndex === null || !(code in LANE_TYPE_CODES)) return;
    const current = segments[combineLaneIndex];
    if (current?.kind !== "lane" || current.parts.length !== 1) return;
    const parts = [...current.parts, code];
    const next = segments.map((segment, index) =>
      index === combineLaneIndex ? { ...segment, raw: parts.join("+"), parts } : segment,
    );
    commit(next);
    setSelectedIndex(combineLaneIndex);
    setCombineLaneIndex(null);
  };

  const chooseRoadSegment = (code: string) => {
    if (roadChoiceIndex === null) return;
    const index = roadChoiceIndex;
    const isLane = code in LANE_TYPE_CODES;
    const current = segments[index];
    const nextSegment: LaneSegment = isLane
      ? {
          kind: "lane",
          raw: code,
          parts: [code],
          width:
            current.kind === "lane"
              ? current.width
              : LANE_TYPE_CODES[code].category === "car"
                ? 132
                : 60,
          direction: current.direction,
        }
      : { kind: "divider", raw: code, parts: [code], width: 0, direction: "B" };
    const next = segments.map((segment, segmentIndex) =>
      segmentIndex === index ? nextSegment : segment,
    );
    commit(next);
    setSelectedIndex(index);
    setRoadChoiceIndex(null);
  };

  const insertSegment = (code: string) => {
    if (!insertPosition || (!(code in LANE_TYPE_CODES) && !(code in DIVIDER_CODES))) return;
    const insertAt =
      insertPosition.side === "before" ? insertPosition.index : insertPosition.index + 1;
    const segment: LaneSegment =
      code in LANE_TYPE_CODES
        ? {
            kind: "lane",
            raw: code,
            parts: [code],
            width: LANE_TYPE_CODES[code].category === "car" ? 132 : 60,
            direction: "B",
          }
        : { kind: "divider", raw: code, parts: [code], width: 0, direction: "B" };
    const next = [...segments.slice(0, insertAt), segment, ...segments.slice(insertAt)];
    const defaults = computeDefaultDirections(next, isLht);
    next[insertAt] = { ...next[insertAt], direction: defaults[insertAt] };
    commit(next);
    setSelectedIndex(insertAt);
    setInsertPosition(null);
  };

  const addFirstLane = (code: string) => {
    if (!(code in LANE_TYPE_CODES)) return;
    const segment: LaneSegment = {
      kind: "lane",
      raw: code,
      parts: [code],
      width: LANE_TYPE_CODES[code].category === "car" ? 132 : 60,
      direction: computeDefaultDirections([{ kind: "lane", raw: code, parts: [code] }], isLht)[0],
    };
    commit([segment]);
    setSelectedIndex(0);
    setInsertPosition(null);
    setEmptyAddOpen(false);
  };

  const deleteSegment = (index: number) => {
    commit(segments.filter((_, segmentIndex) => segmentIndex !== index));
    setSelectedIndex(null);
    setRoadChoiceIndex(null);
    setInsertPosition(null);
  };

  const totalWidth = segments.reduce((sum, segment) => sum + segment.width, 0) || 1;
  const pxPerUnit = Math.max(
    DIAGRAM_WIDTH / totalWidth,
    segments.length > 0 ? MIN_PX_PER_SEGMENT / Math.max(...segments.map((s) => s.width || 1)) : 1,
  );

  let x = 0;
  const rects = segments.map((segment, index) => {
    const widthPx = Math.max(segment.width * pxPerUnit, MIN_PX_PER_SEGMENT);
    const rect = { segment, index, x, width: widthPx };
    x += widthPx;
    return rect;
  });
  const diagramWidth = Math.max(x, DIAGRAM_WIDTH);
  const diagramHeight = readOnly ? RECT_TOP + RECT_HEIGHT : DIAGRAM_HEIGHT;

  return (
    <div className="space-y-3">
      <div className="border rounded-lg bg-gray-50 p-2 overflow-x-auto">
        <svg
          viewBox={`0 0 ${diagramWidth} ${diagramHeight}`}
          width="100%"
          height={diagramHeight}
          preserveAspectRatio="xMinYMid meet"
        >
          {rects.map(({ segment, index, x: rectX, width }) => {
            const colors = segmentColors(segment);
            const isSelected = index === selectedIndex;
            const isLine = segment.kind === "divider" && !DIVIDER_CODES[segment.raw]?.hasWidth;
            return (
              <Dialog
                key={index}
                open={!readOnly && (roadChoiceIndex === index || insertPosition?.index === index)}
                onOpenChange={(open) => {
                  if (!open) {
                    if (roadChoiceIndex === index) setRoadChoiceIndex(null);
                    if (insertPosition?.index === index) setInsertPosition(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <g
                    onClick={() => {
                      if (readOnly) return;
                      setSelectedIndex(index);
                      setInsertPosition(null);
                      setRoadChoiceIndex(index);
                    }}
                    onMouseEnter={() => !readOnly && setHoveredIndex(index)}
                    onMouseLeave={() => !readOnly && setHoveredIndex(null)}
                    className={readOnly ? undefined : "group cursor-pointer"}
                  >
                    {colors.length === 2 ? (
                      <>
                        <rect
                          x={rectX}
                          y={RECT_TOP}
                          width={width}
                          height={RECT_HEIGHT / 2}
                          fill={colors[0]}
                        />
                        <rect
                          x={rectX}
                          y={RECT_TOP + RECT_HEIGHT / 2}
                          width={width}
                          height={RECT_HEIGHT / 2}
                          fill={colors[1]}
                        />
                      </>
                    ) : isLine ? (
                      <>
                        <rect
                          x={rectX}
                          y={RECT_TOP}
                          width={width}
                          height={RECT_HEIGHT}
                          fill="#000000"
                        />
                        <line
                          x1={rectX + width / 2}
                          y1={RECT_TOP}
                          x2={rectX + width / 2}
                          y2={RECT_TOP + RECT_HEIGHT}
                          stroke={segment.raw === "|" ? "#facc15" : "#ffffff"}
                          strokeWidth={2}
                          strokeDasharray={segment.raw === ":" ? "6 5" : undefined}
                        />
                      </>
                    ) : (
                      <rect
                        x={rectX}
                        y={RECT_TOP}
                        width={width}
                        height={RECT_HEIGHT}
                        fill={colors[0]}
                      />
                    )}
                    <rect
                      x={rectX}
                      y={RECT_TOP}
                      width={width}
                      height={RECT_HEIGHT}
                      fill="transparent"
                      stroke={isSelected ? "#2563eb" : "transparent"}
                      strokeWidth={2}
                    />
                    {segmentDecals(segment, rectX, width)}
                    {!readOnly && segment.kind === "lane" && segment.parts.length === 1 && (
                      <foreignObject
                        x={rectX + width / 2 - 12}
                        y={0}
                        width={24}
                        height={24}
                        className="pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRoadChoiceIndex(null);
                          setInsertPosition(null);
                          setCombineLaneIndex(index);
                        }}
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-6 w-6 rounded-full border-blue-500 bg-white p-0 text-blue-600 shadow-sm hover:bg-blue-50"
                          aria-label={`Add a mode to ${segment.parts
                            .map((part) => LANE_TYPE_CODES[part]?.label ?? part)
                            .join(" + ")}`}
                          title="Add another lane mode"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </foreignObject>
                    )}
                    {!readOnly && segment.kind === "lane" && (
                      <foreignObject
                        x={rectX + width / 2 - Math.max(width, 52) / 2}
                        y={RECT_TOP + RECT_HEIGHT + 4}
                        width={Math.max(width, 52)}
                        height={28}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-0.5 h-full">
                          <Input
                            aria-label={`Width for lane ${segment.raw}`}
                            type="number"
                            min={0}
                            step={isMetric ? 0.1 : 0.5}
                            className="h-6 min-w-0 px-1 text-center text-xs focus-visible:border-blue-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                            value={Number(toDisplayWidth(segment.width, isMetric).toFixed(2))}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              if (!Number.isFinite(value) || value < 0) return;
                              updateSegment(index, { width: fromDisplayWidth(value, isMetric) });
                            }}
                          />
                          <span className="text-[10px] text-gray-500">{isMetric ? "m" : "ft"}</span>
                        </div>
                      </foreignObject>
                    )}
                    {!readOnly && segment.kind === "lane" && (
                      <g
                        onClick={(event) => {
                          event.stopPropagation();
                          updateSegment(index, { direction: cycleDirection(segment.direction) });
                        }}
                        className="cursor-pointer"
                      >
                        <rect
                          x={rectX + width / 2 - 24}
                          y={RECT_TOP + RECT_HEIGHT + 34}
                          width={48}
                          height={20}
                          fill="transparent"
                        />
                        <text
                          x={rectX + width / 2}
                          y={RECT_TOP + RECT_HEIGHT + 49}
                          fontSize={16}
                          textAnchor="middle"
                          fill="#1e3a8a"
                        >
                          {DIRECTION_ARROWS[segment.direction]}
                        </text>
                      </g>
                    )}
                  </g>
                </DialogTrigger>
                <RoadChoiceMenu
                  title={
                    insertPosition?.index === index ? "Add road segment" : "Modify road segment"
                  }
                  onChoose={insertPosition?.index === index ? insertSegment : chooseRoadSegment}
                />
              </Dialog>
            );
          })}
          {!readOnly && hoveredIndex !== null && rects[hoveredIndex] && (
            <g onMouseEnter={() => setHoveredIndex(hoveredIndex)} className="cursor-pointer">
              <g
                transform={`translate(${rects[hoveredIndex].x + rects[hoveredIndex].width / 2}, ${RECT_TOP + RECT_HEIGHT - 12})`}
                onClick={(event) => {
                  event.stopPropagation();
                  deleteSegment(hoveredIndex);
                }}
              >
                <title>Delete segment</title>
                <circle r={9} fill="#ffffff" stroke="#dc2626" strokeWidth={1.5} />
                <Trash2 x={-6} y={-6} width={12} height={12} color="#dc2626" strokeWidth={1.8} />
              </g>
              {(["before", "after"] as const).map((side) => {
                const rect = rects[hoveredIndex];
                const plusX =
                  side === "before"
                    ? Math.max(9, rect.x)
                    : Math.min(diagramWidth - 9, rect.x + rect.width);
                return (
                  <g
                    key={side}
                    transform={`translate(${plusX}, ${RECT_TOP + RECT_HEIGHT / 2})`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setRoadChoiceIndex(null);
                      setInsertPosition({ index: hoveredIndex, side });
                    }}
                  >
                    <title>{side === "before" ? "Insert lane before" : "Insert lane after"}</title>
                    <circle r={9} fill="#ffffff" stroke="#2563eb" strokeWidth={1.5} />
                    <path d="M-4,0 H4 M0,-4 V4" stroke="#2563eb" strokeWidth={1.5} />
                  </g>
                );
              })}
            </g>
          )}
          {!readOnly && segments.length === 0 && (
            <foreignObject x={DIAGRAM_WIDTH / 2 - 90} y={RECT_TOP + 24} width={180} height={44}>
              <Dialog
                open={emptyAddOpen}
                onOpenChange={(open) => {
                  setEmptyAddOpen(open);
                  if (!open) setInsertPosition(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" className="w-full gap-2">
                    <span className="text-lg leading-none">+</span>
                    Add Lane
                  </Button>
                </DialogTrigger>
                <RoadChoiceMenu title="Add lane" lanesOnly onChoose={addFirstLane} />
              </Dialog>
            </foreignObject>
          )}
        </svg>
      </div>
      <Dialog
        open={combineLaneIndex !== null}
        onOpenChange={(open) => {
          if (!open) setCombineLaneIndex(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose another lane mode</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Select a mode to combine with{" "}
            {combineLaneIndex !== null
              ? segments[combineLaneIndex]?.parts
                  .map((part) => LANE_TYPE_CODES[part]?.label ?? part)
                  .join(" + ")
              : "this lane"}
            .
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.values(LANE_TYPE_CODES)
              .filter((type) => {
                const segment = combineLaneIndex === null ? undefined : segments[combineLaneIndex];
                return segment?.kind === "lane" && !segment.parts.includes(type.code);
              })
              .map((type) => (
                <Button
                  key={type.code}
                  type="button"
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={() => addLaneMode(type.code)}
                >
                  <LaneTypeIcon code={type.code} />
                  <span>{type.label}</span>
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
