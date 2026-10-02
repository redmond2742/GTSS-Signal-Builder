import * as THREE from "three";
import type { ArrowKind } from "./laneAssignment";
import { CROSSWALK_OFFSET, CROSSWALK_WIDTH, STOP_BAR_WIDTH, type LegPlan } from "./layout";
import type { LaneBand } from "./legLayout";

export const ASPHALT = "#3d3e42";
const WHITE = "#f4f4f0";
const YELLOW = "#f2c230";
const MAX_CANVAS = 4096;
const BASE_PX_PER_M = 20;

const LANE_FILLS: Record<string, string> = {
  B: "#2f7d4a",
  P: "#24693b",
  A: "#9b2c2c",
  K: "#4b4c51",
  Y: "#56657c",
  T: "#56657c",
  S: "#c9c9c4",
};

const DIVIDER_FILLS: Record<string, string> = {
  "-": "#a9a9a6",
  "=": "#b4b4ad",
  "#": "#55565a",
  "!": "#55565a",
  "^": "#55565a",
  "/": "#5f8f3f",
  "*": "#9c948a",
  ">": "#4a4b4f",
};

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(width));
  canvas.height = Math.max(2, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { canvas, ctx };
}

function speckle(ctx: CanvasRenderingContext2D, width: number, height: number, count: number) {
  for (let i = 0; i < count; i++) {
    const shade = Math.random() < 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.03 + Math.random() * 0.05})`;
    const size = 1 + Math.random() * 2;
    ctx.fillRect(Math.random() * width, Math.random() * height, size, size);
  }
}

function finishTexture(canvas: HTMLCanvasElement, anisotropy: number) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** Tileable asphalt texture; one tile spans `tileMeters` when geometry UVs are in metres. */
export function createAsphaltTexture(anisotropy: number, tileMeters = 8): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 1800);
  const texture = finishTexture(canvas, anisotropy);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / tileMeters, 1 / tileMeters);
  return texture;
}

/** Diagonal white hatching for painted (flush) channelizing islands, tiled per metre. */
export function createHatchTexture(anisotropy: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128, 128);
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 18;
  for (let i = -128; i < 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 128);
    ctx.lineTo(i + 128, 0);
    ctx.stroke();
  }
  const texture = finishTexture(canvas, anisotropy);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / 2, 1 / 2);
  return texture;
}

/** Continental crosswalk bars for a decal `widthM` across and `lengthM` along the walking direction. */
export function createCrosswalkTexture(
  widthM: number,
  lengthM: number,
  anisotropy: number,
): THREE.CanvasTexture {
  const ppm = BASE_PX_PER_M;
  const { canvas, ctx } = makeCanvas(widthM * ppm, lengthM * ppm);
  paintCrosswalkBars(ctx, 0, canvas.height, 0, canvas.width, ppm, "y");
  return finishTexture(canvas, anisotropy);
}

/** Paints continental bars repeated along `spanAxis`, each running from barStart to barEnd. */
function paintCrosswalkBars(
  ctx: CanvasRenderingContext2D,
  spanStart: number,
  spanEnd: number,
  barStart: number,
  barEnd: number,
  ppm: number,
  spanAxis: "x" | "y",
) {
  ctx.fillStyle = WHITE;
  const bar = 0.6 * ppm;
  const pitch = 1.2 * ppm;
  for (let p = spanStart + 0.3 * ppm; p + bar <= spanEnd; p += pitch) {
    if (spanAxis === "x") ctx.fillRect(p, barStart, bar, barEnd - barStart);
    else ctx.fillRect(barStart, p, barEnd - barStart, bar);
  }
}

/** Draws a pavement arrow with its tip at the origin pointing toward -y, in metre units. */
function drawArrowGlyph(ctx: CanvasRenderingContext2D, kind: ArrowKind) {
  const hasT = kind.includes("T");
  ctx.strokeStyle = WHITE;
  ctx.fillStyle = WHITE;
  ctx.lineWidth = 0.28;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.lineTo(0, hasT ? 1.2 : 3.1);
  ctx.stroke();
  if (hasT) triangle(ctx, [0, 0], [-0.45, 1.3], [0.45, 1.3]);
  const branch = (dir: -1 | 1) => {
    ctx.beginPath();
    ctx.moveTo(0, 3.2);
    ctx.quadraticCurveTo(0, 2.1, dir * 0.9, 2.1);
    ctx.stroke();
    triangle(ctx, [dir * 1.9, 2.1], [dir * 0.85, 1.55], [dir * 0.85, 2.65]);
  };
  if (kind.includes("L")) branch(-1);
  if (kind.includes("R")) branch(1);
}

function triangle(
  ctx: CanvasRenderingContext2D,
  a: [number, number],
  b: [number, number],
  c: [number, number],
) {
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.lineTo(...c);
  ctx.closePath();
  ctx.fill();
}

function drawBikeGlyph(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = WHITE;
  ctx.fillStyle = WHITE;
  ctx.lineWidth = 0.12;
  for (const y of [-0.65, 0.65]) {
    ctx.beginPath();
    ctx.ellipse(0, y, 0.12, 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, -0.65);
  ctx.lineTo(0, 0.65);
  ctx.moveTo(-0.3, -0.45);
  ctx.lineTo(0.3, -0.45);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0.05, 0.17, 0, Math.PI * 2);
  ctx.fill();
  triangle(ctx, [0, -2.2], [-0.35, -1.5], [0.35, -1.5]);
}

function drawStretchedText(ctx: CanvasRenderingContext2D, text: string, widthM: number) {
  // Work in 1/20 m units; sub-pixel font sizes are unreliable in some browsers.
  const unit = 20;
  ctx.save();
  ctx.scale(1 / unit, 2.4 / unit);
  ctx.fillStyle = WHITE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.min(0.9, widthM / (text.length * 0.7)) * unit}px sans-serif`;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

