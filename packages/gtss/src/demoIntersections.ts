import type { Approach, BasicTiming, Detector, Phase, Signal } from "../schema/public";

export interface DemoIntersection {
  id: string;
  name: string;
  description: string;
  approachCount: number;
  category: "2-approach" | "3-approach" | "4-approach" | "5-approach" | "procedural";
  signal: Signal;
  approaches: Approach[];
  phases: Phase[];
  detectors: Detector[];
  basicTimings: BasicTiming[];
}

type LaneFields = Pick<Approach, "laneConfig" | "laneWidth" | "laneDirection">;

interface RoadSpec {
  /** Lane codes from the curb to the centre, for traffic entering the intersection. */
  inbound: string[];
  /** Lane codes from the centre to the curb, for traffic leaving the intersection. */
  outbound: string[];
  center?: "|" | "=" | "/";
  centerWidth?: number;
  /** Paved shoulder width (inches) between sidewalk and road; a curb is used when omitted. */
  shoulder?: number;
  sidewalk?: number;
}

const LANE_WIDTHS: Record<string, number> = {
  C: 132,
  A: 132,
  B: 60,
  P: 72,
  K: 96,
  R: 132,
  L: 144,
  "C+R": 168,
};

/**
 * Builds an RHT laneConfig/laneWidth/laneDirection triple (widths in inches), read left-to-right
 * looking outward from the intersection: sidewalk, inbound lanes, centre, outbound lanes, sidewalk.
 */
function road(spec: RoadSpec): LaneFields {
  const segments: Array<[string, number, string]> = [];
  const edge = (): [string, number, string] =>
    spec.shoulder ? [">", spec.shoulder, "B"] : ["-", 6, "B"];
  const laneRun = (codes: string[], direction: string) => {
    codes.forEach((code, index) => {
      if (index > 0) {
        const protectedPair = code === "P" || codes[index - 1] === "P";
        segments.push(protectedPair ? ["#", 18, "B"] : [":", 0, "B"]);
      }
      segments.push([code, LANE_WIDTHS[code] ?? 132, direction]);
    });
  };
  const sidewalk = spec.sidewalk ?? 72;
  segments.push(["S", sidewalk, "B"], edge());
  laneRun(spec.inbound, "I");
  const center = spec.center ?? "|";
  segments.push([center, center === "|" ? 0 : (spec.centerWidth ?? 48), "B"]);
  laneRun(spec.outbound, "O");
  segments.push(edge(), ["S", sidewalk, "B"]);
  return {
    laneConfig: segments.map(([raw]) => raw).join(""),
    laneWidth: segments.map(([, width]) => String(width)).join("|"),
    laneDirection: segments.map(([, , direction]) => direction).join("|"),
  };
}

function makeApproach(
  id: string,
  approachId: string,
  signalId: string,
  streetName: string,
  compassBearing: number | null,
  postedSpeed: number | null = 35,
  freeRight: number | null = 0,
  freeRightLanes: number | null = 1,
  lanes: LaneFields = {},
): Approach {
  return {
    id,
    approachId,
    signalId,
    streetName,
    compassBearing,
    postedSpeed,
    freeRight,
    freeRightLanes,
    ...lanes,
  };
}

function makePhase(
  id: string,
  signalId: string,
  phase: number,
  movementType: string,
  approachId: string | null = null,
  isPedestrian: number | null = 0,
  numOfLanes: number | null = 1,
  crosswalkLength: number | null = null,
): Phase {
  return {
    id,
    signalId,
    phase,
    movementType,
    approachId,
    isPedestrian,
    numOfLanes,
    crosswalkLength,
  };
}

function makeDetector(
  id: string,
  signalId: string,
  channel: string,
  purpose: string,
  technologyType: string,
  phase: number | null = null,
  approachId: string | null = null,
  lane: string | null = null,
  stopbarSetbackDist: number | null = null,
  description: string | null = null,
  vehicleType: string | null = null,
  length: number | null = null,
): Detector {
  return {
    id,
    signalId,
    channel,
    purpose,
    technologyType,
    phase,
    approachId,
    lane,
    stopbarSetbackDist,
    description,
    vehicleType,
    length,
  };
}

function makeTiming(
  id: string,
  signalId: string,
  phase: number,
  minGreen: number | null = 10,
  maxGreen: number | null = 30,
  yellow: number | null = 4,
  allRed: number | null = 2,
  pedWalk: number | null = null,
  pedClearance: number | null = null,
  leadingPedInterval: number | null = null,
  vehRecallType: string | null = "None",
  pedRecall: boolean | null = false,
): BasicTiming {
  return {
    id,
    signalId,
    phase,
    minGreen,
    maxGreen,
    yellow,
    allRed,
    pedWalk,
    pedClearance,
    leadingPedInterval,
    vehRecallType,
    pedRecall,
  };
}

