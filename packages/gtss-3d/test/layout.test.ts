import { getAllDemoIntersections, type DemoIntersection } from "gtss";
import { describe, expect, it } from "vitest";
import { matchDetectorLanes } from "../src/detectorPlacement";
import { assignTurnArrows, incomingCarBands } from "../src/laneAssignment";
import { computeLayout } from "../src/layout";
import { angleDistance, legPoint, mirrorApproachLanes } from "../src/legLayout";
import { coreOutline, slipGeometry } from "../src/sceneGeometry";
import type { IntersectionInput } from "../src/types";

const demos = getAllDemoIntersections();
const demo = (id: string) => demos.find((d) => d.id === id) as DemoIntersection;
const toInput = (d: DemoIntersection): IntersectionInput => ({
  signalId: d.signal.signalId,
  approaches: d.approaches,
  phases: d.phases,
  detectors: d.detectors,
});
const arrowsFor = (layout: ReturnType<typeof computeLayout>, approachId: string) => {
  const plan = layout.plans.find((p) => p.leg.approach.approachId === approachId)!;
  return plan.incoming.map((band) => plan.arrows.get(band.index));
};

describe("leg layout", () => {
  it("places each leg opposite its approach bearing", () => {
    const layout = computeLayout(toInput(demo("demo-4-nema-standard")));
    const nb = layout.legs.find((leg) => leg.approach.approachId === "DEMO-4A-1")!;
    expect(nb.angle).toBe(180);
    const p = legPoint(nb, 0, 10);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(10); // south is +z
  });

  it("puts RHT incoming lanes on the driver's right", () => {
    const layout = computeLayout(toInput(demo("demo-4-nema-standard")));
    const nb = layout.legs.find((leg) => leg.approach.approachId === "DEMO-4A-1")!;
    const incoming = incomingCarBands(nb, false);
    // Southern leg, northbound traffic: incoming lanes lie east of the centreline (x > 0).
    incoming.forEach((band) => {
      expect(legPoint(nb, (band.t0 + band.t1) / 2, 20).x).toBeGreaterThan(0);
    });
  });

  it("pushes mouths past every corner so neighbouring legs do not overlap", () => {
    demos.forEach((d) => {
      const layout = computeLayout(toInput(d));
      layout.corners.forEach((corner) => {
        if (!corner.curbVertex) return;
        const a = layout.legs[corner.a];
        const b = layout.legs[corner.b];
        const along = (leg: typeof a) =>
          corner.curbVertex!.x * leg.u.x + corner.curbVertex!.z * leg.u.z;
        expect(a.mouth + 1e-6).toBeGreaterThanOrEqual(along(a));
        expect(b.mouth + 1e-6).toBeGreaterThanOrEqual(along(b));
      });
      expect(coreOutline(layout).length).toBeGreaterThanOrEqual(4);
    });
  });

  it("sorts legs clockwise", () => {
    const layout = computeLayout(toInput(demo("demo-5-star-junction")));
    const angles = layout.legs.map((leg) => leg.angle);
    expect([...angles].sort((a, b) => a - b)).toEqual(angles);
    expect(angleDistance(350, 10)).toBe(20);
  });
});

describe("turn arrows", () => {
  it("assigns a left pocket, through lanes and a shared through-right on Broadway EB", () => {
    const layout = computeLayout(toInput(demo("demo-4-nema-standard")));
    expect(arrowsFor(layout, "DEMO-4A-2")).toEqual(["L", "T", "T", "TR"]);
  });

  it("mirrors turn roles for left-hand traffic", () => {
    const d = demo("demo-4-nema-standard");
    const input = { ...toInput(d), approaches: d.approaches.map(mirrorApproachLanes) };
    const layout = computeLayout(input, { isLht: true });
    expect(arrowsFor(layout, "DEMO-4A-2")).toEqual(["TR", "T", "T", "L"]);
  });

  it("uses turn-only lanes when there is no straight-ahead leg", () => {
    const layout = computeLayout(toInput(demo("demo-3-y-junction")));
    expect(arrowsFor(layout, "DEMO-3B-3")).toEqual(["L", "R"]);
  });

  it("shares lanes when phases need more lanes than exist", () => {
    const layout = computeLayout(toInput(demo("demo-4-nema-standard")));
    const leg = layout.legs[0];
    const arrows = assignTurnArrows(
      leg,
      layout.legs,
      [
        { phase: 1, movementType: "Left Turn", approachId: leg.approach.approachId, numOfLanes: 3 },
        { phase: 2, movementType: "Through", approachId: leg.approach.approachId, numOfLanes: 4 },
      ],
      false,
    );
    const kinds = [...arrows.values()];
    expect(kinds.some((kind) => kind.includes("L") && kind.includes("T"))).toBe(true);
  });
});

