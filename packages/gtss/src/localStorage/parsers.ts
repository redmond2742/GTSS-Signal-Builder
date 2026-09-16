import { nanoid } from "nanoid";
import type { Approach, BasicTiming, Detector, Phase, Signal } from "../../schema/public";
import { isValidInteger, isValidNumber, parseCSVLine } from "./csv-utils";

const MOVEMENT_TYPE_REVERSE_MAP: Record<string, string> = {
  T: "Through",
  L: "Left Turn",
  LPP: "Left Protected-Permissive",
  LT: "Left Through Shared",
  TL: "Permissive Phase",
  FYA: "Flashing Yellow Arrow",
  U: "U-Turn",
  R: "Right Turn",
  TR: "Through-Right",
  PED: "Pedestrian",
};

export function parseSignalsTXT(content: string): Signal[] {
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length < 1) throw new Error("Signals file must contain header");

  const signals: Signal[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 4) {
      errors.push(`Row ${i + 1}: Must have 4 fields (signal_id, agency_id, latitude, longitude)`);
      continue;
    }
    if (!values[0]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }
    if (!values[1]) {
      errors.push(`Row ${i + 1}: Agency ID is required`);
      continue;
    }
    if (!isValidNumber(values[2])) {
      errors.push(`Row ${i + 1}: Latitude must be a valid number, got "${values[2]}"`);
      continue;
    }
    if (!isValidNumber(values[3])) {
      errors.push(`Row ${i + 1}: Longitude must be a valid number, got "${values[3]}"`);
      continue;
    }
    signals.push({
      id: nanoid(),
      signalId: values[0],
      agencyId: values[1],
      streetName1: "",
      streetName2: "",
      latitude: Number(values[2]),
      longitude: Number(values[3]),
    });
  }
  if (errors.length > 0) throw new Error(`Signals validation errors:\n${errors.join("\n")}`);
  if (signals.length === 0 && lines.length > 1) throw new Error("No valid signals found in file");
  return signals;
}

export function parseApproachesTXT(content: string): Approach[] {
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length < 1) throw new Error("Approaches file must contain header");

  const approaches: Approach[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 5) {
      errors.push(
        `Row ${i + 1}: Must have at least 5 fields (approachId, signalId, streetName, compassBearing, postedSpeed[, freeRight])`,
      );
      continue;
    }
    if (!values[0]) {
      errors.push(`Row ${i + 1}: Approach ID is required`);
      continue;
    }
    if (!values[1]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }
    if (!values[2]) {
      errors.push(`Row ${i + 1}: Street Name is required`);
      continue;
    }
    let compassBearing: number | null = null;
    if (values[3] && values[3].trim() !== "") {
      if (!isValidInteger(values[3])) {
        errors.push(
          `Row ${i + 1}: Compass bearing must be a valid integer or empty, got "${values[3]}"`,
        );
        continue;
      }
      compassBearing = Number(values[3]);
    }
    let postedSpeed: number | null = null;
    if (values[4] && values[4].trim() !== "") {
      if (!isValidInteger(values[4])) {
        errors.push(
          `Row ${i + 1}: Posted speed must be a valid integer or empty, got "${values[4]}"`,
        );
        continue;
      }
      postedSpeed = Number(values[4]);
    }
    let freeRight = 0;
    let freeRightLanes = 1;
    if (values.length > 5 && values[5].trim() !== "") {
      let raw = values[5].trim().toLowerCase();
      const laneMatch = raw.match(/^(\d+)\s*-\s*(fr.*)$/);
      if (laneMatch) {
        const laneCount = parseInt(laneMatch[1], 10);
        if (laneCount >= 1) freeRightLanes = laneCount;
        raw = laneMatch[2];
      }
      if (raw === "false" || raw === "0") freeRight = 0;
      else if (raw === "fr" || raw === "true" || raw === "1") freeRight = 1;
      else if (raw === "fr-p" || raw === "frp" || raw === "2") freeRight = 2;
      else if (raw === "fr-p-i" || raw === "frpi" || raw === "3") freeRight = 3;
      else {
        errors.push(
          `Row ${i + 1}: Free right must be "FR", "FR-P", "FR-P-I" (optionally "<n>-" prefixed), or empty, got "${values[5]}"`,
        );
        continue;
      }
    }
    approaches.push({
      id: nanoid(),
      approachId: values[0],
      signalId: values[1],
      streetName: values[2],
      compassBearing,
      postedSpeed,
      freeRight,
      freeRightLanes,
      laneConfig: values[6]?.trim() ? values[6].trim() : null,
      laneWidth: values[7]?.trim() ? values[7].trim() : null,
      laneDirection: values[8]?.trim() ? values[8].trim() : null,
    });
  }
  if (errors.length > 0) throw new Error(`Approaches validation errors:\n${errors.join("\n")}`);
  if (approaches.length === 0 && lines.length > 1)
    throw new Error("No valid approaches found in file");
  return approaches;
}