function makeRailTransitDemo(mode: "streetcar" | "lrt"): DemoIntersection {
  const isStreetcar = mode === "streetcar";
  const signalId = isStreetcar ? "DEMO-4C" : "DEMO-4D";
  const route = isStreetcar
    ? road({ inbound: ["C", "C+R"], outbound: ["C+R", "C"] })
    : road({ inbound: ["C", "C", "L"], outbound: ["L", "C", "C"] });
  const crossStreet = road({ inbound: ["C", "C"], outbound: ["C", "C"] });
  const routeName = isStreetcar ? "Market Street" : "Central Avenue";
  const crossStreetName = isStreetcar ? "Union Street" : "University Boulevard";
  const approachSpecs = [
    { bearing: 0, street: `${routeName} NB`, lanes: route },
    { bearing: 90, street: `${crossStreetName} EB`, lanes: crossStreet },
    { bearing: 180, street: `${routeName} SB`, lanes: route },
    { bearing: 270, street: `${crossStreetName} WB`, lanes: crossStreet },
  ];
  const approaches = approachSpecs.map((spec, index) =>
    makeApproach(
      `demo-app-${signalId.toLowerCase()}-${index + 1}`,
      `${signalId}-${index + 1}`,
      signalId,
      spec.street,
      spec.bearing,
      30,
      0,
      1,
      spec.lanes,
    ),
  );
  const phases = approaches.map((approach, index) =>
    makePhase(
      `demo-ph-${signalId.toLowerCase()}-${index + 1}`,
      signalId,
      (index + 1) * 2,
      "Through",
      approach.approachId,
      1,
      2,
      48,
    ),
  );

  return {
    id: isStreetcar ? "demo-4-streetcar" : "demo-4-lrt",
    name: isStreetcar ? "4-Way Streetcar in Mixed Traffic" : "4-Way Median LRT Crossing",
    description: isStreetcar
      ? "Signalized urban intersection with streetcars sharing curbside lanes with general traffic, plus conventional cross-street approaches."
      : "Signalized urban intersection with dedicated median LRT lanes continuing through the junction and conventional cross-street approaches.",
    approachCount: 4,
    category: "4-approach",
    signal: {
      id: `demo-sig-${signalId.toLowerCase()}`,
      signalId,
      agencyId: "DEMO_AGENCY",
      streetName1: routeName,
      streetName2: crossStreetName,
      latitude: isStreetcar ? 37.769 : 37.761,
      longitude: isStreetcar ? -122.416 : -122.414,
    },
    approaches,
    phases,
    detectors: approaches.map((approach, index) =>
      makeDetector(
        `demo-det-${signalId.toLowerCase()}-${index + 1}`,
        signalId,
        String(index + 1),
        "Stop Bar",
        "Video",
        (index + 1) * 2,
        approach.approachId,
        isStreetcar && (index === 0 || index === 2) ? "Streetcar lane" : "Through lane",
        0,
        `${approach.streetName} stop bar`,
        isStreetcar && (index === 0 || index === 2) ? "Streetcar" : null,
      ),
    ),
    basicTimings: phases.map((phase, index) =>
      makeTiming(
        `demo-bt-${signalId.toLowerCase()}-${index + 1}`,
        signalId,
        phase.phase,
        12,
        40,
        4,
        2,
        7,
        15,
        null,
        index === 0 ? "Min" : "None",
      ),
    ),
  };
}

const GRAND_AVE = road({ inbound: ["B", "C", "C"], outbound: ["C", "C", "B"] });
const DIAGONAL_PKWY = road({
  inbound: ["P", "C", "C", "C"],
  outbound: ["C", "C", "P"],
  center: "=",
  centerWidth: 48,
});
const FORKS_HWY = road({
  inbound: ["C", "C"],
  outbound: ["C", "C"],
  center: "/",
  centerWidth: 120,
});
const BROADWAY = road({
  inbound: ["C", "C", "C", "C"],
  outbound: ["C", "C", "C"],
  center: "=",
  centerWidth: 48,
});
const CENTER_ST = road({ inbound: ["K", "C", "C", "C"], outbound: ["C", "C", "K"] });
const DIAGONAL_EXPWY = road({
  inbound: ["A", "C", "C", "C", "C"],
  outbound: ["C", "C", "C", "A"],
  center: "=",
  centerWidth: 72,
});
const CROSS_PARK = road({ inbound: ["B", "C", "C"], outbound: ["C", "C", "B"] });

/**
 * Curated preset showcase intersections demonstrating varied approaches,
 * angles, slip lanes, complex phasing, detectors, and timing parameters.
 */