describe("crosswalks", () => {
  it("places a crosswalk on every leg of the 8-phase intersection", () => {
    const layout = computeLayout(toInput(demo("demo-4-nema-standard")));
    expect(layout.crosswalks.legs.size).toBe(4);
    expect(layout.plans.every((plan) => plan.stopS > plan.leg.mouth + 3)).toBe(true);
  });

  it("falls back to a centre crossing for a midblock signal", () => {
    const layout = computeLayout(toInput(demo("demo-2-midblock")));
    expect(layout.crosswalks.legs.size).toBe(0);
    expect(layout.crosswalks.core).toEqual([90]);
  });

  it("adds both diagonals and all legs for a full scramble", () => {
    const d = demo("demo-4-nema-standard");
    const input = {
      ...toInput(d),
      phases: [{ phase: 4, movementType: "Pedestrian", approachId: "DEMO-4A-1", isPedestrian: 7 }],
    };
    const layout = computeLayout(input);
    expect(layout.crosswalks.legs.size).toBe(4);
    expect([...layout.crosswalks.diagonals].sort((a, b) => a - b)).toEqual([45, 135]);
  });
});

describe("detectors", () => {
  const layout = computeLayout(toInput(demo("demo-4-nema-standard")));
  const plan = layout.plans.find((p) => p.leg.approach.approachId === "DEMO-4A-2")!;

  it("matches free-text lane labels", () => {
    const left = matchDetectorLanes("EB Left", plan.incoming, plan.arrows)!;
    expect(plan.arrows.get(left[0].index)).toBe("L");
    const thru2 = matchDetectorLanes("EB Thru 2", plan.incoming, plan.arrows)!;
    expect(thru2).toEqual([plan.incoming[2]]);
    expect(matchDetectorLanes("Ped", plan.incoming, plan.arrows)).toBeNull();
    expect(matchDetectorLanes("", plan.incoming, plan.arrows)).toHaveLength(4);
  });

  it("offsets zones upstream of the stop bar and extends the leg to fit them", () => {
    const zone = layout.detectors.find((z) => z.detector.lane === "EB Thru 2")!;
    expect(zone.s0).toBeCloseTo(plan.stopS + 0.6 + 220 * 0.3048);
    expect(plan.leg.mouth + plan.leg.length).toBeGreaterThan(zone.s1);
  });
});

describe("slip lanes", () => {
  it("builds a slip ribbon and island for each free-right approach", () => {
    const layout = computeLayout(toInput(demo("demo-4-skewed-slip-lanes")));
    expect(layout.slips).toHaveLength(3);
    layout.slips.forEach((slip) => {
      const geo = slipGeometry(layout, slip)!;
      expect(geo.inner).toHaveLength(geo.outer.length);
      expect(geo.island?.length ?? 0).toBeGreaterThan(3);
      const corner = layout.corners[slip.cornerIndex];
      // RHT: slip corner sits on the entry leg's -t side.
      expect(corner.b).toBe(slip.legIndex);
    });
  });

  it("uses a default cross-section when lane config is missing", () => {
    const d = demo("demo-4-nema-standard");
    const input = {
      ...toInput(d),
      approaches: d.approaches.map((a) => ({
        ...a,
        laneConfig: null,
        laneWidth: null,
        laneDirection: null,
      })),
    };
    const layout = computeLayout(input);
    const eb = layout.plans.find((p) => p.leg.approach.approachId === "DEMO-4A-2")!;
    expect(eb.incoming).toHaveLength(4);
  });
});