const isLine = (band: LaneBand) =>
  band.kind === "divider" && (band.raw === "|" || band.raw === ":");
const isBike = (band?: LaneBand) => !!band && band.parts.some((p) => p === "B" || p === "P");

/** Paints lane fills, lines, stop bar, crosswalk and pavement symbols for one leg's roadway. */
export function createLegTexture(plan: LegPlan, anisotropy: number): THREE.CanvasTexture {
  const { leg } = plan;
  const roadWidth = leg.roadT1 - leg.roadT0;
  const ppm = Math.min(BASE_PX_PER_M, MAX_CANVAS / leg.length, MAX_CANVAS / roadWidth);
  const { canvas, ctx } = makeCanvas(roadWidth * ppm, leg.length * ppm);
  const X = (t: number) => (leg.roadT1 - t) * ppm;
  const Y = (s: number) => (s - leg.mouth) * ppm;
  const end = leg.mouth + leg.length;
  const lineStart = plan.hasCrosswalk
    ? leg.mouth + CROSSWALK_OFFSET + CROSSWALK_WIDTH + 0.3
    : leg.mouth + 0.3;

  ctx.fillStyle = ASPHALT;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  speckle(ctx, canvas.width, canvas.height, Math.min(6000, (canvas.width * canvas.height) / 300));

  const roadBands = leg.bands.filter(
    (band) => band.t1 > leg.roadT0 + 1e-3 && band.t0 < leg.roadT1 - 1e-3,
  );
  const fillBand = (band: LaneBand, color: string, s0 = leg.mouth, s1 = end) => {
    ctx.fillStyle = color;
    ctx.fillRect(X(band.t1), Y(s0), (band.t1 - band.t0) * ppm, Y(s1) - Y(s0));
  };
  const vLine = (
    t: number,
    color: string,
    widthM: number,
    s0: number,
    s1: number,
    dash?: number[],
  ) => {
    ctx.fillStyle = color;
    const w = Math.max(2, widthM * ppm);
    if (!dash) {
      ctx.fillRect(X(t) - w / 2, Y(s0), w, Y(s1) - Y(s0));
      return;
    }
    const [on, off] = dash;
    for (let s = s0; s < s1; s += on + off) {
      ctx.fillRect(X(t) - w / 2, Y(s), w, Math.min(on, s1 - s) * ppm);
    }
  };

  // Surface fills.
  roadBands.forEach((band) => {
    if (band.kind === "divider") {
      const color = DIVIDER_FILLS[band.raw];
      if (color && band.t1 - band.t0 > 0) fillBand(band, color, lineStart);
      if (band.raw === ">") {
        const laneSide = band.t0 <= leg.roadT0 + 1e-3 ? band.t1 : band.t0;
        vLine(laneSide, WHITE, 0.15, lineStart, end);
      }
      return;
    }
    const code = band.parts.find((p) => LANE_FILLS[p]);
    if (code) fillBand(band, LANE_FILLS[code], lineStart);
    if (band.parts.some((p) => p === "R" || p === "L")) {
      const mid = (band.t0 + band.t1) / 2;
      for (const offset of [-0.72, 0.72]) {
        vLine(mid + offset, "#26272a", 0.12, leg.mouth, end);
        vLine(mid + offset + 0.05, "#9a9da2", 0.07, leg.mouth, end);
      }
    }
  });

  // Lane lines.
  roadBands.forEach((band, i) => {
    if (!isLine(band)) return;
    const prev = roadBands[i - 1];
    const next = roadBands[i + 1];
    const t = band.t0;
    if (band.raw === "|") {
      const opposing =
        prev &&
        next &&
        prev.direction !== next.direction &&
        prev.direction !== "B" &&
        next.direction !== "B";
      if (opposing) {
        vLine(t - 0.12, YELLOW, 0.1, lineStart, end);
        vLine(t + 0.12, YELLOW, 0.1, lineStart, end);
      } else {
        vLine(t, WHITE, 0.15, lineStart, end);
      }
      return;
    }
    if (prev?.direction === "T" || next?.direction === "T") return;
    if (isBike(prev) || isBike(next)) {
      vLine(t, WHITE, 0.15, lineStart, end);
      return;
    }
    const incoming = prev?.direction === "I" && next?.direction === "I";
    if (incoming) {
      vLine(t, WHITE, 0.12, lineStart, Math.min(end, plan.stopS + 30));
      if (plan.stopS + 30 < end) vLine(t, WHITE, 0.12, plan.stopS + 30, end, [3, 9]);
    } else {
      vLine(t, WHITE, 0.12, lineStart, end, [3, 9]);
    }
  });

  // Two-way centre turn lanes: solid outer + dashed inner yellow edges and opposing left arrows.
  roadBands.forEach((band) => {
    if (band.kind !== "lane" || band.direction !== "T") return;
    for (const [edge, inward] of [
      [band.t0, 1],
      [band.t1, -1],
    ] as const) {
      vLine(edge, YELLOW, 0.1, lineStart, end);
      vLine(edge + inward * 0.25, YELLOW, 0.1, lineStart, end, [3, 9]);
    }
  });

  // Stop bar across incoming lanes.
  const incomingBands = roadBands.filter(
    (band) => band.kind === "lane" && band.direction === "I" && !band.parts.includes("K"),
  );
  if (incomingBands.length) {
    const t0 = Math.min(...incomingBands.map((b) => b.t0));
    const t1 = Math.max(...incomingBands.map((b) => b.t1));
    ctx.fillStyle = WHITE;
    ctx.fillRect(X(t1), Y(plan.stopS), (t1 - t0) * ppm, STOP_BAR_WIDTH * ppm);
  }

  if (plan.hasCrosswalk) {
    paintCrosswalkBars(
      ctx,
      0,
      canvas.width,
      Y(leg.mouth + CROSSWALK_OFFSET),
      Y(leg.mouth + CROSSWALK_OFFSET + CROSSWALK_WIDTH),
      ppm,
      "x",
    );
  }

  const glyph = (t: number, s: number, rotate: boolean, draw: () => void) => {
    if (s + 6 > end) return;
    ctx.save();
    ctx.translate(X(t), Y(s));
    ctx.scale(ppm, ppm);
    if (rotate) ctx.rotate(Math.PI);
    draw();
    ctx.restore();
  };

  plan.arrows.forEach((kind, bandIndex) => {
    const band = leg.bands[bandIndex];
    const mid = (band.t0 + band.t1) / 2;
    if (kind === "TWLTL") {
      for (let s = plan.stopS + 12; s < end - 10; s += 30) {
        glyph(mid, s, false, () => drawArrowGlyph(ctx, "L"));
        glyph(mid, s + 12, true, () => drawArrowGlyph(ctx, "L"));
      }
      return;
    }
    glyph(mid, plan.stopS + 3, false, () => drawArrowGlyph(ctx, kind));
    glyph(mid, plan.stopS + 28, false, () => drawArrowGlyph(ctx, kind));
  });

  roadBands.forEach((band) => {
    if (band.kind !== "lane") return;
    const mid = (band.t0 + band.t1) / 2;
    const width = band.t1 - band.t0;
    const rotate = band.direction === "O";
    const near = rotate ? lineStart + 6 : plan.stopS + 4;
    if (isBike(band)) {
      for (let s = near; s < end - 6; s += 40) glyph(mid, s + 2, rotate, () => drawBikeGlyph(ctx));
    } else if (band.parts[0] === "A") {
      // Drivers read the word nearest them first.
      glyph(mid, near + (rotate ? 0 : 11), rotate, () => drawStretchedText(ctx, "BUS", width));
      glyph(mid, near + (rotate ? 5 : 6), rotate, () => drawStretchedText(ctx, "ONLY", width));
    } else if (band.parts[0] === "K") {
      ctx.fillStyle = WHITE;
      for (let s = lineStart + 6; s < end; s += 6.5) {
        ctx.fillRect(X(band.t1), Y(s), width * ppm, Math.max(2, 0.1 * ppm));
      }
    }
  });

  return finishTexture(canvas, anisotropy);
}