export const PRESET_DEMO_INTERSECTIONS: DemoIntersection[] = [
  // 1. Two Approaches: Midblock Pedestrian Crossing (0° & 180°)
  {
    id: "demo-2-midblock",
    name: "2-Way Midblock Crossing",
    description:
      "North-South 2-approach arterial with dedicated pedestrian crossing phases, stop bar video detection, and advanced dilemma loops.",
    approachCount: 2,
    category: "2-approach",
    signal: {
      id: "demo-sig-2a",
      signalId: "DEMO-2A",
      agencyId: "DEMO_AGENCY",
      streetName1: "Grand Avenue",
      streetName2: "Pedestrian Crossing",
      latitude: 37.7749,
      longitude: -122.4194,
    },
    approaches: [
      makeApproach("demo-app-2a-1", "DEMO-2A-1", "DEMO-2A", "Grand Ave NB", 0, 35, 0, 1, GRAND_AVE),
      makeApproach(
        "demo-app-2a-2",
        "DEMO-2A-2",
        "DEMO-2A",
        "Grand Ave SB",
        180,
        35,
        0,
        1,
        GRAND_AVE,
      ),
    ],
    phases: [
      makePhase("demo-ph-2a-2", "DEMO-2A", 2, "Through", "DEMO-2A-1", 1, 2, 48),
      makePhase("demo-ph-2a-6", "DEMO-2A", 6, "Through", "DEMO-2A-2", 1, 2, 48),
      makePhase("demo-ph-2a-4", "DEMO-2A", 4, "Pedestrian", "DEMO-2A-1", 1, 0, 52),
    ],
    detectors: [
      makeDetector(
        "demo-det-2a-1",
        "DEMO-2A",
        "1",
        "Stop Bar",
        "Video",
        2,
        "DEMO-2A-1",
        "1",
        0,
        "NB Lane 1 Stop Bar",
      ),
      makeDetector(
        "demo-det-2a-2",
        "DEMO-2A",
        "2",
        "Advanced Loop",
        "Inductance Loop",
        2,
        "DEMO-2A-1",
        "2",
        120,
        "NB Advanced Speed Loop",
      ),
      makeDetector(
        "demo-det-2a-3",
        "DEMO-2A",
        "3",
        "Stop Bar",
        "Video",
        6,
        "DEMO-2A-2",
        "1",
        0,
        "SB Lane 1 Stop Bar",
      ),
      makeDetector(
        "demo-det-2a-4",
        "DEMO-2A",
        "4",
        "Advanced Loop",
        "Inductance Loop",
        6,
        "DEMO-2A-2",
        "2",
        120,
        "SB Advanced Speed Loop",
      ),
      makeDetector(
        "demo-det-2a-5",
        "DEMO-2A",
        "5",
        "Count Detector",
        "Radar",
        4,
        "DEMO-2A-1",
        "Ped",
        null,
        "Crosswalk Pedestrian Radar Push",
      ),
    ],
    basicTimings: [
      makeTiming("demo-bt-2a-2", "DEMO-2A", 2, 15, 45, 4, 2, 7, 14, null, "Min", false),
      makeTiming("demo-bt-2a-6", "DEMO-2A", 6, 15, 45, 4, 2, 7, 14, null, "Min", false),
      makeTiming("demo-bt-2a-4", "DEMO-2A", 4, 0, 0, 0, 0, 10, 18, 3, "None", false),
    ],
  },

  // 2. Two Approaches: Skewed Angled Crossing (45° & 225°)
  {
    id: "demo-2-skewed",
    name: "2-Way Skewed Diagonal Avenue",
    description:
      "Diagonal arterial at 45° and 225° bearings with protected left turns and microwave detection.",
    approachCount: 2,
    category: "2-approach",
    signal: {
      id: "demo-sig-2b",
      signalId: "DEMO-2B",
      agencyId: "DEMO_AGENCY",
      streetName1: "Diagonal Parkway",
      streetName2: "Connector Rd",
      latitude: 37.776,
      longitude: -122.418,
    },
    approaches: [
      makeApproach(
        "demo-app-2b-1",
        "DEMO-2B-1",
        "DEMO-2B",
        "Diagonal Pkwy NE",
        45,
        45,
        0,
        1,
        DIAGONAL_PKWY,
      ),
      makeApproach(
        "demo-app-2b-2",
        "DEMO-2B-2",
        "DEMO-2B",
        "Diagonal Pkwy SW",
        225,
        45,
        0,
        1,
        DIAGONAL_PKWY,
      ),
    ],
    phases: [
      makePhase("demo-ph-2b-2", "DEMO-2B", 2, "Through", "DEMO-2B-1", 1, 2, 45),
      makePhase("demo-ph-2b-5", "DEMO-2B", 5, "Left Turn", "DEMO-2B-1", 0, 1, null),
      makePhase("demo-ph-2b-6", "DEMO-2B", 6, "Through", "DEMO-2B-2", 1, 2, 45),
      makePhase("demo-ph-2b-1", "DEMO-2B", 1, "Left Turn", "DEMO-2B-2", 0, 1, null),
    ],
    detectors: [
      makeDetector(
        "demo-det-2b-1",
        "DEMO-2B",
        "1",
        "Stop Bar",
        "Microwave",
        2,
        "DEMO-2B-1",
        "1",
        0,
      ),
      makeDetector(
        "demo-det-2b-2",
        "DEMO-2B",
        "2",
        "Stop Bar",
        "Inductance Loop",
        5,
        "DEMO-2B-1",
        "Left",
        0,
      ),
      makeDetector(
        "demo-det-2b-3",
        "DEMO-2B",
        "3",
        "Stop Bar",
        "Microwave",
        6,
        "DEMO-2B-2",
        "1",
        0,
      ),
      makeDetector(
        "demo-det-2b-4",
        "DEMO-2B",
        "4",
        "Stop Bar",
        "Inductance Loop",
        1,
        "DEMO-2B-2",
        "Left",
        0,
      ),
    ],
    basicTimings: [
      makeTiming("demo-bt-2b-2", "DEMO-2B", 2, 12, 40, 4.5, 2, 7, 12, null, "Min"),
      makeTiming("demo-bt-2b-5", "DEMO-2B", 5, 6, 18, 3.5, 1.5, null, null, null, "None"),
      makeTiming("demo-bt-2b-6", "DEMO-2B", 6, 12, 40, 4.5, 2, 7, 12, null, "Min"),
      makeTiming("demo-bt-2b-1", "DEMO-2B", 1, 6, 18, 3.5, 1.5, null, null, null, "None"),
    ],
  },

  // 3. Three Approaches: Standard T-Intersection (0°, 90°, 270°) with Free Right slip lane
  {
    id: "demo-3-t-junction",
    name: "3-Way T-Junction with Slip Lane",
    description:
      "East-West arterial (90° & 270°) with a Northbound stem (0°), Free Right slip lane with pedestrian crossing (FR-P), and video detection.",
    approachCount: 3,
    category: "3-approach",
    signal: {
      id: "demo-sig-3a",
      signalId: "DEMO-3A",
      agencyId: "DEMO_AGENCY",
      streetName1: "Main Boulevard",
      streetName2: "Commerce St",
      latitude: 37.778,
      longitude: -122.415,
    },
    approaches: [
      makeApproach(
        "demo-app-3a-1",
        "DEMO-3A-1",
        "DEMO-3A",
        "Commerce St NB",
        0,
        30,
        2,
        1,
        road({ inbound: ["C", "C"], outbound: ["C"] }),
      ),
      makeApproach(
        "demo-app-3a-2",
        "DEMO-3A-2",
        "DEMO-3A",
        "Main Blvd EB",
        90,
        40,
        0,
        1,
        road({ inbound: ["C", "C", "C"], outbound: ["C", "C"], shoulder: 72 }),
      ),
      makeApproach(
        "demo-app-3a-3",
        "DEMO-3A-3",
        "DEMO-3A",
        "Main Blvd WB",
        270,
        40,
        1,
        1,
        road({ inbound: ["C", "C"], outbound: ["C", "C"], shoulder: 72 }),
      ),
    ],
    phases: [
      makePhase("demo-ph-3a-2", "DEMO-3A", 2, "Through", "DEMO-3A-2", 1, 2, 50),
      makePhase("demo-ph-3a-5", "DEMO-3A", 5, "Left Turn", "DEMO-3A-2", 0, 1, null),
      makePhase("demo-ph-3a-6", "DEMO-3A", 6, "Through", "DEMO-3A-3", 1, 2, 50),
      makePhase("demo-ph-3a-4", "DEMO-3A", 4, "Left Turn", "DEMO-3A-1", 1, 1, 40),
      makePhase("demo-ph-3a-8", "DEMO-3A", 8, "Right Turn", "DEMO-3A-1", 0, 1, null),
    ],
    detectors: [
      makeDetector(
        "demo-det-3a-1",
        "DEMO-3A",
        "1",
        "Stop Bar",
        "Video",
        2,
        "DEMO-3A-2",
        "Through 1",
        0,
      ),
      makeDetector(
        "demo-det-3a-2",
        "DEMO-3A",
        "2",
        "Stop Bar",
        "Inductance Loop",
        5,
        "DEMO-3A-2",
        "Left Turn",
        0,
      ),
      makeDetector(
        "demo-det-3a-3",
        "DEMO-3A",
        "3",
        "Stop Bar",
        "Video",
        6,
        "DEMO-3A-3",
        "Through 1",
        0,
      ),
      makeDetector(
        "demo-det-3a-4",
        "DEMO-3A",
        "4",
        "Stop Bar",
        "Video",
        4,
        "DEMO-3A-1",
        "Stem Left",
        0,
      ),
      makeDetector(
        "demo-det-3a-5",
        "DEMO-3A",
        "5",
        "Advanced Loop",
        "Inductance Loop",
        2,
        "DEMO-3A-2",
        "Through 1",
        150,
      ),
    ],
    basicTimings: [
      makeTiming("demo-bt-3a-2", "DEMO-3A", 2, 15, 50, 4, 1.5, 7, 15, null, "Min"),
      makeTiming("demo-bt-3a-5", "DEMO-3A", 5, 5, 20, 3.5, 1.5, null, null, null, "None"),
      makeTiming("demo-bt-3a-6", "DEMO-3A", 6, 15, 50, 4, 1.5, 7, 15, null, "Min"),
      makeTiming("demo-bt-3a-4", "DEMO-3A", 4, 8, 25, 3.5, 2, 7, 12, null, "None"),
      makeTiming("demo-bt-3a-8", "DEMO-3A", 8, 6, 20, 3.5, 1.5, null, null, null, "None"),
    ],
  },

  // 4. Three Approaches: Skewed Y-Intersection (30°, 150°, 270°)
  {
    id: "demo-3-y-junction",
    name: "3-Way Skewed Y-Junction",
    description:
      "Forked intersection at irregular 30°, 150°, and 270° angles with radar detection and dilemma zone loops.",
    approachCount: 3,
    category: "3-approach",
    signal: {
      id: "demo-sig-3b",
      signalId: "DEMO-3B",
      agencyId: "DEMO_AGENCY",
      streetName1: "Forks Highway",
      streetName2: "Valley Cutoff",
      latitude: 37.78,
      longitude: -122.41,
    },
    approaches: [
      makeApproach(
        "demo-app-3b-1",
        "DEMO-3B-1",
        "DEMO-3B",
        "North Branch (30°)",
        30,
        45,
        0,
        1,
        FORKS_HWY,
      ),
      makeApproach(
        "demo-app-3b-2",
        "DEMO-3B-2",
        "DEMO-3B",
        "South Branch (150°)",
        150,
        45,
        0,
        1,
        FORKS_HWY,
      ),
      makeApproach(
        "demo-app-3b-3",
        "DEMO-3B-3",
        "DEMO-3B",
        "West Stem (270°)",
        270,
        35,
        0,
        1,
        road({ inbound: ["C", "C"], outbound: ["C", "C"] }),
      ),
    ],
    phases: [
      makePhase("demo-ph-3b-2", "DEMO-3B", 2, "Through", "DEMO-3B-1", 1, 2, 45),
      makePhase("demo-ph-3b-4", "DEMO-3B", 4, "Through", "DEMO-3B-2", 1, 2, 45),
      makePhase("demo-ph-3b-6", "DEMO-3B", 6, "Left Turn", "DEMO-3B-3", 0, 1, null),
    ],
    detectors: [
      makeDetector("demo-det-3b-1", "DEMO-3B", "1", "Stop Bar", "Radar", 2, "DEMO-3B-1", "1", 0),
      makeDetector("demo-det-3b-2", "DEMO-3B", "2", "Stop Bar", "Radar", 4, "DEMO-3B-2", "1", 0),
      makeDetector(
        "demo-det-3b-3",
        "DEMO-3B",
        "3",
        "Dilemma Zone",
        "Inductance Loop",
        6,
        "DEMO-3B-3",
        "Stem",
        180,
      ),
    ],
    basicTimings: [
      makeTiming("demo-bt-3b-2", "DEMO-3B", 2, 12, 35, 4, 2, 7, 14, null, "Soft"),
      makeTiming("demo-bt-3b-4", "DEMO-3B", 4, 12, 35, 4, 2, 7, 14, null, "Soft"),
      makeTiming("demo-bt-3b-6", "DEMO-3B", 6, 8, 25, 3.5, 2, null, null, null, "None"),
    ],
  },

  // 5. Four Approaches: Standard 8-Phase NEMA Intersection (0°, 90°, 180°, 270°)
  {
    id: "demo-4-nema-standard",
    name: "4-Way Standard NEMA 8-Phase",
    description:
      "Classic dual-ring 8-phase signal with protected left turns on all four approaches, comprehensive loop and radar detection, and dilemma zone sensors.",
    approachCount: 4,
    category: "4-approach",
    signal: {
      id: "demo-sig-4a",
      signalId: "DEMO-4A",
      agencyId: "DEMO_AGENCY",
      streetName1: "Broadway",
      streetName2: "Center Street",
      latitude: 37.782,
      longitude: -122.405,
    },
    approaches: [
      makeApproach("demo-app-4a-1", "DEMO-4A-1", "DEMO-4A", "Center St NB", 0, 35, 0, 1, CENTER_ST),
      makeApproach("demo-app-4a-2", "DEMO-4A-2", "DEMO-4A", "Broadway EB", 90, 45, 0, 1, BROADWAY),
      makeApproach(
        "demo-app-4a-3",
        "DEMO-4A-3",
        "DEMO-4A",
        "Center St SB",
        180,
        35,
        0,
        1,
        CENTER_ST,
      ),
      makeApproach("demo-app-4a-4", "DEMO-4A-4", "DEMO-4A", "Broadway WB", 270, 45, 0, 1, BROADWAY),
    ],
    phases: [
      makePhase("demo-ph-4a-1", "DEMO-4A", 1, "Left Turn", "DEMO-4A-4", 0, 1, null),
      makePhase("demo-ph-4a-2", "DEMO-4A", 2, "Through", "DEMO-4A-2", 1, 3, 60),
      makePhase("demo-ph-4a-3", "DEMO-4A", 3, "Left Turn", "DEMO-4A-3", 0, 1, null),
      makePhase("demo-ph-4a-4", "DEMO-4A", 4, "Through", "DEMO-4A-1", 1, 2, 72),
      makePhase("demo-ph-4a-5", "DEMO-4A", 5, "Left Turn", "DEMO-4A-2", 0, 1, null),
      makePhase("demo-ph-4a-6", "DEMO-4A", 6, "Through", "DEMO-4A-4", 1, 3, 60),
      makePhase("demo-ph-4a-7", "DEMO-4A", 7, "Left Turn", "DEMO-4A-1", 0, 1, null),
      makePhase("demo-ph-4a-8", "DEMO-4A", 8, "Through", "DEMO-4A-3", 1, 2, 72),
    ],
    detectors: [
      makeDetector(
        "demo-det-4a-1",
        "DEMO-4A",
        "1",
        "Stop Bar",
        "Inductance Loop",
        1,
        "DEMO-4A-4",
        "WB Left",
        0,
      ),
      makeDetector(
        "demo-det-4a-2",
        "DEMO-4A",
        "2",
        "Stop Bar",
        "Video",
        2,
        "DEMO-4A-2",
        "EB Thru 1",
        0,
      ),
      makeDetector(
        "demo-det-4a-3",
        "DEMO-4A",
        "3",
        "Dilemma Zone",
        "Radar",
        2,
        "DEMO-4A-2",
        "EB Thru 2",
        220,
      ),
      makeDetector(
        "demo-det-4a-4",
        "DEMO-4A",
        "4",
        "Stop Bar",
        "Inductance Loop",
        3,
        "DEMO-4A-3",
        "SB Left",
        0,
      ),
      makeDetector(
        "demo-det-4a-5",
        "DEMO-4A",
        "5",
        "Stop Bar",
        "Video",
        4,
        "DEMO-4A-1",
        "NB Thru 1",
        0,
      ),
      makeDetector(
        "demo-det-4a-6",
        "DEMO-4A",
        "6",
        "Stop Bar",
        "Inductance Loop",
        5,
        "DEMO-4A-2",
        "EB Left",
        0,
      ),
      makeDetector(
        "demo-det-4a-7",
        "DEMO-4A",
        "7",
        "Stop Bar",
        "Video",
        6,
        "DEMO-4A-4",
        "WB Thru 1",
        0,
      ),
      makeDetector(
        "demo-det-4a-8",
        "DEMO-4A",
        "8",
        "Stop Bar",
        "Inductance Loop",
        7,
        "DEMO-4A-1",
        "NB Left",
        0,
      ),
      makeDetector(
        "demo-det-4a-9",
        "DEMO-4A",
        "9",
        "Stop Bar",
        "Video",
        8,
        "DEMO-4A-3",
        "SB Thru 1",
        0,
      ),
    ],
    basicTimings: [
      makeTiming("demo-bt-4a-1", "DEMO-4A", 1, 6, 20, 3.5, 1.5, null, null, null, "None"),
      makeTiming("demo-bt-4a-2", "DEMO-4A", 2, 20, 60, 4.5, 2, 7, 16, null, "Min"),
      makeTiming("demo-bt-4a-3", "DEMO-4A", 3, 5, 18, 3.5, 1.5, null, null, null, "None"),
      makeTiming("demo-bt-4a-4", "DEMO-4A", 4, 10, 35, 4, 2, 7, 18, null, "None"),
      makeTiming("demo-bt-4a-5", "DEMO-4A", 5, 6, 20, 3.5, 1.5, null, null, null, "None"),
      makeTiming("demo-bt-4a-6", "DEMO-4A", 6, 20, 60, 4.5, 2, 7, 16, null, "Min"),
      makeTiming("demo-bt-4a-7", "DEMO-4A", 7, 5, 18, 3.5, 1.5, null, null, null, "None"),
      makeTiming("demo-bt-4a-8", "DEMO-4A", 8, 10, 35, 4, 2, 7, 18, null, "None"),
    ],
  },

  // 6. Four Approaches: Skewed Multi-Slip-Lane Intersection (20°, 110°, 200°, 290°)
  {
    id: "demo-4-skewed-slip-lanes",
    name: "4-Way Skewed with Multiple Slip Lanes",
    description:
      "Skewed intersection with varied Free Right slip lanes (FR, FR-P with pedestrian crossing, FR-P-I island), 2-lane slip lane, and video/radar sensors.",
    approachCount: 4,
    category: "4-approach",
    signal: {
      id: "demo-sig-4b",
      signalId: "DEMO-4B",
      agencyId: "DEMO_AGENCY",
      streetName1: "Diagonal Expressway",
      streetName2: "Cross Park Way",
      latitude: 37.784,
      longitude: -122.401,
    },
    approaches: [
      makeApproach(
        "demo-app-4b-1",
        "DEMO-4B-1",
        "DEMO-4B",
        "Cross Park NE (20°)",
        20,
        40,
        1,
        1,
        CROSS_PARK,
      ),
      makeApproach(
        "demo-app-4b-2",
        "DEMO-4B-2",
        "DEMO-4B",
        "Diagonal Expwy SE (110°)",
        110,
        50,
        2,
        2,
        DIAGONAL_EXPWY,
      ),
      makeApproach(
        "demo-app-4b-3",
        "DEMO-4B-3",
        "DEMO-4B",
        "Cross Park SW (200°)",
        200,
        40,
        3,
        1,
        CROSS_PARK,
      ),
      makeApproach(
        "demo-app-4b-4",
        "DEMO-4B-4",
        "DEMO-4B",
        "Diagonal Expwy NW (290°)",
        290,
        50,
        0,
        1,
        DIAGONAL_EXPWY,
      ),
    ],
    phases: [
      makePhase("demo-ph-4b-2", "DEMO-4B", 2, "Through", "DEMO-4B-2", 1, 3, 55),
      makePhase("demo-ph-4b-5", "DEMO-4B", 5, "Left Turn", "DEMO-4B-2", 0, 1, null),
      makePhase("demo-ph-4b-6", "DEMO-4B", 6, "Through", "DEMO-4B-4", 1, 3, 55),
      makePhase("demo-ph-4b-1", "DEMO-4B", 1, "Left Turn", "DEMO-4B-4", 0, 1, null),
      makePhase("demo-ph-4b-4", "DEMO-4B", 4, "Through", "DEMO-4B-1", 1, 2, 45),
      makePhase("demo-ph-4b-8", "DEMO-4B", 8, "Through", "DEMO-4B-3", 1, 2, 45),
    ],
    detectors: [
      makeDetector(
        "demo-det-4b-1",
        "DEMO-4B",
        "1",
        "Stop Bar",
        "Radar",
        2,
        "DEMO-4B-2",
        "Main Thru",
        0,
      ),
      makeDetector(
        "demo-det-4b-2",
        "DEMO-4B",
        "2",
        "Stop Bar",
        "Inductance Loop",
        5,
        "DEMO-4B-2",
        "Left Pocket",
        0,
      ),
      makeDetector(
        "demo-det-4b-3",
        "DEMO-4B",
        "3",
        "Stop Bar",
        "Radar",
        6,
        "DEMO-4B-4",
        "Main Thru",
        0,
      ),
      makeDetector(
        "demo-det-4b-4",
        "DEMO-4B",
        "4",
        "Stop Bar",
        "Video",
        4,
        "DEMO-4B-1",
        "Cross Thru",
        0,
      ),
      makeDetector(
        "demo-det-4b-5",
        "DEMO-4B",
        "5",
        "Stop Bar",
        "Video",
        8,
        "DEMO-4B-3",
        "Cross Thru",
        0,
      ),
    ],
    basicTimings: [
      makeTiming("demo-bt-4b-2", "DEMO-4B", 2, 18, 55, 4.5, 2, 7, 16, null, "Min"),
      makeTiming("demo-bt-4b-5", "DEMO-4B", 5, 6, 20, 3.5, 1.5, null, null, null, "None"),
      makeTiming("demo-bt-4b-6", "DEMO-4B", 6, 18, 55, 4.5, 2, 7, 16, null, "Min"),
      makeTiming("demo-bt-4b-1", "DEMO-4B", 1, 6, 20, 3.5, 1.5, null, null, null, "None"),
      makeTiming("demo-bt-4b-4", "DEMO-4B", 4, 10, 30, 4, 2, 7, 14, null, "None"),
      makeTiming("demo-bt-4b-8", "DEMO-4B", 8, 10, 30, 4, 2, 7, 14, null, "None"),
    ],
  },

  makeRailTransitDemo("streetcar"),
  makeRailTransitDemo("lrt"),

  // 7. Five Approaches: Complex 5-Leg Multi-Way Star Intersection
  {
    id: "demo-5-star-junction",
    name: "5-Leg Multi-Way Star Intersection",
    description:
      "Complex 5-approach intersection with irregular bearings (0°, 50°, 120°, 200°, 285°), multi-phase sequences, dilemma zone radar, and loop sensors.",
    approachCount: 5,
    category: "5-approach",
    signal: {
      id: "demo-sig-5a",
      signalId: "DEMO-5A",
      agencyId: "DEMO_AGENCY",
      streetName1: "Five Points Plaza",
      streetName2: "Monument Way",
      latitude: 37.788,
      longitude: -122.395,
    },
    approaches: [
      makeApproach(
        "demo-app-5a-1",
        "DEMO-5A-1",
        "DEMO-5A",
        "North Blvd (0°)",
        0,
        30,
        0,
        1,
        road({ inbound: ["C", "C+R"], outbound: ["C+R", "C"] }),
      ),
      makeApproach(
        "demo-app-5a-2",
        "DEMO-5A-2",
        "DEMO-5A",
        "Northeast Ave (50°)",
        50,
        35,
        1,
        1,
        road({ inbound: ["C", "C"], outbound: ["C", "C"] }),
      ),
      makeApproach(
        "demo-app-5a-3",
        "DEMO-5A-3",
        "DEMO-5A",
        "Southeast Way (120°)",
        120,
        30,
        0,
        1,
        road({ inbound: ["C", "C"], outbound: ["C", "C"] }),
      ),
      makeApproach(
        "demo-app-5a-4",
        "DEMO-5A-4",
        "DEMO-5A",
        "Southwest Blvd (200°)",
        200,
        40,
        2,
        1,
        road({ inbound: ["B", "C", "C"], outbound: ["C", "C", "B"] }),
      ),
      makeApproach(
        "demo-app-5a-5",
        "DEMO-5A-5",
        "DEMO-5A",
        "West Connector (285°)",
        285,
        35,
        0,
        1,
        road({ inbound: ["C", "C"], outbound: ["C"] }),
      ),
    ],
    phases: [
      makePhase("demo-ph-5a-2", "DEMO-5A", 2, "Through", "DEMO-5A-1", 1, 2, 55),
      makePhase("demo-ph-5a-4", "DEMO-5A", 4, "Through", "DEMO-5A-2", 1, 2, 65),
      makePhase("demo-ph-5a-6", "DEMO-5A", 6, "Through", "DEMO-5A-3", 1, 2, 50),
      makePhase("demo-ph-5a-8", "DEMO-5A", 8, "Through", "DEMO-5A-4", 1, 2, 70),
      makePhase("demo-ph-5a-7", "DEMO-5A", 7, "Left Turn", "DEMO-5A-5", 0, 1, null),
      makePhase("demo-ph-5a-3", "DEMO-5A", 3, "Through", "DEMO-5A-5", 1, 1, 45),
    ],
    detectors: [
      makeDetector(
        "demo-det-5a-1",
        "DEMO-5A",
        "1",
        "Stop Bar",
        "Radar",
        2,
        "DEMO-5A-1",
        "North Leg",
        0,
      ),
      makeDetector(
        "demo-det-5a-2",
        "DEMO-5A",
        "2",
        "Stop Bar",
        "Video",
        4,
        "DEMO-5A-2",
        "NE Leg",
        0,
      ),
      makeDetector(
        "demo-det-5a-3",
        "DEMO-5A",
        "3",
        "Stop Bar",
        "Inductance Loop",
        6,
        "DEMO-5A-3",
        "SE Leg",
        0,
      ),
      makeDetector(
        "demo-det-5a-4",
        "DEMO-5A",
        "4",
        "Stop Bar",
        "Radar",
        8,
        "DEMO-5A-4",
        "SW Leg",
        0,
      ),
      makeDetector(
        "demo-det-5a-5",
        "DEMO-5A",
        "5",
        "Stop Bar",
        "Inductance Loop",
        7,
        "DEMO-5A-5",
        "West Left",
        0,
      ),
      makeDetector(
        "demo-det-5a-6",
        "DEMO-5A",
        "6",
        "Advanced Loop",
        "Inductance Loop",
        8,
        "DEMO-5A-4",
        "SW Advanced",
        150,
      ),
    ],
    basicTimings: [
      makeTiming("demo-bt-5a-2", "DEMO-5A", 2, 10, 30, 4, 2, 7, 14, null, "Min"),
      makeTiming("demo-bt-5a-4", "DEMO-5A", 4, 8, 25, 4, 2, 7, 16, null, "None"),
      makeTiming("demo-bt-5a-6", "DEMO-5A", 6, 8, 25, 4, 2, 7, 12, null, "None"),
      makeTiming("demo-bt-5a-8", "DEMO-5A", 8, 12, 35, 4.5, 2, 7, 18, null, "None"),
      makeTiming("demo-bt-5a-7", "DEMO-5A", 7, 6, 18, 3.5, 1.5, null, null, null, "None"),
      makeTiming("demo-bt-5a-3", "DEMO-5A", 3, 8, 20, 3.5, 2, 7, 12, null, "None"),
    ],
  },
];

