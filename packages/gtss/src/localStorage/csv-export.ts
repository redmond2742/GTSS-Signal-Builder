import type { Agency, Approach, BasicTiming, Detector, Phase, Signal } from "../../schema/public";
import { isMetricForSignalId } from "./agency-units";
import { sanitizeCSVField } from "./csv-utils";

const MOVEMENT_TYPE_MAP: Record<string, string> = {
  Through: "T",
  "Left Turn": "L",
  "Left Protected-Permissive": "LPP",
  "Left Through Shared": "LT",
  "Permissive Phase": "TL",
  "Flashing Yellow Arrow": "FYA",
  "U-Turn": "U",
  "Right Turn": "R",
  "Through-Right": "TR",
  Pedestrian: "PED",
};

export function generateAgencyCSV(agency: Agency | null): string {
  if (!agency)
    return "agency_id,agency_name,agency_url,agency_timezone,agency_email,agency_ismetric,agency_islht\n";

  return [
    "agency_id,agency_name,agency_url,agency_timezone,agency_email,agency_ismetric,agency_islht",
    `${sanitizeCSVField(agency.agencyId)},${sanitizeCSVField(agency.agencyName)},${sanitizeCSVField(agency.agencyUrl)},${sanitizeCSVField(agency.agencyTimezone)},${sanitizeCSVField(agency.agencyEmail)},${sanitizeCSVField(agency.agencyIsMetric)},${sanitizeCSVField(agency.agencyIsLht)}`,
  ].join("\n");
}

export function generateAgenciesCSV(agencies: Agency[]): string {
  const header =
    "agency_id,agency_name,agency_url,agency_timezone,agency_email,agency_ismetric,agency_islht";
  if (!agencies || agencies.length === 0) return header + "\n";
  const rows = agencies.map(
    (agency) =>
      `${sanitizeCSVField(agency.agencyId)},${sanitizeCSVField(agency.agencyName)},${sanitizeCSVField(agency.agencyUrl)},${sanitizeCSVField(agency.agencyTimezone)},${sanitizeCSVField(agency.agencyEmail)},${sanitizeCSVField(agency.agencyIsMetric)},${sanitizeCSVField(agency.agencyIsLht)}`,
  );
  return [header, ...rows].join("\n");
}

export function generateSignalsCSV(signals: Signal[]): string {
  const headers = "signal_id,agency_id,latitude,longitude";

  if (signals.length === 0) return headers + "\n";

  const rows = signals.map(
    (signal) =>
      `${sanitizeCSVField(signal.signalId)},${sanitizeCSVField(signal.agencyId)},${sanitizeCSVField(signal.latitude)},${sanitizeCSVField(signal.longitude)}`,
  );

  return [headers, ...rows].join("\n");
}

export function generateApproachesCSV(approaches: Approach[]): string {
  const headers =
    "approach_id,signal_id,street_name,compass_bearing,posted_speed,free_right,lane_config,lane_width,lane_direction";

  if (approaches.length === 0) return headers + "\n";

  const sortedApproaches = [...approaches].sort((a, b) => {
    if (a.signalId !== b.signalId) return a.signalId.localeCompare(b.signalId);
    return a.approachId.localeCompare(b.approachId);
  });

  const frLabel = (
    value: number | boolean | null | undefined,
    lanes: number | null | undefined,
  ) => {
    const code =
      value === 3 ? "FR-P-I" : value === 2 ? "FR-P" : value === 1 || value === true ? "FR" : "";
    if (!code) return "";
    const count = typeof lanes === "number" && lanes > 1 ? lanes : 1;
    return count > 1 ? `${count}-${code}` : code;
  };
  const rows = sortedApproaches.map(
    (approach) =>
      `${sanitizeCSVField(approach.approachId)},${sanitizeCSVField(approach.signalId)},${sanitizeCSVField(approach.streetName)},${sanitizeCSVField(approach.compassBearing)},${sanitizeCSVField(approach.postedSpeed)},${frLabel(approach.freeRight, approach.freeRightLanes)},${sanitizeCSVField(approach.laneConfig ?? "")},${sanitizeCSVField(approach.laneWidth ?? "")},${sanitizeCSVField(approach.laneDirection ?? "")}`,
  );

  return [headers, ...rows].join("\n");
}

