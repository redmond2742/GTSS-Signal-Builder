import GTSSFileViewer, { GTSSFilePreview } from "@/components/gtss/gtss-file-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  COORDINATION_ENTITIES,
  evaluateGTSSCompleteness,
  generateAgenciesCSV,
  generateApproachesCSV,
  generateBasicTimingsCSV,
  generateDetectionCSV,
  generatePhasesCSV,
  generateSignalsCSV,
  isCoordinationEnabled,
  UNSCOPED,
  useAgencies,
  useExport,
  useGTSSStore,
} from "gtss";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Info,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

export default function ExportPanel() {
  const {
    agency,
    signals,
    approaches,
    phases,
    detectors,
    basicTimings,
    coordination,
    agencyDefaults,
    navigateToSignalDetails,
  } = useGTSSStore();
  const coordinationEnabled = isCoordinationEnabled(agencyDefaults);
  const coordinationRowCount = COORDINATION_ENTITIES.reduce(
    (sum, entity) => sum + (coordination[entity.key]?.length ?? 0),
    0,
  );
  const agenciesApi = useAgencies();

  const getDefaultPackageName = () => {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    const agencyName = agency?.agencyName ? agency.agencyName.replace(/\s+/g, "_") : "Export";
    return `GTSS_${agencyName}_${dateStr}`;
  };

  const [packageName, setPackageName] = useState(getDefaultPackageName());
  const [exportFormat, setExportFormat] = useState("zip");
  const [includeFiles, setIncludeFiles] = useState({
    agency: true,
    signals: true,
    approaches: true,
    phases: true,
    detection: true,
    basicTimings: true,
    // Opt-in: off by default so the main export keeps its existing shape while
    // coordination is experimental.
    coordination: false,
  });
  const [selectedAgencyIds, setSelectedAgencyIds] = useState<string[]>([]);
  const { toast } = useToast();

  const { exportAsZip, exportAsIndividualFiles } = useExport();

  useEffect(() => {
    setPackageName(getDefaultPackageName());
  }, [agency?.agencyName]);

  const handleExport = async () => {
    try {
      if (exportFormat === "txt") {
        await exportAsIndividualFiles(includeFiles, selectedAgencyIds);
        const fileCount = Object.values(includeFiles).filter(Boolean).length;
        toast({
          title: "Success",
          description: `${fileCount} TXT file${fileCount > 1 ? "s" : ""} downloaded successfully`,
        });
      } else if (exportFormat === "zip") {
        await exportAsZip(includeFiles, selectedAgencyIds);
        toast({
          title: "Success",
          description: "GTSS ZIP package exported successfully",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to export GTSS package",
        variant: "destructive",
      });
    }
  };

  const getValidationStatus = () => {
    const issues: { type: string; message: string }[] = [];

    // Determine which agencies the user has selected for export. If none
    // are selected, fall back to all agencies (the UI normally defaults to
    // selecting all). Validation should run against the dataset that will
    // actually be exported.
    const allAgencies = agenciesApi.data;
    const selectedAgencies =
      selectedAgencyIds && selectedAgencyIds.length > 0
        ? allAgencies.filter((a) => selectedAgencyIds.includes(a.id))
        : allAgencies;

    const selectedAgencyIdsForData = selectedAgencies.map((a) => a.agencyId);

    // Filter records to only those that belong to the selected agencies.
    const filteredSignals = signals.filter((s) => selectedAgencyIdsForData.includes(s.agencyId));
    const filteredSignalIds = filteredSignals.map((s) => s.signalId);
    const filteredApproaches = approaches.filter((a) => filteredSignalIds.includes(a.signalId));
    const filteredPhases = phases.filter((p) => filteredSignalIds.includes(p.signalId));
    const filteredDetectors = detectors.filter((d) => filteredSignalIds.includes(d.signalId));
    const filteredBasicTimings = basicTimings.filter((t) => filteredSignalIds.includes(t.signalId));

    // Agency level checks (only relevant if agency records are being exported)
    if (includeFiles.agency) {
      if (selectedAgencies.length === 0) {
        issues.push({ type: "error", message: "No agencies selected for export" });
      } else {
        selectedAgencies.forEach((a) => {
          if (!a.agencyId)
            issues.push({
              type: "error",
              message: `Agency record missing AgencyID: ${a.agencyName || a.id}`,
            });
        });
      }
    }

    if (filteredSignals.length === 0) {
      issues.push({ type: "warning", message: "No signals configured for the selected agencies" });
    }

    filteredSignals.forEach((signal) => {
      if (signal.latitude == null || signal.longitude == null) {
        issues.push({ type: "error", message: `Missing coordinates for ${signal.signalId}` });
      }
      if (!signal.signalId) {
        issues.push({ type: "error", message: `Missing signal ID` });
      }
    });

    const orphanApproaches = filteredApproaches.filter(
      (a) => !filteredSignalIds.includes(a.signalId),
    );
    if (orphanApproaches.length > 0) {
      issues.push({
        type: "error",
        message: `${orphanApproaches.length} approaches reference non-existent signals (in selected agencies)`,
      });
    }

    const orphanPhases = filteredPhases.filter((p) => !filteredSignalIds.includes(p.signalId));
    if (orphanPhases.length > 0) {
      issues.push({
        type: "error",
        message: `${orphanPhases.length} phases reference non-existent signals (in selected agencies)`,
      });
    }

    const orphanDetectors = filteredDetectors.filter(
      (d) => !filteredSignalIds.includes(d.signalId),
    );
    if (orphanDetectors.length > 0) {
      issues.push({
        type: "error",
        message: `${orphanDetectors.length} detectors reference non-existent signals (in selected agencies)`,
      });
    }

    const orphanTimings = filteredBasicTimings.filter(
      (t) => !filteredSignalIds.includes(t.signalId),
    );
    if (orphanTimings.length > 0) {
      issues.push({
        type: "error",
        message: `${orphanTimings.length} timing configs reference non-existent signals (in selected agencies)`,
      });
    }

    return issues;
  };

  const validationIssues = getValidationStatus();
  const hasErrors = validationIssues.some((issue) => issue.type === "error");

  const completenessAnalysis = evaluateGTSSCompleteness(signals, phases, detectors);
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState(false);

  useEffect(() => {
    // default select all agencies
    setSelectedAgencyIds(agenciesApi.data.map((a) => a.id));
  }, [agenciesApi.data]);

  // Build previews from the same filtered datasets used for export
  const allAgencies = agenciesApi.data;
  const selectedAgencies =
    selectedAgencyIds && selectedAgencyIds.length > 0
      ? allAgencies.filter((a) => selectedAgencyIds.includes(a.id))
      : allAgencies;
  const selectedAgencyIdsForData = selectedAgencies.map((a) => a.agencyId);

  const filteredSignals = signals.filter((s) => selectedAgencyIdsForData.includes(s.agencyId));
  const filteredSignalIds = filteredSignals.map((s) => s.signalId);
  const filteredApproaches = approaches.filter((a) => filteredSignalIds.includes(a.signalId));
  const filteredPhases = phases.filter((p) => filteredSignalIds.includes(p.signalId));
  const filteredDetectors = detectors.filter((d) => filteredSignalIds.includes(d.signalId));
  const filteredBasicTimings = basicTimings.filter((t) => filteredSignalIds.includes(t.signalId));

  const previewFiles: GTSSFilePreview[] = [
    ...(includeFiles.coordination
      ? COORDINATION_ENTITIES.map((entity) => ({
          id: entity.key,
          label: entity.filename,
          content: entity.renderFrom(coordination, UNSCOPED),
        }))
      : []),
    // Single combined agency.txt matching download behavior
    ...(includeFiles.agency
      ? [{ id: "agency", label: "agency.txt", content: generateAgenciesCSV(selectedAgencies) }]
      : []),
    includeFiles.signals
      ? { id: "signals", label: "signals.txt", content: generateSignalsCSV(filteredSignals) }
      : null,
    includeFiles.approaches
      ? {
          id: "approaches",
          label: "approaches.txt",
          content: generateApproachesCSV(filteredApproaches),
        }
      : null,
    includeFiles.phases
      ? {
          id: "phases",
          label: "phases.txt",
          content: generatePhasesCSV(filteredPhases, filteredBasicTimings, filteredApproaches),
        }
      : null,
    includeFiles.detection
      ? {
          id: "detectors",
          label: "detectors.txt",
          content: generateDetectionCSV(filteredDetectors),
        }
      : null,
    includeFiles.basicTimings
      ? {
          id: "basicTimings",
          label: "basic_timings.txt",
          content: generateBasicTimingsCSV(filteredBasicTimings),
        }
      : null,
  ].filter(Boolean) as GTSSFilePreview[];

  const agencies = agenciesApi.data;

  const handleExportValidated = async () => {
    if (hasErrors) {
      toast({
        title: "Validation Error",
        description: "Please fix all validation errors before exporting",
        variant: "destructive",
      });
      return;
    }
    await handleExport();
  };

  return (
    <div className="max-w-6xl space-y-6">
      {/* Data Summary */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200 px-4 py-3">
          <CardTitle className="text-base font-semibold text-grey-800">Data Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {/* Counts row */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="font-medium text-grey-800">{agencies.length}</span>
              <span className="text-grey-500">agenc{agencies.length !== 1 ? "ies" : "y"}</span>
            </div>
            <span className="text-grey-300">|</span>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="font-medium text-grey-800">{signals.length}</span>
              <span className="text-grey-500">signal{signals.length !== 1 ? "s" : ""}</span>
            </div>
            <span className="text-grey-300">|</span>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="font-medium text-grey-800">{approaches.length}</span>
              <span className="text-grey-500">approach{approaches.length !== 1 ? "es" : ""}</span>
            </div>
            <span className="text-grey-300">|</span>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="font-medium text-grey-800">{phases.length}</span>
              <span className="text-grey-500">phase{phases.length !== 1 ? "s" : ""}</span>
            </div>
            <span className="text-grey-300">|</span>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="font-medium text-grey-800">{detectors.length}</span>
              <span className="text-grey-500">detector{detectors.length !== 1 ? "s" : ""}</span>
            </div>
            <span className="text-grey-300">|</span>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="font-medium text-grey-800">{basicTimings.length}</span>
              <span className="text-grey-500">timing{basicTimings.length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Configuration status badges */}
          {signals.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {completenessAnalysis.completeSignals > 0 && (
                <Badge
                  variant="default"
                  className="text-xs bg-green-100 text-green-800 hover:bg-green-100"
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {completenessAnalysis.completeSignals} complete
                </Badge>
              )}
              {completenessAnalysis.partialSignals > 0 && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100"
                >
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {completenessAnalysis.partialSignals} partial
                </Badge>
              )}
              {completenessAnalysis.incompleteSignals > 0 && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-red-100 text-red-800 hover:bg-red-100"
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  {completenessAnalysis.incompleteSignals} incomplete
                </Badge>
              )}
            </div>
          )}

          {/* Signal details - collapsible */}
          {completenessAnalysis.results.length > 0 && (
            <Collapsible open={isAnalysisExpanded} onOpenChange={setIsAnalysisExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-1.5 p-0 h-auto text-xs text-grey-600 hover:text-grey-800"
                >
                  {isAnalysisExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  Signal details
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="space-y-1">
                  {completenessAnalysis.results.map((result) => (
                    <div
                      key={result.signalId}
                      className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-grey-50 text-xs cursor-pointer"
                      onClick={() => navigateToSignalDetails(result.signalId)}
                    >
                      <div className="flex items-center gap-2">
                        {result.status === "complete" ? (
                          <CheckCircle className="w-3 h-3 text-green-500" />
                        ) : result.status === "partial" ? (
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-500" />
                        )}
                        <span className="font-medium">{result.signalId}</span>
                        <span className="text-grey-400">{result.street}</span>
                      </div>
                      <div className="flex items-center gap-3 text-grey-500">
                        <span>{result.phaseCount} phases</span>
                        <span>{result.detectorCount} detectors</span>
                        <span className="font-medium text-grey-700">{result.overallScore}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Validation issues */}
          {validationIssues.length > 0 && (
            <div className="mt-4 pt-3 border-t border-grey-100 space-y-1.5">
              {validationIssues.map((issue, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  {issue.type === "error" ? (
                    <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  )}
                  <span className={issue.type === "error" ? "text-red-700" : "text-amber-700"}>
                    {issue.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {validationIssues.length === 0 && (
            <div className="mt-4 pt-3 border-t border-grey-100 flex items-center gap-2 text-xs text-green-700">
              <CheckCircle className="w-3 h-3" />
              All validations passed
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Configuration */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200">
          <CardTitle className="text-lg font-semibold text-grey-800">
            Export Configuration
          </CardTitle>
          <p className="text-sm text-grey-600">Configure your GTSS export package</p>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="packageName">Package Name</Label>
                <Input
                  id="packageName"
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  placeholder="Export package name"
                />
              </div>

              <div>
                <Label htmlFor="exportFormat">Export Format</Label>
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zip">GTSS ZIP Package</SelectItem>
                    <SelectItem value="txt">Individual TXT Files</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border border-grey-200 rounded-lg p-4">
              <h4 className="font-medium text-grey-800 mb-3">Files to Include</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="agency"
                    checked={includeFiles.agency}
                    onCheckedChange={(checked) =>
                      setIncludeFiles((prev) => ({ ...prev, agency: checked as boolean }))
                    }
                  />
                  <Label htmlFor="agency" className="text-sm text-grey-700">
                    agency.txt ({agencies.length} record{agencies.length !== 1 ? "s" : ""})
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="signals"
                    checked={includeFiles.signals}
                    onCheckedChange={(checked) =>
                      setIncludeFiles((prev) => ({ ...prev, signals: checked as boolean }))
                    }
                  />
                  <Label htmlFor="signals" className="text-sm text-grey-700">
                    signals.txt ({signals.length} records)
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="approaches"
                    checked={includeFiles.approaches}
                    onCheckedChange={(checked) =>
                      setIncludeFiles((prev) => ({ ...prev, approaches: checked as boolean }))
                    }
                  />
                  <Label htmlFor="approaches" className="text-sm text-grey-700">
                    approaches.txt ({approaches.length} records)
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="phases"
                    checked={includeFiles.phases}
                    onCheckedChange={(checked) =>
                      setIncludeFiles((prev) => ({ ...prev, phases: checked as boolean }))
                    }
                  />
                  <Label htmlFor="phases" className="text-sm text-grey-700">
                    phases.txt ({phases.length} records)
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="detection"
                    checked={includeFiles.detection}
                    onCheckedChange={(checked) =>
                      setIncludeFiles((prev) => ({ ...prev, detection: checked as boolean }))
                    }
                  />
                  <Label htmlFor="detection" className="text-sm text-grey-700">
                    detectors.txt ({detectors.length} records)
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="basicTimings"
                    checked={includeFiles.basicTimings}
                    onCheckedChange={(checked) =>
                      setIncludeFiles((prev) => ({ ...prev, basicTimings: checked as boolean }))
                    }
                  />
                  <Label htmlFor="basicTimings" className="text-sm text-grey-700">
                    basic_timings.txt ({basicTimings.length} records)
                  </Label>
                </div>
                {coordinationEnabled && (
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="coordination"
                      checked={includeFiles.coordination}
                      onCheckedChange={(checked) =>
                        setIncludeFiles((prev) => ({ ...prev, coordination: checked as boolean }))
                      }
                    />
                    <Label htmlFor="coordination" className="text-sm text-grey-700">
                      Coordination files ({coordinationRowCount} records across{" "}
                      {COORDINATION_ENTITIES.length} files)
                    </Label>
                  </div>
                )}
              </div>
            </div>

            <div className="border border-grey-200 rounded-lg p-4">
              <h4 className="font-medium text-grey-800 mb-3">Agencies to Export</h4>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-auto">
                {agenciesApi.data.map((a) => (
                  <div key={a.id} className="flex items-center space-x-3">
                    <Checkbox
                      id={`export-agency-${a.id}`}
                      checked={selectedAgencyIds.includes(a.id)}
                      onCheckedChange={(checked) => {
                        setSelectedAgencyIds((prev) => {
                          if (checked) return [...prev, a.id];
                          return prev.filter((id) => id !== a.id);
                        });
                      }}
                    />
                    <Label htmlFor={`export-agency-${a.id}`} className="text-sm text-grey-700">
                      {a.agencyName} ({a.agencyId})
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-grey-200">
              <div className="flex items-center text-sm text-grey-600">
                <Info className="text-primary-500 mr-2" size={16} />
                {exportFormat === "zip"
                  ? "Export will create a ZIP file with selected TXT files"
                  : exportFormat === "txt"
                    ? "Export will download individual TXT files separately"
                    : "Export will create a package with selected files"}
              </div>
              <Button
                onClick={handleExportValidated}
                disabled={
                  hasErrors ||
                  Object.values(includeFiles).every((v) => !v) ||
                  (includeFiles.agency && selectedAgencyIds.length === 0)
                }
                className="bg-primary-600 hover:bg-primary-700 text-lg px-8 py-3"
              >
                <Download className="w-5 h-5 mr-3" />
                {exportFormat === "txt" ? "Download TXT Files" : "Generate & Download Package"}
              </Button>
            </div>

            <Collapsible
              open={showFilePreview}
              onOpenChange={setShowFilePreview}
              className="pt-4 border-t border-grey-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-grey-800">Copy GTSS Files</h4>
                  <p className="text-xs text-grey-500">
                    Preview and copy file contents without downloading.
                  </p>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="h-8 px-3 text-xs">
                    <Eye className="w-3 h-3 mr-1" />
                    {showFilePreview ? "Hide Preview" : "View Preview"}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="mt-4">
                <GTSSFileViewer
                  files={previewFiles}
                  emptyMessage="Select at least one file to preview."
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
