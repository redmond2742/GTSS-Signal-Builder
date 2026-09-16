import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  computeDefaultDirections,
  DIVIDER_CODES,
  fromDisplayWidth,
  LANE_TYPE_CODES,
  parseLaneConfig,
  serializeLaneConfig,
  toDisplayWidth,
  validateLaneConfig,
  type LaneCategory,
  type LaneDirection,
  type LaneSegment,
} from "gtss";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

interface LaneConfigEditorProps {
  laneConfig: string | null | undefined;
  laneWidth: string | null | undefined;
  laneDirection: string | null | undefined;
  isMetric: boolean;
  isLht: boolean;
  onChange: (laneConfig: string, laneWidth: string, laneDirection: string) => void;
}

const DIRECTION_LABELS: Record<LaneDirection, string> = {
  I: "Incoming",
  O: "Outgoing",
  B: "Both",
};

const DIRECTION_ARROWS: Record<LaneDirection, string> = {
  I: "↑",
  O: "↓",
  B: "↕",
};

const DIRECTION_CYCLE: Record<LaneDirection, LaneDirection> = {
  I: "O",
  O: "B",
  B: "I",
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
const DIAGRAM_HEIGHT = 140;
const RECT_TOP = 10;
const RECT_HEIGHT = DIAGRAM_HEIGHT - 60;
const LABEL_Y = DIAGRAM_HEIGHT - 42;
const ARROW_Y = DIAGRAM_HEIGHT - 16;
const DECAL_Y = RECT_TOP + RECT_HEIGHT / 2;
const DECAL_STROKE = "#1f2937";

// Schematic road-marking decals painted on each lane type's pavement.
function laneDecal(code: string, cx: number, cy: number, key: string) {
  const transform = `translate(${cx}, ${cy})`;
  switch (code) {
    case "B":
    case "BP":
      return (
        <g key={key} transform={transform} fill="none" stroke={DECAL_STROKE} strokeWidth={1.2}>
          <circle cx={-5} cy={4} r={3.2} />
          <circle cx={5} cy={4} r={3.2} />
          <path d="M-5,4 L-1,-4 L5,4 M-1,-4 L2,-4" />
        </g>
      );
    case "A":
    case "AL":
      return (
        <g key={key} transform={transform}>
          <path d="M0,-8 L8,0 L0,8 L-8,0 Z" fill="none" stroke={DECAL_STROKE} strokeWidth={1.2} />
          <text y={2.5} textAnchor="middle" fontSize={5} fill={DECAL_STROKE}>
            BUS
          </text>
        </g>
      );
    case "AS":
      return (
        <g key={key} transform={transform}>
          <path
            d="M-10,0 L-5,-6 L0,0 L5,-6 L10,0"
            fill="none"
            stroke={DECAL_STROKE}
            strokeWidth={1.2}
          />
          <text y={12} textAnchor="middle" fontSize={5} fill={DECAL_STROKE}>
            BUS
          </text>
        </g>
      );
    case "CP":
      return (
        <g key={key} transform={transform}>
          <rect
            x={-6}
            y={-8}
            width={12}
            height={16}
            rx={2}
            fill="none"
            stroke={DECAL_STROKE}
            strokeWidth={1.2}
          />
          <text y={4} textAnchor="middle" fontSize={9} fontWeight="bold" fill={DECAL_STROKE}>
            P
          </text>
        </g>
      );
    case "RT":
    case "L":
      return (
        <g key={key} transform={transform} stroke={DECAL_STROKE} strokeWidth={1}>
          <line x1={-3} y1={-10} x2={-3} y2={10} />
          <line x1={3} y1={-10} x2={3} y2={10} />
          <line x1={-3} y1={-6} x2={3} y2={-6} />
          <line x1={-3} y1={-2} x2={3} y2={-2} />
          <line x1={-3} y1={2} x2={3} y2={2} />
          <line x1={-3} y1={6} x2={3} y2={6} />
        </g>
      );
    case "C":
      return (
        <g key={key} transform={transform} fill="none" stroke="#ffffff" strokeWidth={1.2}>
          <rect x={-4} y={-9} width={8} height={18} rx={3} />
          <line x1={-4} y1={-3} x2={4} y2={-3} />
          <line x1={-4} y1={3} x2={4} y2={3} />
        </g>
      );
    case "S":
      return (
        <g key={key} transform={transform} stroke={DECAL_STROKE} strokeWidth={1.2} fill="none">
          <circle cx={0} cy={-7} r={2.2} fill={DECAL_STROKE} stroke="none" />
          <path d="M0,-4 L0,4 M0,-2 L-5,0 M0,-2 L5,0 M0,4 L-4,10 M0,4 L4,10" />
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
        {laneDecal(segment.parts[0], rectX + width / 4, DECAL_Y, "decal-0")}
        {laneDecal(segment.parts[1], rectX + (3 * width) / 4, DECAL_Y, "decal-1")}
      </>
    );
  }
  return laneDecal(segment.parts[0], rectX + width / 2, DECAL_Y, "decal-0");
}

function segmentLabel(segment: LaneSegment): string {
  if (segment.kind === "divider") return DIVIDER_CODES[segment.raw]?.label ?? segment.raw;
  return segment.parts.map((part) => LANE_TYPE_CODES[part]?.label ?? part).join(" + ");
}

function segmentColors(segment: LaneSegment): string[] {
  if (segment.kind === "divider") return [DIVIDER_CODES[segment.raw]?.color ?? "#999"];
  return segment.parts.map((part) => LANE_TYPE_CODES[part]?.color ?? "#999");
}

export default function LaneConfigEditor({
  laneConfig,
  laneWidth,
  laneDirection,
  isMetric,
  isLht,
  onChange,
}: LaneConfigEditorProps) {
  const segments = useMemo(
    () => parseLaneConfig(laneConfig, laneWidth, laneDirection, isLht),
    [laneConfig, laneWidth, laneDirection, isLht],
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const errors = useMemo(() => validateLaneConfig(laneConfig), [laneConfig]);

  const commit = (next: LaneSegment[]) => {
    const {
      laneConfig: nextConfig,
      laneWidth: nextWidth,
      laneDirection: nextDirection,
    } = serializeLaneConfig(next);
    onChange(nextConfig, nextWidth, nextDirection);
  };

  const addSegment = (code: string) => {
    const isLane = code in LANE_TYPE_CODES;
    const segment: LaneSegment = isLane
      ? {
          kind: "lane",
          raw: code,
          parts: [code],
          width: LANE_TYPE_CODES[code].category === "car" ? 132 : 60,
          direction: "B",
        }
      : { kind: "divider", raw: code, parts: [code], width: 0, direction: "B" };
    const insertAt = selectedIndex === null ? segments.length : selectedIndex + 1;
    const next = [...segments.slice(0, insertAt), segment, ...segments.slice(insertAt)];
    const defaults = computeDefaultDirections(next, isLht);
    next[insertAt] = { ...next[insertAt], direction: defaults[insertAt] };
    commit(next);
    setSelectedIndex(insertAt);
  };

  const updateSegment = (index: number, updates: Partial<LaneSegment>) => {
    const next = segments.map((segment, i) => (i === index ? { ...segment, ...updates } : segment));
    commit(next);
  };

  const removeSegment = (index: number) => {
    const next = segments.filter((_, i) => i !== index);
    commit(next);
    setSelectedIndex(null);
  };

  const moveSegment = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= segments.length) return;
    const next = [...segments];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
    setSelectedIndex(target);
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

  const selected = selectedIndex !== null ? segments[selectedIndex] : null;
  const displayWidth = selected ? toDisplayWidth(selected.width, isMetric) : 0;
  const unitLabel = isMetric ? "m" : "ft";

  return (
    <div className="space-y-3">
      <div className="border rounded-lg bg-gray-50 p-2 overflow-x-auto">
        <svg
          viewBox={`0 0 ${diagramWidth} ${DIAGRAM_HEIGHT}`}
          width="100%"
          height={DIAGRAM_HEIGHT}
          preserveAspectRatio="xMinYMid meet"
        >
          {rects.map(({ segment, index, x: rectX, width }) => {
            const colors = segmentColors(segment);
            const isSelected = index === selectedIndex;
            const isLine = segment.kind === "divider" && !DIVIDER_CODES[segment.raw]?.hasWidth;
            return (
              <g key={index} onClick={() => setSelectedIndex(index)} className="cursor-pointer">
                {colors.length === 2 ? (
                  <>
                    <rect
                      x={rectX}
                      y={RECT_TOP}
                      width={width / 2}
                      height={RECT_HEIGHT}
                      fill={colors[0]}
                    />
                    <rect
                      x={rectX + width / 2}
                      y={RECT_TOP}
                      width={width / 2}
                      height={RECT_HEIGHT}
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
                <text
                  x={rectX + width / 2}
                  y={LABEL_Y}
                  fontSize={9}
                  textAnchor="middle"
                  fill="#374151"
                >
                  {segment.raw}
                </text>
                {segment.kind === "lane" && (
                  <g
                    onClick={(e) => {
                      e.stopPropagation();
                      updateSegment(index, { direction: cycleDirection(segment.direction) });
                    }}
                    className="cursor-pointer"
                  >
                    <rect
                      x={rectX + width / 2 - 10}
                      y={ARROW_Y - 14}
                      width={20}
                      height={18}
                      fill="transparent"
                    />
                    <text
                      x={rectX + width / 2}
                      y={ARROW_Y}
                      fontSize={16}
                      textAnchor="middle"
                      fill="#1e3a8a"
                    >
                      {DIRECTION_ARROWS[segment.direction]}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {errors.length > 0 && (
        <div className="text-sm text-destructive space-y-0.5">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Select onValueChange={addSegment} value="">
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Add lane / divider..." />
          </SelectTrigger>
          <SelectContent>
            {(["sidewalk", "transit", "bike", "car", "rail"] as LaneCategory[]).map((category) => (
              <SelectGroup key={category}>
                <SelectLabel>{LANE_CATEGORY_LABELS[category]}</SelectLabel>
                {Object.values(LANE_TYPE_CODES)
                  .filter((type) => type.category === category)
                  .map((type) => (
                    <SelectItem key={type.code} value={type.code}>
                      {type.code} — {type.label}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
            {(["line", "barrier", "surface"] as const).map((group) => (
              <SelectGroup key={group}>
                <SelectLabel>{DIVIDER_GROUP_LABELS[group]}</SelectLabel>
                {Object.values(DIVIDER_CODES)
                  .filter((divider) => divider.category === group)
                  .map((divider) => (
                    <SelectItem key={divider.code} value={divider.code}>
                      {divider.code} — {divider.label}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-grey-500">
          {selectedIndex === null ? "Adds to the end" : "Adds after the selected segment"}
        </span>
      </div>

      {selected && selectedIndex !== null && (
        <div className="border rounded-lg p-3 space-y-3 bg-white">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{segmentLabel(selected)}</p>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => moveSegment(selectedIndex, -1)}
                disabled={selectedIndex === 0}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => moveSegment(selectedIndex, 1)}
                disabled={selectedIndex === segments.length - 1}
              >
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => removeSegment(selectedIndex)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {selected.kind === "lane" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-grey-500">Type</label>
                <Select
                  value={selected.parts[0]}
                  onValueChange={(code) =>
                    updateSegment(selectedIndex, {
                      raw: [code, selected.parts[1]].filter(Boolean).join("+"),
                      parts: [code, selected.parts[1]].filter(Boolean) as string[],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(LANE_TYPE_CODES).map((type) => (
                      <SelectItem key={type.code} value={type.code}>
                        {type.code} — {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-grey-500">Combine with (+)</label>
                <Select
                  value={selected.parts[1] ?? "none"}
                  onValueChange={(code) => {
                    const second = code === "none" ? undefined : code;
                    const parts = [selected.parts[0], second].filter(Boolean) as string[];
                    updateSegment(selectedIndex, { raw: parts.join("+"), parts });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {Object.values(LANE_TYPE_CODES)
                      .filter((type) => type.code !== selected.parts[0])
                      .map((type) => (
                        <SelectItem key={type.code} value={type.code}>
                          {type.code} — {type.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-grey-500">Direction</label>
                <Select
                  value={selected.direction}
                  onValueChange={(direction) =>
                    updateSegment(selectedIndex, { direction: direction as LaneDirection })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DIRECTION_LABELS) as LaneDirection[]).map((direction) => (
                      <SelectItem key={direction} value={direction}>
                        {DIRECTION_ARROWS[direction]} {DIRECTION_LABELS[direction]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {selected.kind === "divider" && (
            <div>
              <label className="text-xs text-grey-500">Type</label>
              <Select
                value={selected.raw}
                onValueChange={(code) => updateSegment(selectedIndex, { raw: code, parts: [code] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DIVIDER_CODES).map((divider) => (
                    <SelectItem key={divider.code} value={divider.code}>
                      {divider.code} — {divider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(selected.kind === "lane" || DIVIDER_CODES[selected.raw]?.hasWidth) && (
            <div>
              <label className="text-xs text-grey-500">Width ({unitLabel})</label>
              <Input
                type="number"
                min={0}
                step={isMetric ? 0.1 : 0.5}
                className="w-32"
                value={Number(displayWidth.toFixed(2))}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (!Number.isFinite(value) || value < 0) return;
                  updateSegment(selectedIndex, { width: fromDisplayWidth(value, isMetric) });
                }}
              />
            </div>
          )}
        </div>
      )}

      {segments.length === 0 && (
        <p className="text-sm text-grey-500 flex items-center gap-1">
          <Plus className="w-3 h-3" /> No lanes configured yet — add a segment to begin.
        </p>
      )}
    </div>
  );
}