/** Slip-lane surface: edge lines, a through arrow near the entry, optional crosswalk mid-way. */
export function createSlipTexture(
  widthM: number,
  lengthM: number,
  withCrosswalk: boolean,
  anisotropy: number,
): THREE.CanvasTexture {
  const ppm = Math.min(BASE_PX_PER_M, MAX_CANVAS / lengthM);
  const { canvas, ctx } = makeCanvas(widthM * ppm, lengthM * ppm);
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  speckle(ctx, canvas.width, canvas.height, 1500);
  ctx.fillStyle = WHITE;
  const edge = Math.max(2, 0.15 * ppm);
  ctx.fillRect(0, 0, edge, canvas.height);
  ctx.fillRect(canvas.width - edge, 0, edge, canvas.height);
  if (withCrosswalk) {
    const mid = canvas.height / 2;
    paintCrosswalkBars(ctx, 0, canvas.width, mid - 1.5 * ppm, mid + 1.5 * ppm, ppm, "x");
  }
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height - 7 * ppm);
  ctx.scale(ppm, ppm);
  drawArrowGlyph(ctx, "T");
  ctx.restore();
  return finishTexture(canvas, anisotropy);
}

/** Street-name label texture; returns the texture and its aspect ratio. */
export function createLabelTexture(text: string): { texture: THREE.CanvasTexture; aspect: number } {
  const fontPx = 64;
  const probe = makeCanvas(2, 2).ctx;
  probe.font = `600 ${fontPx}px sans-serif`;
  const width = Math.ceil(probe.measureText(text).width) + 48;
  const height = fontPx + 36;
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = "rgba(20, 83, 45, 0.92)";
  const r = 14;
  ctx.beginPath();
  ctx.roundRect(2, 2, width - 4, height - 4, r);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${fontPx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2 + 2);
  const texture = finishTexture(canvas, 1);
  return { texture, aspect: width / height };
}