export function parsePhasesTXT(content: string): Phase[] {
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length < 1) throw new Error("Phases file must contain header");
  const phases: Phase[] = [];
  const errors: string[] = [];
  const headerCols = parseCSVLine(lines[0]).map((header) => header.trim().toLowerCase());
  const overlapIdx = headerCols.findIndex((header) => header.includes("overlap"));
  const validTypes = [
    "Through",
    "Left Turn",
    "Left Protected-Permissive",
    "Left Through Shared",
    "Permissive Phase",
    "Flashing Yellow Arrow",
    "U-Turn",
    "Right Turn",
    "Through-Right",
    "Pedestrian",
  ];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (overlapIdx >= 0 && values.length > overlapIdx) values.splice(overlapIdx, 1);
    if (values.length < 5) {
      errors.push(
        `Row ${i + 1}: Must have at least 5 fields (phase, signalId, movementType, numOfLanes, approachId)`,
      );
      continue;
    }
    if (!isValidInteger(values[0])) {
      errors.push(`Row ${i + 1}: Phase number must be a valid integer, got "${values[0]}"`);
      continue;
    }
    if (!values[1]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }
    if (!values[2]) {
      errors.push(`Row ${i + 1}: Movement type is required`);
      continue;
    }
    if (!isValidInteger(values[3])) {
      errors.push(`Row ${i + 1}: Number of lanes must be a valid integer, got "${values[3]}"`);
      continue;
    }
    const movementType = MOVEMENT_TYPE_REVERSE_MAP[values[2]] || values[2];
    if (!MOVEMENT_TYPE_REVERSE_MAP[values[2]] && !validTypes.includes(values[2])) {
      errors.push(
        `Row ${i + 1}: Movement type "${values[2]}" is not recognized. Expected codes: T, L, LT, TL, FYA, U, R, TR, PED or full names.`,
      );
      continue;
    }
    const approachId = values[4] && values[4].trim() !== "" ? values[4] : null;
    let pedestrianMode = movementType === "Pedestrian" ? 6 : movementType === "Through" ? 1 : 0;
    if (values.length > 5 && values[5].trim() !== "") {
      const raw = values[5].trim().toLowerCase();
      if (raw === "true") pedestrianMode = 1;
      else if (raw === "false") pedestrianMode = 0;
      else {
        const number = parseInt(raw, 10);
        if (Number.isInteger(number) && number >= 0 && number <= 7) pedestrianMode = number;
        else {
          errors.push(
            `Row ${i + 1}: Pedestrian mode must be 0–7 (or legacy "true"/"false"), got "${values[5]}"`,
          );
          continue;
        }
      }
    }
    let crosswalkLength: number | null = null;
    if (values.length > 6 && values[6].trim() !== "") {
      const raw = values[6].trim().toLowerCase();
      if (!raw.startsWith("le-") && !raw.startsWith("te-")) {
        if (isValidInteger(values[6]) && Number(values[6]) > 0) crosswalkLength = Number(values[6]);
        else {
          errors.push(
            `Row ${i + 1}: Crosswalk length must be "LE-#", "TE-#", or a positive number of feet, got "${values[6]}"`,
          );
          continue;
        }
      }
    }
    phases.push({
      id: nanoid(),
      phase: Number(values[0]),
      signalId: values[1],
      movementType,
      isPedestrian: pedestrianMode,
      numOfLanes: Number(values[3]),
      approachId,
      crosswalkLength,
    });
  }
  if (errors.length > 0) throw new Error(`Phases validation errors:\n${errors.join("\n")}`);
  if (phases.length === 0 && lines.length > 1) throw new Error("No valid phases found in file");
  return phases;
}

