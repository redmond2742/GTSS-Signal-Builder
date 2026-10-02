// Lane cross-section encoding: a left-to-right sequence of concatenated tokens (no delimiter).
// Every lane item and divider is one character. Lane items may be joined with "+" for a combined
// lane, e.g. "B+C". See LANE_TYPE_CODES/DIVIDER_CODES below for the full grammar.

export type LaneCategory = "sidewalk" | "transit" | "bike" | "car" | "rail";
export type DividerCategory = "line" | "barrier" | "surface";

export interface LaneTypeInfo {
  code: string;
  label: string;
  category: LaneCategory;
  color: string;
}

export interface DividerInfo {
  code: string;
  label: string;
  category: DividerCategory;
  hasWidth: boolean;
  color: string;
}

export const LANE_TYPE_CODES: Record<string, LaneTypeInfo> = {
  S: { code: "S", label: "Sidewalk", category: "sidewalk", color: "#d4d4d8" },
  A: { code: "A", label: "Autobus lane", category: "transit", color: "#dc2626" },
  Y: { code: "Y", label: "Autobus lay-by", category: "transit", color: "#93c5fd" },
  T: { code: "T", label: "Autobus stop", category: "transit", color: "#60a5fa" },
  B: { code: "B", label: "Bike lane", category: "bike", color: "#4ade80" },
  P: { code: "P", label: "Protected bike lane", category: "bike", color: "#16a34a" },
  C: { code: "C", label: "Car lane", category: "car", color: "#000000" },
  K: { code: "K", label: "Car parking", category: "car", color: "#c4b5fd" },
  R: { code: "R", label: "Streetcar", category: "rail", color: "#f97316" },
  L: { code: "L", label: "LRT", category: "rail", color: "#ea580c" },
};

export const DIVIDER_CODES: Record<string, DividerInfo> = {
  "|": { code: "|", label: "Solid line", category: "line", hasWidth: false, color: "#000000" },
  ":": { code: ":", label: "Dotted line", category: "line", hasWidth: false, color: "#000000" },
  "-": { code: "-", label: "Curb", category: "barrier", hasWidth: true, color: "#71717a" },
  "#": { code: "#", label: "Fence", category: "barrier", hasWidth: true, color: "#52525b" },
  "!": { code: "!", label: "Flex-post", category: "barrier", hasWidth: true, color: "#facc15" },
  "^": {
    code: "^",
    label: "Jersey/cement barrier",
    category: "barrier",
    hasWidth: true,
    color: "#a1a1aa",
  },
  "=": { code: "=", label: "Median", category: "barrier", hasWidth: true, color: "#84cc16" },
  "*": { code: "*", label: "Gravel", category: "surface", hasWidth: true, color: "#a8a29e" },
  "/": { code: "/", label: "Grass", category: "surface", hasWidth: true, color: "#65a30d" },
  ">": {
    code: ">",
    label: "Paved shoulder",
    category: "surface",
    hasWidth: true,
    color: "#d6d3d1",
  },
};

const DIVIDER_CHARS = new Set(Object.keys(DIVIDER_CODES));

export interface LaneToken {
  kind: "lane" | "divider";
  raw: string;
  /** For kind "lane": one or two single-character codes joined by "+". */
  parts: string[];
}

export type LaneDirection = "I" | "O" | "B" | "T";

export interface LaneSegment extends LaneToken {
  /** Width in the agency-native unit (inches or cm). Dividers default to 0. */
  width: number;
  /** Traffic direction: Incoming, Outgoing, or Both. Not meaningful for dividers. */
  direction: LaneDirection;
}

/** Splits a lane-config string into single-character lane/divider tokens. */
export function tokenizeLaneConfig(laneConfig: string | null | undefined): LaneToken[] {
  if (!laneConfig) return [];
  const tokens: LaneToken[] = [];
  let combinedParts: string[] = [];
  const flushCombined = () => {
    if (combinedParts.length > 0) {
      tokens.push({ kind: "lane", raw: combinedParts.join("+"), parts: combinedParts });
      combinedParts = [];
    }
  };
  for (const ch of laneConfig) {
    if (DIVIDER_CHARS.has(ch)) {
      flushCombined();
      tokens.push({ kind: "divider", raw: ch, parts: [ch] });
    } else if (ch === "+") {
      if (combinedParts.length > 0) {
        combinedParts.push("");
      }
    } else {
      if (combinedParts.length > 0 && combinedParts[combinedParts.length - 1] === "") {
        combinedParts[combinedParts.length - 1] = ch;
      } else {
        flushCombined();
        combinedParts.push(ch);
      }
    }
  }
  flushCombined();
  return tokens;
}