const FT_PER_LANE = 12;
const WALKING_SPEED_FPS = 3.5;
const M_PER_LANE = 3.65;
const WALKING_SPEED_MPS = 1.05;

export function crosswalkLengthCode(
  phase: Phase,
  allPhases: Phase[],
  basicTimings: BasicTiming[] = [],
  approaches: Approach[] = [],
  isMetric: boolean = false,
): string {
  if (typeof phase.crosswalkLength === "number" && phase.crosswalkLength > 0) {
    return String(phase.crosswalkLength);
  }

  const pedMode =
    typeof phase.isPedestrian === "number" ? phase.isPedestrian : phase.isPedestrian ? 1 : 0;
  if (pedMode === 0) return "";

  let laneEstimate: number | null = null;
  if (phase.approachId) {
    const groupOf = (movementType: string): "left" | "right" | "through" | "ped" => {
      switch (movementType) {
        case "Left Turn":
        case "Left Protected-Permissive":
        case "Flashing Yellow Arrow":
        case "U-Turn":
          return "left";
        case "Right Turn":
          return "right";
        case "Pedestrian":
          return "ped";
        default:
          return "through";
      }
    };

    const maxByGroup = { left: 0, right: 0, through: 0 };
    allPhases
      .filter((item) => item.signalId === phase.signalId && item.approachId === phase.approachId)
      .forEach((item) => {
        const group = groupOf(item.movementType);
        if (group === "ped") return;
        maxByGroup[group] = Math.max(maxByGroup[group], item.numOfLanes || 1);
      });
    const inboundLanes = maxByGroup.left + maxByGroup.right + maxByGroup.through;

    let departureLanes = 0;
    const findApproach = (approachId: string | null) =>
      approaches.find((item) => item.approachId === approachId && item.signalId === phase.signalId);
    const crossedLeg = findApproach(phase.approachId);
    if (crossedLeg?.compassBearing != null) {
      const outbound = (crossedLeg.compassBearing + 180) % 360;
      const angDiff = (a: number, b: number) => {
        const difference = Math.abs((((a - b) % 360) + 360) % 360);
        return Math.min(difference, 360 - difference);
      };
      allPhases
        .filter((item) => item.signalId === phase.signalId && item.approachId)
        .forEach((item) => {
          const approach = findApproach(item.approachId);
          if (approach?.compassBearing == null) return;
          const bearing = approach.compassBearing;
          const headings: number[] = [];
          switch (item.movementType) {
            case "Through":
              headings.push(bearing);
              break;
            case "Through-Right":
              headings.push(bearing, bearing + 90);
              break;
            case "Left Turn":
            case "Left Protected-Permissive":
            case "Flashing Yellow Arrow":
              headings.push(bearing - 90);
              break;
            case "Left Through Shared":
            case "Permissive Phase":
              headings.push(bearing, bearing - 90);
              break;
            case "Right Turn":
              headings.push(bearing + 90);
              break;
            case "U-Turn":
              headings.push(bearing + 180);
              break;
            default:
              return;
          }
          if (headings.some((heading) => angDiff(heading, outbound) <= 45)) {
            departureLanes = Math.max(departureLanes, item.numOfLanes || 1);
          }
        });
    }

    const totalLanes = inboundLanes + departureLanes;
    if (totalLanes > 0) laneEstimate = totalLanes * (isMetric ? M_PER_LANE : FT_PER_LANE);
  }

  let timeEstimate: number | null = null;
  const timing = basicTimings.find(
    (item) => item.signalId === phase.signalId && item.phase === phase.phase,
  );
  if (timing?.pedClearance && timing.pedClearance > 0) {
    timeEstimate = Math.round(
      timing.pedClearance * (isMetric ? WALKING_SPEED_MPS : WALKING_SPEED_FPS),
    );
  }

  if (laneEstimate !== null && timeEstimate !== null) {
    return timeEstimate < laneEstimate ? `TE-${timeEstimate}` : `LE-${laneEstimate}`;
  }
  if (timeEstimate !== null) return `TE-${timeEstimate}`;
  if (laneEstimate !== null) return `LE-${laneEstimate}`;
  return "";
}

