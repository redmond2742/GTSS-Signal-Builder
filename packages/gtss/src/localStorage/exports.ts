import type { Agency } from "../../schema/public";
import {
  generateAgenciesCSV,
  generateApproachesCSV,
  generateBasicTimingsCSV,
  generateDetectionCSV,
  generatePhasesCSV,
  generateSignalsCSV,
} from "./csv-export";
import { COORDINATION_ENTITIES, readAllCoordination } from "./coordination/entities";
import { resolveCoordinationScope } from "./coordination/scope";
import { agencyListStorage, agencyStorage } from "./storage/agencies";
import { approachStorage } from "./storage/approaches";
import { basicTimingStorage } from "./storage/basicTimings";
import { detectorStorage } from "./storage/detectors";
import { phaseStorage } from "./storage/phases";
import { signalStorage } from "./storage/signals";

export const exportData = () => ({
  agency: agencyStorage.get(),
  signals: signalStorage.getAll(),
  approaches: approachStorage.getAll(),
  phases: phaseStorage.getAll(),
  detectors: detectorStorage.getAll(),
  basicTimings: basicTimingStorage.getAll(),
});

const downloadFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

type ExportOptions = {
  agency: boolean;
  signals: boolean;
  approaches: boolean;
  phases: boolean;
  detection: boolean;
  basicTimings: boolean;
  /** Opt-in: fold the 8 coordination files into the main export. Optional so
   *  existing six-key callers keep compiling. */
  coordination?: boolean;
};

const defaultExportOptions: ExportOptions = {
  agency: true,
  signals: true,
  approaches: true,
  phases: true,
  detection: true,
  basicTimings: true,
};

const getFilteredExportData = (agencyIds: string[] | null) => {
  const data = exportData();
  let filteredAgencies = agencyListStorage.getAll();
  if (agencyIds && agencyIds.length > 0) {
    filteredAgencies = filteredAgencies.filter((agency) => agencyIds.includes(agency.id));
  }
  const allowedAgencyIds = filteredAgencies.map((agency) => agency.agencyId);
  const filteredSignals = data.signals.filter((signal) =>
    allowedAgencyIds.includes(signal.agencyId),
  );
  const filteredSignalIds = filteredSignals.map((signal) => signal.signalId);

  return {
    agencies: filteredAgencies,
    signals: filteredSignals,
    filteredSignalIds,
    approaches: data.approaches.filter((approach) => filteredSignalIds.includes(approach.signalId)),
    phases: data.phases.filter((phase) => filteredSignalIds.includes(phase.signalId)),
    detectors: data.detectors.filter((detector) => filteredSignalIds.includes(detector.signalId)),
    basicTimings: data.basicTimings.filter((timing) => filteredSignalIds.includes(timing.signalId)),
  };
};

/** Coordination rows that survive the current agency filter. */
const coordinationScopeFor = (agencyIds: string[] | null, filteredSignalIds: string[]) =>
  resolveCoordinationScope(agencyIds === null ? null : filteredSignalIds, readAllCoordination());

export const exportAsIndividualFiles = async (
  includeFiles: ExportOptions = defaultExportOptions,
  agencyIds: string[] | null = null,
): Promise<void> => {
  try {
    const data = getFilteredExportData(agencyIds);

    if (includeFiles.agency)
      downloadFile(generateAgenciesCSV(data.agencies as Agency[]), "agency.txt");
    if (includeFiles.signals) downloadFile(generateSignalsCSV(data.signals), "signals.txt");
    if (includeFiles.approaches)
      downloadFile(generateApproachesCSV(data.approaches), "approaches.txt");
    if (includeFiles.phases) downloadFile(generatePhasesCSV(data.phases), "phases.txt");
    if (includeFiles.detection) downloadFile(generateDetectionCSV(data.detectors), "detectors.txt");
    if (includeFiles.basicTimings)
      downloadFile(generateBasicTimingsCSV(data.basicTimings), "basic_timings.txt");

    if (includeFiles.coordination) {
      const scope = coordinationScopeFor(agencyIds, data.filteredSignalIds);
      COORDINATION_ENTITIES.forEach((entity) =>
        downloadFile(entity.render(scope), entity.filename),
      );
    }
  } catch (error) {
    console.error("Export failed:", error);
    throw error;
  }
};

export const exportAsZip = async (
  includeFiles: ExportOptions = defaultExportOptions,
  agencyIds: string[] | null = null,
): Promise<void> => {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const data = getFilteredExportData(agencyIds);

    if (includeFiles.agency) zip.file("agency.txt", generateAgenciesCSV(data.agencies as Agency[]));
    if (includeFiles.signals) zip.file("signals.txt", generateSignalsCSV(data.signals));
    if (includeFiles.approaches) zip.file("approaches.txt", generateApproachesCSV(data.approaches));
    if (includeFiles.phases) zip.file("phases.txt", generatePhasesCSV(data.phases));
    if (includeFiles.detection) zip.file("detectors.txt", generateDetectionCSV(data.detectors));
    if (includeFiles.basicTimings)
      zip.file("basic_timings.txt", generateBasicTimingsCSV(data.basicTimings));

    if (includeFiles.coordination) {
      const scope = coordinationScopeFor(agencyIds, data.filteredSignalIds);
      COORDINATION_ENTITIES.forEach((entity) => zip.file(entity.filename, entity.render(scope)));
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gtss-export-${new Date().toISOString().split("T")[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Export failed:", error);
    throw error;
  }
};

/**
 * Export the 8 coordination files on their own, as GTSS-Coordination.zip —
 * the same shape the timing-sheet converter produces.
 */
export const exportCoordinationAsZip = async (agencyIds: string[] | null = null): Promise<void> => {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const data = getFilteredExportData(agencyIds);
    const scope = coordinationScopeFor(agencyIds, data.filteredSignalIds);

    COORDINATION_ENTITIES.forEach((entity) => zip.file(entity.filename, entity.render(scope)));

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `GTSS-Coordination-${new Date().toISOString().split("T")[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Coordination export failed:", error);
    throw error;
  }
};