/** Validates a laneConfig string against the known code set. Returns human-readable errors. */
export function validateLaneConfig(laneConfig: string | null | undefined): string[] {
  const errors: string[] = [];
  const tokens = tokenizeLaneConfig(laneConfig);
  tokens.forEach((token, index) => {
    if (token.kind !== "lane") return;
    if (token.parts.length > 2) {
      errors.push(`Segment ${index + 1} ("${token.raw}"): at most two "+"-joined lane types`);
      return;
    }
    token.parts.forEach((part) => {
      if (part.length !== 1 || !LANE_TYPE_CODES[part]) {
        errors.push(`Segment ${index + 1}: unknown lane code "${part}"`);
      }
    });
  });
  return errors;
}

function defaultWidthForToken(token: LaneToken): number {
  if (token.kind === "divider") return 0;
  const first = LANE_TYPE_CODES[token.parts[0]];
  return first?.category === "car" ? 132 : 60; // inches: 11ft car lane, 5ft other
}

const SOLID_LINE = "|";

/**
 * Defaults lane direction from which side of the solid centerline ("|") a lane sits on, mirrored
 * by LHT/RHT (same left=positive convention as the phase-diagram lateral-offset mirroring).
 * Sidewalks always default to both directions. Dividers get "B" as an unused placeholder.
 */
export function computeDefaultDirections(tokens: LaneToken[], isLht: boolean): LaneDirection[] {
  let side: 0 | 1 = 0;
  return tokens.map((token) => {
    if (token.kind === "divider") {
      if (token.raw === SOLID_LINE) side = side === 0 ? 1 : 0;
      return "B";
    }
    if (token.parts[0] === "S") return "B";
    const nearSide = isLht ? 1 : 0;
    return side === nearSide ? "I" : "O";
  });
}

/** Parses a laneConfig + laneWidth/laneDirection triple into aligned segments. */
export function parseLaneConfig(
  laneConfig: string | null | undefined,
  laneWidth: string | null | undefined,
  laneDirection?: string | null,
  isLht = false,
): LaneSegment[] {
  const tokens = tokenizeLaneConfig(laneConfig);
  const widths = (laneWidth ?? "").split("|").map((value) => Number(value));
  const directions = (laneDirection ?? "").split("|");
  const defaultDirections = computeDefaultDirections(tokens, isLht);
  return tokens.map((token, index) => {
    const parsedWidth = widths[index];
    const width =
      widths.length === tokens.length && Number.isFinite(parsedWidth) && parsedWidth >= 0
        ? parsedWidth
        : defaultWidthForToken(token);
    const parsedDirection = directions[index];
    const direction: LaneDirection =
      directions.length === tokens.length &&
      (parsedDirection === "I" ||
        parsedDirection === "O" ||
        parsedDirection === "B" ||
        parsedDirection === "T")
        ? parsedDirection
        : defaultDirections[index];
    return { ...token, width, direction };
  });
}

/** Inverse of parseLaneConfig: serializes segments back to the laneConfig/laneWidth/laneDirection triple. */
export function serializeLaneConfig(segments: LaneSegment[]): {
  laneConfig: string;
  laneWidth: string;
  laneDirection: string;
} {
  return {
    laneConfig: segments.map((segment) => segment.raw).join(""),
    laneWidth: segments.map((segment) => String(segment.width)).join("|"),
    laneDirection: segments.map((segment) => segment.direction).join("|"),
  };
}

const INCHES_PER_FOOT = 12;
const CM_PER_METER = 100;

/** Converts a stored raw width (inches or cm) to a display value (ft or m). */
export function toDisplayWidth(value: number, isMetric: boolean): number {
  return isMetric ? value / CM_PER_METER : value / INCHES_PER_FOOT;
}

/** Converts a display value (ft or m) back to the stored raw unit (inches or cm). */
export function fromDisplayWidth(value: number, isMetric: boolean): number {
  return isMetric ? value * CM_PER_METER : value * INCHES_PER_FOOT;
}