export function generatePhasesCSV(
  phases: Phase[],
  basicTimings: BasicTiming[] = [],
  approaches: Approach[] = [],
): string {
  const headers = "phase,signal_id,movement_type,num_of_lanes,approach_id,PedX,crosswalk_length";

  if (phases.length === 0) return headers + "\n";

  const sortedPhases = [...phases].sort((a, b) => {
    if (a.signalId !== b.signalId) return a.signalId.localeCompare(b.signalId);
    return a.phase - b.phase;
  });

  const rows = sortedPhases.map((phase) => {
    const encodedMovementType = MOVEMENT_TYPE_MAP[phase.movementType] || phase.movementType;
    const pedMode =
      typeof phase.isPedestrian === "number"
        ? phase.isPedestrian
        : phase.movementType === "Through"
          ? 1
          : 0;
    const crosswalk = crosswalkLengthCode(
      phase,
      phases,
      basicTimings,
      approaches,
      isMetricForSignalId(phase.signalId),
    );
    return `${sanitizeCSVField(phase.phase)},${sanitizeCSVField(phase.signalId)},${sanitizeCSVField(encodedMovementType)},${sanitizeCSVField(phase.numOfLanes || 1)},${sanitizeCSVField(phase.approachId)},${sanitizeCSVField(pedMode)},${crosswalk}`;
  });

  return [headers, ...rows].join("\n");
}

export function generateDetectionCSV(detectors: Detector[]): string {
  const headers =
    "channel,signal_id,phase,description,purpose,vehicle_type,lane,technology_type,length,stopbar_setback_dist,approach_id";

  if (detectors.length === 0) return headers + "\n";

  const rows = detectors.map(
    (detector) =>
      `${sanitizeCSVField(detector.channel)},${sanitizeCSVField(detector.signalId)},${sanitizeCSVField(detector.phase ?? "")},${sanitizeCSVField(detector.description)},${sanitizeCSVField(detector.purpose)},${sanitizeCSVField(detector.vehicleType)},${sanitizeCSVField(detector.lane)},${sanitizeCSVField(detector.technologyType)},${sanitizeCSVField(detector.length)},${sanitizeCSVField(detector.stopbarSetbackDist)},${sanitizeCSVField(detector.approachId)}`,
  );

  return [headers, ...rows].join("\n");
}

export function generateBasicTimingsCSV(timings: BasicTiming[]): string {
  const headers =
    "phase,signal_id,ped_walk,ped_clearance,leading_ped_interval,min_green,max_green,yellow,all_red,veh_recall_type,ped_recall";

  if (timings.length === 0) return headers + "\n";

  const sortedTimings = [...timings].sort((a, b) => {
    if (a.signalId !== b.signalId) return a.signalId.localeCompare(b.signalId);
    return a.phase - b.phase;
  });

  const rows = sortedTimings.map(
    (timing) =>
      `${sanitizeCSVField(timing.phase)},${sanitizeCSVField(timing.signalId)},${sanitizeCSVField(timing.pedWalk)},${sanitizeCSVField(timing.pedClearance)},${sanitizeCSVField(timing.leadingPedInterval)},${sanitizeCSVField(timing.minGreen)},${sanitizeCSVField(timing.maxGreen)},${sanitizeCSVField(timing.yellow)},${sanitizeCSVField(timing.allRed)},${sanitizeCSVField(timing.vehRecallType)},${sanitizeCSVField(timing.pedRecall)}`,
  );

  return [headers, ...rows].join("\n");
}