export interface ProceduralGeneratorOptions {
  approachCount: 2 | 3 | 4 | 5;
  baseBearing?: number;
  hasLeftTurns?: boolean;
  hasSlipLanes?: boolean;
  technologyType?: "Inductance Loop" | "Video" | "Radar" | "Microwave";
  speed?: number;
  seed?: number;
}

const STREET_NAME_SEEDS = [
  "Main Street",
  "Oak Avenue",
  "Pine Boulevard",
  "Cedar Expressway",
  "Maple Parkway",
  "Washington Street",
  "Lincoln Highway",
  "Commerce Boulevard",
  "Industrial Parkway",
  "University Avenue",
  "Metropolitan Way",
  "Sunset Drive",
];

/**
 * Procedurally generates a custom realistic intersection with specified parameters.
 */
export function generateProceduralIntersection(
  options: ProceduralGeneratorOptions,
): DemoIntersection {
  const {
    approachCount,
    baseBearing = 0,
    hasLeftTurns = true,
    hasSlipLanes = false,
    technologyType = "Video",
    speed = 35,
    seed = Math.floor(Math.random() * 10000),
  } = options;

  const sigId = `PROC-${approachCount}LEG-${seed}`;
  const street1 = STREET_NAME_SEEDS[seed % STREET_NAME_SEEDS.length];
  const street2 = STREET_NAME_SEEDS[(seed + 3) % STREET_NAME_SEEDS.length];

  const signal: Signal = {
    id: `sig-${sigId}`,
    signalId: sigId,
    agencyId: "DEMO_AGENCY",
    streetName1: street1,
    streetName2: street2,
    latitude: 37.7749 + (seed % 100) * 0.001,
    longitude: -122.4194 + (seed % 100) * 0.001,
  };

  // Generate approaches with equal or slightly skewed angle distributions
  const approaches: Approach[] = [];
  const angleStep = 360 / approachCount;

  for (let i = 0; i < approachCount; i++) {
    // Add realistic jitter ± 10°
    const jitter = ((seed * (i + 1) * 17) % 20) - 10;
    const bearing = Math.round((((baseBearing + i * angleStep + jitter) % 360) + 360) % 360);
    const appId = `${sigId}-${i + 1}`;
    const freeRight = hasSlipLanes && i % 2 === 1 ? (i % 3) + 1 : 0;
    const approachSpeed = speed + (i % 2 === 0 ? 0 : 5);
    const hasLeftLane = hasLeftTurns && (approachCount <= 4 || i < 2);
    const variant = (seed * 31 + i * 7) % 4;
    const curbLane = approachSpeed <= 35 ? (["B", "K", "C", "P"][variant] ?? "C") : "C";
    const inbound = ["C", "C", ...(hasLeftLane ? ["C"] : [])];
    const outbound = ["C", "C"];
    if (curbLane !== "C") {
      inbound.unshift(curbLane);
      outbound.push(curbLane);
    }
    const lanes = road({
      inbound,
      outbound,
      ...(approachSpeed >= 45 ? { center: "=" as const, centerWidth: 48 } : {}),
      ...(approachSpeed >= 50 ? { shoulder: 72 } : {}),
    });

    approaches.push(
      makeApproach(
        `app-${appId}`,
        appId,
        sigId,
        `${i % 2 === 0 ? street1 : street2} (Approach ${i + 1})`,
        bearing,
        approachSpeed,
        freeRight,
        freeRight > 0 && i === 1 ? 2 : 1,
        lanes,
      ),
    );
  }

  // Generate Phases
  const phases: Phase[] = [];
  const detectors: Detector[] = [];
  const basicTimings: BasicTiming[] = [];

  // Deterministic NEMA even-phase sequence; through phases cycle across it so
  // numbers never repeat within a run of 4 approaches, and left phases pair
  // with the preceding odd number (e.g. thru 2 -> left 1). IDs still include
  // the approach index so entries stay unique even when the count exceeds 4
  // and phase numbers legitimately repeat (e.g. a 5th approach).
  const EVEN_PHASES = [2, 4, 6, 8];

  approaches.forEach((app, idx) => {
    // Through Phase
    const thruPhaseNum = EVEN_PHASES[idx % EVEN_PHASES.length];

    phases.push(
      makePhase(
        `ph-${sigId}-${idx}-${thruPhaseNum}`,
        sigId,
        thruPhaseNum,
        "Through",
        app.approachId,
        1,
        2,
        50 + idx * 5,
      ),
    );

    // Through Timing
    if (!basicTimings.some((timing) => timing.phase === thruPhaseNum)) {
      basicTimings.push(
        makeTiming(
          `bt-${sigId}-${idx}-${thruPhaseNum}`,
          sigId,
          thruPhaseNum,
          12 + idx * 2,
          40 + idx * 5,
          4.0,
          2.0,
          7,
          15,
          null,
          idx === 0 ? "Min" : "None",
        ),
      );
    }

    // Detectors for Through Movement
    detectors.push(
      makeDetector(
        `det-${sigId}-${app.approachId}-stop`,
        sigId,
        `${detectors.length + 1}`,
        "Stop Bar",
        technologyType,
        thruPhaseNum,
        app.approachId,
        "1",
        0,
        `${app.approachId} Stop Bar`,
      ),
    );

    if (speed >= 40) {
      detectors.push(
        makeDetector(
          `det-${sigId}-${app.approachId}-adv`,
          sigId,
          `${detectors.length + 1}`,
          "Dilemma Zone",
          "Radar",
          thruPhaseNum,
          app.approachId,
          "1",
          160,
          `${app.approachId} Advanced Loop`,
        ),
      );
    }

    // Left Turn Phase (if applicable) — paired odd phase preceding the through phase
    if (hasLeftTurns && (approachCount <= 4 || idx < 2)) {
      const leftPhaseNum = thruPhaseNum - 1;
      phases.push(
        makePhase(
          `ph-${sigId}-${idx}-${leftPhaseNum}`,
          sigId,
          leftPhaseNum,
          "Left Turn",
          app.approachId,
          0,
          1,
          null,
        ),
      );

      basicTimings.push(
        makeTiming(
          `bt-${sigId}-${idx}-${leftPhaseNum}`,
          sigId,
          leftPhaseNum,
          6,
          20,
          3.5,
          1.5,
          null,
          null,
          null,
          "None",
        ),
      );

      detectors.push(
        makeDetector(
          `det-${sigId}-${app.approachId}-left`,
          sigId,
          `${detectors.length + 1}`,
          "Stop Bar",
          "Inductance Loop",
          leftPhaseNum,
          app.approachId,
          "Left Pocket",
          0,
          `${app.approachId} Left Turn Pocket`,
        ),
      );
    }
  });

  return {
    id: sigId,
    name: `Procedural ${approachCount}-Approach Intersection (${sigId})`,
    description: `Procedurally generated ${approachCount}-leg intersection with custom geometry, ${phases.length} phases, and ${detectors.length} detectors.`,
    approachCount,
    category: "procedural",
    signal,
    approaches,
    phases,
    detectors,
    basicTimings,
  };
}

/**
 * Returns all curated preset demo intersections.
 */
export function getAllDemoIntersections(): DemoIntersection[] {
  return [...PRESET_DEMO_INTERSECTIONS];
}
