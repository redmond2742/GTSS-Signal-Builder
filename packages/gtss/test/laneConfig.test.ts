import { describe, expect, it } from "vitest";
import {
  computeDefaultDirections,
  fromDisplayWidth,
  parseLaneConfig,
  serializeLaneConfig,
  toDisplayWidth,
  tokenizeLaneConfig,
  validateLaneConfig,
} from "../src/laneConfig";

describe("laneConfig tokenizer", () => {
  it("splits symbol dividers from letter-run lane tokens", () => {
    expect(tokenizeLaneConfig("S-C:C|B")).toEqual([
      { kind: "lane", raw: "S", parts: ["S"] },
      { kind: "divider", raw: "-", parts: ["-"] },
      { kind: "lane", raw: "C", parts: ["C"] },
      { kind: "divider", raw: ":", parts: [":"] },
      { kind: "lane", raw: "C", parts: ["C"] },
      { kind: "divider", raw: "|", parts: ["|"] },
      { kind: "lane", raw: "B", parts: ["B"] },
    ]);
  });

  it("handles multi-char codes and '+'-joined shared lanes", () => {
    expect(tokenizeLaneConfig("AL|B+C|CP")).toEqual([
      { kind: "lane", raw: "AL", parts: ["AL"] },
      { kind: "divider", raw: "|", parts: ["|"] },
      { kind: "lane", raw: "B+C", parts: ["B", "C"] },
      { kind: "divider", raw: "|", parts: ["|"] },
      { kind: "lane", raw: "CP", parts: ["CP"] },
    ]);
  });

  it("returns an empty array for empty/null input", () => {
    expect(tokenizeLaneConfig(null)).toEqual([]);
    expect(tokenizeLaneConfig("")).toEqual([]);
  });
});

describe("validateLaneConfig", () => {
  it("accepts known codes and rejects unknown ones", () => {
    expect(validateLaneConfig("S-C:C|B")).toEqual([]);
    expect(validateLaneConfig("S-ZZ:C")).toEqual([`Segment 3: unknown lane code "ZZ"`]);
  });

  it("rejects more than two '+'-joined codes", () => {
    expect(validateLaneConfig("B+C+A")).toEqual([
      `Segment 1 ("B+C+A"): at most two "+"-joined lane types`,
    ]);
  });
});

describe("parseLaneConfig / serializeLaneConfig round-trip", () => {
  it("zips widths and directions with tokens and serializes back to the same strings", () => {
    const laneConfig = "S-C:C";
    const laneWidth = "60|0|132|0|132";
    const laneDirection = "B|B|I|I|O";
    const segments = parseLaneConfig(laneConfig, laneWidth, laneDirection);
    expect(segments.map((s) => s.width)).toEqual([60, 0, 132, 0, 132]);
    expect(segments.map((s) => s.direction)).toEqual(["B", "B", "I", "I", "O"]);
    expect(serializeLaneConfig(segments)).toEqual({ laneConfig, laneWidth, laneDirection });
  });

  it("falls back to default widths when the width list length doesn't match", () => {
    const segments = parseLaneConfig("S-C", "60");
    expect(segments).toHaveLength(3);
    expect(segments[1].width).toBe(0); // divider default
    expect(segments[2].width).toBeGreaterThan(0); // car lane default
  });
});

describe("computeDefaultDirections", () => {
  it("defaults sidewalks to both directions", () => {
    const tokens = tokenizeLaneConfig("S-C");
    expect(computeDefaultDirections(tokens, false)).toEqual(["B", "B", "I"]);
  });

  it("flips direction across the solid centerline for RHT", () => {
    const tokens = tokenizeLaneConfig("S-C:C|C:C-S");
    expect(computeDefaultDirections(tokens, false)).toEqual([
      "B", // S
      "B", // -
      "I", // C (before centerline)
      "B", // :
      "I", // C
      "B", // |
      "O", // C (after centerline)
      "B", // :
      "O", // C
      "B", // -
      "B", // S
    ]);
  });

  it("mirrors direction for LHT", () => {
    const tokens = tokenizeLaneConfig("C|C");
    expect(computeDefaultDirections(tokens, false)).toEqual(["I", "B", "O"]);
    expect(computeDefaultDirections(tokens, true)).toEqual(["O", "B", "I"]);
  });
});

describe("unit conversion helpers", () => {
  it("converts inches/cm to ft/m and back", () => {
    expect(toDisplayWidth(132, false)).toBeCloseTo(11);
    expect(toDisplayWidth(365, true)).toBeCloseTo(3.65);
    expect(fromDisplayWidth(11, false)).toBeCloseTo(132);
    expect(fromDisplayWidth(3.65, true)).toBeCloseTo(365);
  });
});