export function parseDetectorsTXT(content: string): Detector[] {
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length < 1) throw new Error("Detectors file must contain header");
  const detectors: Detector[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 10) {
      errors.push(
        `Row ${i + 1}: Must have at least 10 fields (channel, signalId, phase, description, purpose, vehicleType, lane, technologyType, length, stopbarSetbackDist[, approachId])`,
      );
      continue;
    }
    if (!values[0]) {
      errors.push(`Row ${i + 1}: Channel is required`);
      continue;
    }
    if (!values[1]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }
    const phaseRaw = (values[2] ?? "").trim();
    if (phaseRaw !== "" && !isValidInteger(phaseRaw)) {
      errors.push(`Row ${i + 1}: Phase must be a valid integer or empty, got "${values[2]}"`);
      continue;
    }
    if (!values[4]) {
      errors.push(`Row ${i + 1}: Purpose is required`);
      continue;
    }
    if (!values[7]) {
      errors.push(`Row ${i + 1}: Technology type is required`);
      continue;
    }
    let length: number | null = null;
    let stopbarSetbackDist: number | null = null;
    if (values[8] && values[8].trim() !== "") {
      if (!isValidNumber(values[8])) {
        errors.push(`Row ${i + 1}: Length must be a valid number or empty, got "${values[8]}"`);
        continue;
      }
      length = Number(values[8]);
    }
    if (values[9] && values[9].trim() !== "") {
      if (!isValidNumber(values[9])) {
        errors.push(
          `Row ${i + 1}: Stopbar setback distance must be a valid number or empty, got "${values[9]}"`,
        );
        continue;
      }
      stopbarSetbackDist = Number(values[9]);
    }
    detectors.push({
      id: nanoid(),
      channel: values[0],
      signalId: values[1],
      phase: phaseRaw === "" ? null : Number(phaseRaw),
      description: values[3] || null,
      purpose: values[4],
      vehicleType: values[5] || null,
      lane: values[6] || null,
      technologyType: values[7],
      length,
      stopbarSetbackDist,
      approachId: (values[10] ?? "").trim() || null,
    });
  }
  if (errors.length > 0) throw new Error(`Detectors validation errors:\n${errors.join("\n")}`);
  if (detectors.length === 0 && lines.length > 1)
    throw new Error("No valid detectors found in file");
  return detectors;
}

export function parseBasicTimingsTXT(content: string): BasicTiming[] {
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length < 1) throw new Error("Basic timings file must contain header");
  const timings: BasicTiming[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 11) {
      errors.push(
        `Row ${i + 1}: Must have 11 fields (phase, signalId, pedWalk, pedClearance, leadingPedInterval, minGreen, maxGreen, yellow, allRed, vehRecallType, pedRecall)`,
      );
      continue;
    }
    if (!isValidInteger(values[0])) {
      errors.push(`Row ${i + 1}: Phase must be a valid integer, got "${values[0]}"`);
      continue;
    }
    if (!values[1]) {
      errors.push(`Row ${i + 1}: Signal ID is required`);
      continue;
    }
    const parseOptionalNumber = (value: string, fieldName: string): number | null | "error" => {
      if (!value || value.trim() === "") return null;
      if (!isValidNumber(value)) {
        errors.push(`Row ${i + 1}: ${fieldName} must be a valid number or empty, got "${value}"`);
        return "error";
      }
      return Number(value);
    };
    const pedWalk = parseOptionalNumber(values[2], "Ped walk");
    const pedClearance = parseOptionalNumber(values[3], "Ped clearance");
    const leadingPedInterval = parseOptionalNumber(values[4], "Leading ped interval");
    const minGreen = parseOptionalNumber(values[5], "Min green");
    const maxGreen = parseOptionalNumber(values[6], "Max green");
    const yellow = parseOptionalNumber(values[7], "Yellow");
    const allRed = parseOptionalNumber(values[8], "All red");
    if (
      [pedWalk, pedClearance, leadingPedInterval, minGreen, maxGreen, yellow, allRed].includes(
        "error",
      )
    )
      continue;
    const vehRecallType = values[9] || "None";
    if (!["None", "Min", "Max", "Soft"].includes(vehRecallType)) {
      errors.push(
        `Row ${i + 1}: veh_recall_type must be None, Min, Max, or Soft, got "${vehRecallType}"`,
      );
      continue;
    }
    const pedRecallStr = values[10]?.toLowerCase() || "false";
    if (pedRecallStr !== "true" && pedRecallStr !== "false") {
      errors.push(`Row ${i + 1}: ped_recall must be true or false, got "${values[10]}"`);
      continue;
    }
    timings.push({
      id: nanoid(),
      phase: Number(values[0]),
      signalId: values[1],
      pedWalk: pedWalk as number | null,
      pedClearance: pedClearance as number | null,
      leadingPedInterval: leadingPedInterval as number | null,
      minGreen: minGreen as number | null,
      maxGreen: maxGreen as number | null,
      yellow: yellow as number | null,
      allRed: allRed as number | null,
      vehRecallType,
      pedRecall: pedRecallStr === "true",
    });
  }
  if (errors.length > 0) throw new Error(`Basic timings validation errors:\n${errors.join("\n")}`);
  if (timings.length === 0 && lines.length > 1)
    throw new Error("No valid basic timings found in file");
  return timings;
}
