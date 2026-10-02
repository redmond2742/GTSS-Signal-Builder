import { describe, expect, it } from "vitest";
import {
  generateProceduralIntersection,
  getAllDemoIntersections,
  type DemoIntersection,
} from "../src/demoIntersections";
import { parseLaneConfig, tokenizeLaneConfig, validateLaneConfig } from "../src/laneConfig";

describe("demoIntersections", () => {
  it("provides preset intersections covering 2, 3, 4, and 5 approach configurations", () => {
    const demos = getAllDemoIntersections();
    expect(demos.length).toBeGreaterThanOrEqual(7);

    const counts = demos.map((d) => d.approachCount);
    expect(counts).toContain(2);
    expect(counts).toContain(3);
    expect(counts).toContain(4);
    expect(counts).toContain(5);

    demos.forEach((d) => {
      expect(d.approaches.length).toBe(d.approachCount);
      expect(d.phases.length).toBeGreaterThan(0);
      expect(d.detectors.length).toBeGreaterThan(0);
      expect(d.basicTimings.length).toBeGreaterThan(0);
      expect(d.signal.signalId).toBeTruthy();
    });
  });

  it("generates valid procedural intersections with 2, 3, 4, and 5 legs", () => {
    [2, 3, 4, 5].forEach((count) => {
      const proc = generateProceduralIntersection({
        approachCount: count as 2 | 3 | 4 | 5,
        baseBearing: 15,
        hasLeftTurns: true,
        hasSlipLanes: true,
        speed: 45,
        seed: 42,
      });

      expect(proc.approachCount).toBe(count);
      expect(proc.approaches.length).toBe(count);
      expect(proc.phases.length).toBeGreaterThanOrEqual(count);
      expect(proc.detectors.length).toBeGreaterThanOrEqual(count);
      expect(proc.basicTimings.length).toBeGreaterThanOrEqual(count);

      // Verify bearings are valid 0-359 integers
      proc.approaches.forEach((app) => {
        expect(app.compassBearing).toBeGreaterThanOrEqual(0);
        expect(app.compassBearing).toBeLessThan(360);
      });
    });
  });

  const expectValidLaneConfigs = (demo: DemoIntersection) => {
    demo.approaches.forEach((app) => {
      expect(app.laneConfig, app.approachId).toBeTruthy();
      expect(validateLaneConfig(app.laneConfig)).toEqual([]);
      const tokenCount = tokenizeLaneConfig(app.laneConfig).length;
      expect(app.laneWidth?.split("|")).toHaveLength(tokenCount);
      expect(app.laneDirection?.split("|")).toHaveLength(tokenCount);

      const inboundCarLanes = parseLaneConfig(
        app.laneConfig,
        app.laneWidth,
        app.laneDirection,
      ).filter(
        (seg) => seg.kind === "lane" && seg.parts.includes("C") && seg.direction === "I",
      ).length;
      const required = demo.phases
        .filter((ph) => ph.approachId === app.approachId && ph.movementType !== "Pedestrian")
        .reduce((sum, ph) => sum + (ph.numOfLanes ?? 1), 0);
      expect(inboundCarLanes, app.approachId).toBeGreaterThanOrEqual(required);
    });
  };

  it("gives every preset approach a valid lane config that covers its phase lanes", () => {
    getAllDemoIntersections().forEach(expectValidLaneConfigs);
  });

  it("includes dedicated streetcar and LRT demo intersections", () => {
    const demos = getAllDemoIntersections();
    const streetcar = demos.find((demo) => demo.id === "demo-4-streetcar");
    const lrt = demos.find((demo) => demo.id === "demo-4-lrt");

    expect(streetcar).toBeDefined();
    expect(
      streetcar?.approaches.some((approach) =>
        tokenizeLaneConfig(approach.laneConfig).some((lane) => lane.parts.includes("R")),
      ),
    ).toBe(true);
    expect(lrt).toBeDefined();
    expect(
      lrt?.approaches.some((approach) =>
        tokenizeLaneConfig(approach.laneConfig).some((lane) => lane.parts.includes("L")),
      ),
    ).toBe(true);
  });

  it("gives procedural approaches valid lane configs", () => {
    for (let seed = 0; seed < 20; seed++) {
      const proc = generateProceduralIntersection({
        approachCount: ((seed % 4) + 2) as 2 | 3 | 4 | 5,
        hasSlipLanes: seed % 2 === 0,
        speed: 30 + (seed % 3) * 10,
        seed,
      });
      expectValidLaneConfigs(proc);
    }
  });
});
