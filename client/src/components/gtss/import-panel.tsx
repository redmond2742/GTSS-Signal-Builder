import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import MapTileLayers from "@/components/ui/map-tile-layers";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { CoordinationKey, LibraryEntry, ParsedCoordination } from "gtss";
import {
  COORDINATION_ENTITIES,
  detectCoordinationFile,
  isCoordinationEnabled,
  flattenLibraryEntries,
  getLibrarySourceUrls,
  isDemoEnabled,
  parseAgenciesTXT,
  parseApproachesTXT,
  parseBasicTimingsTXT,
  parseDetectorsTXT,
  parsePhasesTXT,
  parseSignalsTXT,
  useGTSSStore,
  useImportData,
} from "gtss";
import type { Agency, Approach, BasicTiming, Detector, Phase, Signal } from "gtss/schema";
import JSZip from "jszip";
import { AlertTriangle, CheckCircle, ClipboardPaste, FileText, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Rectangle, useMap } from "react-leaflet";
import { Checkbox } from "../ui/checkbox";

/** A coordination file is identified by its registry key. */
type FileKind =
  | "agency"
  | "signals"
  | "approaches"
  | "phases"
  | "detectors"
  | "basic_timings"
  | CoordinationKey
  | "unknown";

type FileData = {
  name: string;
  content: string;
  type: FileKind;
};

type ParsedData = {
  agency?: Agency | Agency[] | null;
  signals?: Signal[];
  approaches?: Approach[];
  phases?: Phase[];
  detectors?: Detector[];
  basicTimings?: BasicTiming[];
} & ParsedCoordination;

type ValidationError = {
  file: string;
  message: string;
};

function LibraryMap({ items }: { items: LibraryEntry[] }) {
  const map = useMap();
  const boxes = useMemo(
    () =>
      items
        .filter((item) => item.bounds)
        .map(
          (item) =>
            [
              [item.bounds!.min.lat, item.bounds!.min.lon],
              [item.bounds!.max.lat, item.bounds!.max.lon],
            ] as [[number, number], [number, number]],
        ),
    [items],
  );

  useEffect(() => {
    if (boxes.length === 0) return;
    const bounds = boxes.flat();
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [boxes, map]);

  return (
    <>
      {items
        .filter((item) => item.bounds)
        .map((item) => (
          <Rectangle
            key={item.id}
            bounds={[
              [item.bounds!.min.lat, item.bounds!.min.lon],
              [item.bounds!.max.lat, item.bounds!.max.lon],
            ]}
            pathOptions={{
              color: item.source === "testing" ? "#f59e0b" : "#2563eb",
              weight: 1.5,
              fillOpacity: 0.12,
            }}
          />
        ))}
    </>
  );
}

export function ImportPanel({ onImportComplete }: { onImportComplete?: () => void }) {
  const { agencyDefaults } = useGTSSStore();
  const showDemo = isDemoEnabled(agencyDefaults);
  const coordinationEnabled = isCoordinationEnabled(agencyDefaults);
  const { import: runImport } = useImportData();
  const [uploadedFiles, setUploadedFiles] = useState<FileData[]>([]);
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
  const [parsedData, setParsedData] = useState<ParsedData>({});
  const [selectedAgencyIds, setSelectedAgencyIds] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pasteContent, setPasteContent] = useState<string>("");
  const [pasteFileType, setPasteFileType] = useState<
    "agency" | "signals" | "approaches" | "phases" | "detectors" | "basic_timings"
  >("signals");
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [showLibraryImportDialog, setShowLibraryImportDialog] = useState(false);
  const [libraryDialogTitle, setLibraryDialogTitle] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const loadLibrary = async () => {
      setLibraryLoading(true);
      setLibraryError(null);

      try {
        const sources = getLibrarySourceUrls(showDemo);
        const entries: LibraryEntry[] = [];

        for (const source of sources) {
          const response = await fetch(source.url, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(
              `Unable to load ${source.label}: ${response.statusText || response.status}`,
            );
          }

          const payload = await response.json();
          entries.push(...flattenLibraryEntries(payload, source.id));
        }

        if (!cancelled) {
          setLibraryEntries(entries);
          setSelectedLibraryId(entries[0]?.id ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          setLibraryEntries([]);
          setSelectedLibraryId(null);
          setLibraryError(error instanceof Error ? error.message : "Unable to load GTSS library");
        }
      } finally {
        if (!cancelled) {
          setLibraryLoading(false);
        }
      }
    };

    void loadLibrary();
    return () => {
      cancelled = true;
    };
  }, [showDemo]);

  const detectFileType = (filename: string): FileKind => {
    const lower = filename.toLowerCase();
    // Registry first: the substring chain below would mis-claim three
    // coordination files ("signal" catches corridorSignals and PatternSignals,
    // "phase" catches PhaseSequence).
    const coordination = coordinationEnabled ? detectCoordinationFile(filename) : null;
    if (coordination) return coordination.key;
    if (lower.includes("agency")) return "agency";
    if (lower.includes("signal")) return "signals";
    if (lower.includes("approach")) return "approaches";
    if (lower.includes("phase")) return "phases";
    if (lower.includes("detector")) return "detectors";
    if (lower.includes("basic_timing") || lower.includes("timing")) return "basic_timings";
    return "unknown";
  };

  const handleFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileDataArray: FileData[] = [];
    const errors: ValidationError[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lower = file.name.toLowerCase();

      if (lower.endsWith(".zip")) {
        // Extract every .txt entry from the archive and treat each one as if
        // it had been uploaded individually.
        try {
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          let extracted = 0;
          for (const path of Object.keys(zip.files)) {
            const entry = zip.files[path];
            if (entry.dir) continue;
            if (!path.toLowerCase().endsWith(".txt")) continue;
            const content = await entry.async("string");
            const base = path.split("/").pop() || path;
            fileDataArray.push({ name: base, content, type: detectFileType(base) });
            extracted++;
          }
          if (extracted === 0) {
            errors.push({ file: file.name, message: "Zip contained no .txt GTSS files." });
          }
        } catch (err) {
          errors.push({
            file: file.name,
            message:
              err instanceof Error
                ? `Could not read zip: ${err.message}`
                : "Could not read zip file.",
          });
        }
      } else if (lower.endsWith(".txt")) {
        const content = await file.text();
        fileDataArray.push({
          name: file.name,
          content,
          type: detectFileType(file.name),
        });
      } else {
        errors.push({ file: file.name, message: "Unsupported file type — upload .txt or .zip." });
      }
    }

    setUploadedFiles(fileDataArray);
    parseFiles(fileDataArray);
    if (errors.length > 0) {
      // Surface zip-level errors alongside any per-file parse errors.
      setValidationErrors((prev) => [...prev, ...errors]);
    }
  };

  const parseFiles = (files: FileData[]) => {
    const parsed: ParsedData = {};
    const errors: ValidationError[] = [];

    files.forEach((file) => {
      try {
        switch (file.type) {
          case "agency": {
            const agencies = parseAgenciesTXT(file.content);
            if (agencies && agencies.length > 0) {
              if (!parsed.agency) parsed.agency = [];
              if (Array.isArray(parsed.agency)) parsed.agency.push(...agencies);
            }
            break;
          }
          case "signals": {
            const signals = parseSignalsTXT(file.content);
            parsed.signals = [...(parsed.signals || []), ...signals];
            break;
          }
          case "approaches": {
            const approaches = parseApproachesTXT(file.content);
            parsed.approaches = [...(parsed.approaches || []), ...approaches];
            break;
          }
          case "phases": {
            const phases = parsePhasesTXT(file.content);
            parsed.phases = [...(parsed.phases || []), ...phases];
            break;
          }
          case "detectors": {
            const detectors = parseDetectorsTXT(file.content);
            parsed.detectors = [...(parsed.detectors || []), ...detectors];
            break;
          }
          case "basic_timings": {
            const basicTimings = parseBasicTimingsTXT(file.content);
            parsed.basicTimings = [...(parsed.basicTimings || []), ...basicTimings];
            break;
          }
          default: {
            const entity = COORDINATION_ENTITIES.find((e) => e.key === file.type);
            if (entity) {
              entity.parseInto(file.content, parsed);
              break;
            }
            errors.push({
              file: file.name,
              message:
                'Could not determine file type from filename. File should contain "agency", "signal", "approach", "phase", "detector", or "timing" in the name.',
            });
            break;
          }
        }
      } catch (error) {
        errors.push({
          file: file.name,
          message: error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    });

    setParsedData(parsed);
    // Initialize selected agencies to all parsed agencies
    if (parsed.agency) {
      if (Array.isArray(parsed.agency)) setSelectedAgencyIds(parsed.agency.map((a) => a.id));
      else setSelectedAgencyIds([parsed.agency.id]);
    } else {
      setSelectedAgencyIds([]);
    }
    setValidationErrors(errors);
  };

  const handleImport = () => {
    try {
      // Safety: if an agency file was parsed but the user cleared all
      // agency checkboxes, treat this as a no-op and reject the import.
      if (parsedData.agency && selectedAgencyIds.length === 0) {
        toast({
          title: "No agencies selected",
          description:
            "You cleared every agency — import would overwrite existing data. Select at least one agency or cancel.",
          variant: "destructive",
        });
        setShowConfirmDialog(false);
        return;
      }
      // Build filtered payload based on selected agencies
      const selectedAgencies: Agency[] = [];
      if (parsedData.agency) {
        if (Array.isArray(parsedData.agency)) {
          for (const a of parsedData.agency) {
            if (selectedAgencyIds.includes(a.id)) selectedAgencies.push(a);
          }
        } else {
          // single parsed agency
          if (selectedAgencyIds.length === 0 || selectedAgencyIds.includes(parsedData.agency.id)) {
            selectedAgencies.push(parsedData.agency);
          }
        }
      }

      let filteredSignals: Signal[] = [];
      let filteredApproaches: Approach[] = [];
      let filteredPhases: Phase[] = [];
      let filteredDetectors: Detector[] = [];
      let filteredBasicTimings: BasicTiming[] = [];

      // Only cascade-filter by agency if agency data was parsed.
      if (parsedData.agency) {
        const allowedAgencyIds = selectedAgencies.map((a) => a.agencyId);
        filteredSignals = (parsedData.signals || []).filter((s) =>
          allowedAgencyIds.includes(s.agencyId),
        );
        const filteredSignalIds = filteredSignals.map((s) => s.signalId);
        filteredApproaches = (parsedData.approaches || []).filter((ap) =>
          filteredSignalIds.includes(ap.signalId),
        );
        filteredPhases = (parsedData.phases || []).filter((ph) =>
          filteredSignalIds.includes(ph.signalId),
        );
        filteredDetectors = (parsedData.detectors || []).filter((d) =>
          filteredSignalIds.includes(d.signalId),
        );
        filteredBasicTimings = (parsedData.basicTimings || []).filter((bt) =>
          filteredSignalIds.includes(bt.signalId),
        );
      } else {
        // No agency file present — preserve parsed arrays as-is
        filteredSignals = parsedData.signals || [];
        filteredApproaches = parsedData.approaches || [];
        filteredPhases = parsedData.phases || [];
        filteredDetectors = parsedData.detectors || [];
        filteredBasicTimings = parsedData.basicTimings || [];
      }

      const payload: ParsedData = {};

      // Only include fields that were actually parsed from uploaded files.
      if (parsedData.agency) {
        payload.agency =
          selectedAgencies.length === 0
            ? null
            : selectedAgencies.length === 1
              ? selectedAgencies[0]
              : selectedAgencies;
      }
      if (parsedData.signals) payload.signals = filteredSignals;
      if (parsedData.approaches) payload.approaches = filteredApproaches;
      if (parsedData.phases) payload.phases = filteredPhases;
      if (parsedData.detectors) payload.detectors = filteredDetectors;
      if (parsedData.basicTimings) payload.basicTimings = filteredBasicTimings;

      COORDINATION_ENTITIES.forEach((entity) => {
        const rows = parsedData[entity.key];
        if (rows !== undefined) {
          (payload as ParsedCoordination)[entity.key] = rows as never;
        }
      });

      runImport(payload, importMode);
      const stats = {
        agency: selectedAgencies.length,
        signals: filteredSignals.length,
        approaches: filteredApproaches.length,
        phases: filteredPhases.length,
        detectors: filteredDetectors.length,
        basicTimings: filteredBasicTimings.length,
        coordination: COORDINATION_ENTITIES.reduce(
          (sum, entity) => sum + entity.countIn(parsedData),
          0,
        ),
      };

      const importedItems = [
        stats.agency > 0 ? `${stats.agency} agency` : null,
        stats.signals > 0 ? `${stats.signals} signals` : null,
        stats.approaches > 0 ? `${stats.approaches} approaches` : null,
        stats.phases > 0 ? `${stats.phases} phases` : null,
        stats.detectors > 0 ? `${stats.detectors} detectors` : null,
        stats.basicTimings > 0 ? `${stats.basicTimings} timings` : null,
        stats.coordination > 0 ? `${stats.coordination} coordination rows` : null,
      ]
        .filter(Boolean)
        .join(", ");

      toast({
        title: "Import Successful",
        description: `Imported: ${importedItems}`,
      });

      // Reset state
      setUploadedFiles([]);
      setParsedData({});
      setValidationErrors([]);
      setShowConfirmDialog(false);

      // Notify parent to refresh data
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (error) {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files);
    }
  };

  const handlePasteData = () => {
    if (!pasteContent.trim()) return;

    const fileData: FileData = {
      name: `pasted_${pasteFileType}.txt`,
      content: pasteContent,
      type: pasteFileType,
    };

    setUploadedFiles([fileData]);
    parseFiles([fileData]);
  };

  const clearAll = () => {
    setUploadedFiles([]);
    setParsedData({});
    setValidationErrors([]);
    setPasteContent("");
  };

  const importLibraryEntry = async (item: LibraryEntry) => {
    try {
      const response = await fetch(item.url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Unable to load ${item.title}: ${response.statusText || response.status}`);
      }

      const zip = await JSZip.loadAsync(await response.blob());
      const fileDataArray: FileData[] = [];

      for (const path of Object.keys(zip.files)) {
        const entry = zip.files[path];
        if (entry.dir || !path.toLowerCase().endsWith(".txt")) continue;
        const content = await entry.async("string");
        const base = path.split("/").pop() || path;
        fileDataArray.push({ name: base, content, type: detectFileType(base) });
      }

      if (fileDataArray.length === 0) {
        throw new Error(`No GTSS TXT files were found in ${item.title}.`);
      }

      setUploadedFiles(fileDataArray);
      parseFiles(fileDataArray);
      setSelectedLibraryId(item.id);
      setLibraryDialogTitle(item.title);
      setShowLibraryImportDialog(true);
      toast({
        title: "Library item prepared",
        description: `${item.title} is ready for import. Review the details and confirm below.`,
      });
    } catch (error) {
      toast({
        title: "Library import failed",
        description: error instanceof Error ? error.message : "Unable to import this library item.",
        variant: "destructive",
      });
    }
  };

  const hasData = Object.keys(parsedData).length > 0;
  const hasErrors = validationErrors.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import GTSS Data</CardTitle>
        <CardDescription>
          Upload TXT files or a ZIP of GTSS files to import traffic signal data. Supports
          agency.txt, signals.txt, approaches.txt, phases.txt, detectors.txt, and basic_timings.txt
          files (the same files produced by Export).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="library" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="library" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Library
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Files
            </TabsTrigger>
            <TabsTrigger value="paste" className="flex items-center gap-2">
              <ClipboardPaste className="h-4 w-4" />
              Paste Data
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4">
            {/* File Upload Area */}
            <div>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive ? "border-primary bg-primary/5" : "border-gray-300"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                data-testid="import-dropzone"
              >
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Drag and drop <span className="font-medium">.txt</span> or{" "}
                    <span className="font-medium">.zip</span> files here, or click to browse
                  </p>
                  <input
                    type="file"
                    multiple
                    accept=".txt,.zip,application/zip,application/x-zip-compressed"
                    onChange={(e) => handleFileChange(e.target.files)}
                    className="hidden"
                    id="file-upload"
                    data-testid="input-file-upload"
                  />
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById("file-upload")?.click()}
                    data-testid="button-browse-files"
                  >
                    Browse Files
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="paste" className="mt-4 space-y-4">
            {/* File Type Selector */}
            <div>
              <Label>Data Type</Label>
              <Select
                value={pasteFileType}
                onValueChange={(value) => setPasteFileType(value as typeof pasteFileType)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select data type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agency">Agency</SelectItem>
                  <SelectItem value="signals">Signals</SelectItem>
                  <SelectItem value="approaches">Approaches</SelectItem>
                  <SelectItem value="phases">Phases</SelectItem>
                  <SelectItem value="detectors">Detectors</SelectItem>
                  <SelectItem value="basic_timings">Basic Timings</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Paste Area */}
            <div>
              <Label>Paste File Contents</Label>
              <Textarea
                placeholder="Paste the contents of a TXT file here (CSV format with header row)..."
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                className="mt-1 min-h-[200px] font-mono text-sm"
              />
            </div>

            {/* Parse Button */}
            <Button onClick={handlePasteData} disabled={!pasteContent.trim()} className="w-full">
              Parse Pasted Data
            </Button>
          </TabsContent>

          <TabsContent value="library" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="library-map-container h-[300px] overflow-hidden rounded-md border bg-slate-50">
                {libraryLoading && (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Loading library catalog…
                  </div>
                )}
                {!libraryLoading && libraryError && (
                  <div className="flex h-full items-center justify-center px-4 text-sm text-red-600">
                    {libraryError}
                  </div>
                )}
                {!libraryLoading && !libraryError && libraryEntries.length > 0 && (
                  <MapContainer
                    center={[40.7, -73.9]}
                    zoom={9}
                    scrollWheelZoom={false}
                    className="h-full w-full"
                  >
                    <MapTileLayers />
                    <LibraryMap items={libraryEntries} />
                  </MapContainer>
                )}
                {!libraryLoading && !libraryError && libraryEntries.length === 0 && (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    No library entries are available.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {libraryEntries.length > 0 ? (
                  libraryEntries.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        selectedLibraryId === item.id ? "border-primary bg-primary/5" : "bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{item.title}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                                item.source === "testing"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {item.source}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item["owner-email"] || "GTSS"}
                            {item["date-added"]
                              ? ` • ${new Date(item["date-added"]).toLocaleDateString()}`
                              : ""}
                          </div>
                        </div>
                        <Button
                          variant={selectedLibraryId === item.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => void importLibraryEntry(item)}
                        >
                          Import
                        </Button>
                      </div>
                      {item.bounds && (
                        <div className="mt-2 text-[11px] text-slate-500">
                          Bounds: {item.bounds.min.lat.toFixed(4)}, {item.bounds.min.lon.toFixed(4)}{" "}
                          to {item.bounds.max.lat.toFixed(4)}, {item.bounds.max.lon.toFixed(4)}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
                    Library list is empty.
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={showLibraryImportDialog} onOpenChange={setShowLibraryImportDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Import library item: {libraryDialogTitle ?? "GTSS data"}</DialogTitle>
              <DialogDescription>
                Review the parsed files, choose the import mode, and confirm the import.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-2">
              {parsedData.agency && Array.isArray(parsedData.agency) && (
                <div>
                  <Label>Agencies Found</Label>
                  <div className="mt-2 space-y-2 max-h-48 overflow-auto p-2 border rounded bg-gray-50">
                    {parsedData.agency.map((a) => (
                      <div key={a.id} className="flex items-center space-x-3">
                        <Checkbox
                          id={`library-import-agency-${a.id}`}
                          checked={selectedAgencyIds.includes(a.id)}
                          onCheckedChange={(checked) => {
                            setSelectedAgencyIds((prev) => {
                              if (checked) return Array.from(new Set([...prev, a.id]));
                              return prev.filter((id) => id !== a.id);
                            });
                          }}
                        />
                        <Label htmlFor={`library-import-agency-${a.id}`} className="text-sm">
                          {a.agencyName} ({a.agencyId})
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uploadedFiles.length > 0 && (
                <div>
                  <Label>Uploaded Files</Label>
                  <div className="mt-2 space-y-2">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded"
                      >
                        <FileText className="h-4 w-4 text-blue-500" />
                        <span className="flex-1">{file.name}</span>
                        <span className="text-xs text-gray-500 capitalize">{file.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasData && (
                <div>
                  <Label>Import Mode</Label>
                  <RadioGroup
                    value={importMode}
                    onValueChange={(value) => setImportMode(value as "replace" | "merge")}
                    className="mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="replace" id="library-replace" />
                      <Label htmlFor="library-replace" className="font-normal cursor-pointer">
                        <span className="font-semibold">Overwrite existing</span> — clear current
                        data, then import what's in the file(s)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="merge" id="library-merge" />
                      <Label htmlFor="library-merge" className="font-normal cursor-pointer">
                        <span className="font-semibold">Append to existing</span> — keep current
                        data and add new items (skips duplicates)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {hasErrors && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-semibold mb-2">Validation Errors:</div>
                    <ul className="list-disc list-inside space-y-1">
                      {validationErrors.map((error, index) => (
                        <li key={index} className="text-sm" data-testid={`error-${index}`}>
                          <strong>{error.file}:</strong> {error.message}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {hasData && !hasErrors && (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <div className="font-semibold mb-2">Ready to Import:</div>
                    <ul className="space-y-1 text-sm">
                      {parsedData.agency && (
                        <li data-testid="preview-agency">
                          ✓ Agencies:{" "}
                          {Array.isArray(parsedData.agency) ? parsedData.agency.length : 1}
                        </li>
                      )}
                      {parsedData.signals && parsedData.signals.length > 0 && (
                        <li data-testid="preview-signals">
                          ✓ {parsedData.signals.length} Signal
                          {parsedData.signals.length !== 1 ? "s" : ""}
                        </li>
                      )}
                      {parsedData.approaches && parsedData.approaches.length > 0 && (
                        <li data-testid="preview-approaches">
                          ✓ {parsedData.approaches.length} Approach
                          {parsedData.approaches.length !== 1 ? "es" : ""}
                        </li>
                      )}
                      {parsedData.phases && parsedData.phases.length > 0 && (
                        <li data-testid="preview-phases">
                          ✓ {parsedData.phases.length} Phase
                          {parsedData.phases.length !== 1 ? "s" : ""}
                        </li>
                      )}
                      {parsedData.detectors && parsedData.detectors.length > 0 && (
                        <li data-testid="preview-detectors">
                          ✓ {parsedData.detectors.length} Detector
                          {parsedData.detectors.length !== 1 ? "s" : ""}
                        </li>
                      )}
                      {parsedData.basicTimings && parsedData.basicTimings.length > 0 && (
                        <li data-testid="preview-basicTimings">
                          ✓ {parsedData.basicTimings.length} Basic Timing
                          {parsedData.basicTimings.length !== 1 ? "s" : ""}
                        </li>
                      )}
                      {COORDINATION_ENTITIES.map((entity) => {
                        const n = entity.countIn(parsedData);
                        return n > 0 ? (
                          <li key={entity.key} data-testid={`preview-${entity.key}`}>
                            ✓ {n} {entity.label}
                          </li>
                        ) : null;
                      })}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLibraryImportDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (parsedData.agency && selectedAgencyIds.length === 0) {
                    toast({
                      title: "No agencies selected",
                      description: "Select at least one agency to import or cancel.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setShowLibraryImportDialog(false);
                  setShowConfirmDialog(true);
                }}
                disabled={!!parsedData.agency && selectedAgencyIds.length === 0}
              >
                Import Data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Agencies Selection (when multiple agency files parsed) */}
        {parsedData.agency && Array.isArray(parsedData.agency) && (
          <div>
            <Label>Agencies Found</Label>
            <div className="mt-2 space-y-2 max-h-48 overflow-auto p-2 border rounded bg-gray-50">
              {parsedData.agency.map((a) => (
                <div key={a.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={`import-agency-${a.id}`}
                    checked={selectedAgencyIds.includes(a.id)}
                    onCheckedChange={(checked) => {
                      setSelectedAgencyIds((prev) => {
                        if (checked) return Array.from(new Set([...prev, a.id]));
                        return prev.filter((id) => id !== a.id);
                      });
                    }}
                  />
                  <Label htmlFor={`import-agency-${a.id}`} className="text-sm">
                    {a.agencyName} ({a.agencyId})
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div>
            <Label>Uploaded Files</Label>
            <div className="mt-2 space-y-2">
              {uploadedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded"
                  data-testid={`file-item-${index}`}
                >
                  <FileText className="h-4 w-4 text-blue-500" />
                  <span className="flex-1">{file.name}</span>
                  <span className="text-xs text-gray-500 capitalize">{file.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Import Mode Selector */}
        {hasData && (
          <div>
            <Label>Import Mode</Label>
            <RadioGroup
              value={importMode}
              onValueChange={(value) => setImportMode(value as "replace" | "merge")}
              className="mt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="replace" id="replace" data-testid="radio-replace" />
                <Label htmlFor="replace" className="font-normal cursor-pointer">
                  <span className="font-semibold">Overwrite existing</span> — clear current data,
                  then import what's in the file(s)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="merge" id="merge" data-testid="radio-merge" />
                <Label htmlFor="merge" className="font-normal cursor-pointer">
                  <span className="font-semibold">Append to existing</span> — keep current data and
                  add new items (skips duplicates)
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Validation Errors */}
        {hasErrors && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold mb-2">Validation Errors:</div>
              <ul className="list-disc list-inside space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index} className="text-sm" data-testid={`error-${index}`}>
                    <strong>{error.file}:</strong> {error.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Import Preview */}
        {hasData && !hasErrors && (
          <Alert>
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription>
              <div className="font-semibold mb-2">Ready to Import:</div>
              <ul className="space-y-1 text-sm">
                {parsedData.agency && (
                  <li data-testid="preview-agency">
                    ✓ Agencies: {Array.isArray(parsedData.agency) ? parsedData.agency.length : 1}
                  </li>
                )}
                {parsedData.signals && parsedData.signals.length > 0 && (
                  <li data-testid="preview-signals">
                    ✓ {parsedData.signals.length} Signal{parsedData.signals.length !== 1 ? "s" : ""}
                  </li>
                )}
                {parsedData.approaches && parsedData.approaches.length > 0 && (
                  <li data-testid="preview-approaches">
                    ✓ {parsedData.approaches.length} Approach
                    {parsedData.approaches.length !== 1 ? "es" : ""}
                  </li>
                )}
                {parsedData.phases && parsedData.phases.length > 0 && (
                  <li data-testid="preview-phases">
                    ✓ {parsedData.phases.length} Phase{parsedData.phases.length !== 1 ? "s" : ""}
                  </li>
                )}
                {parsedData.detectors && parsedData.detectors.length > 0 && (
                  <li data-testid="preview-detectors">
                    ✓ {parsedData.detectors.length} Detector
                    {parsedData.detectors.length !== 1 ? "s" : ""}
                  </li>
                )}
                {parsedData.basicTimings && parsedData.basicTimings.length > 0 && (
                  <li data-testid="preview-basicTimings">
                    ✓ {parsedData.basicTimings.length} Basic Timing
                    {parsedData.basicTimings.length !== 1 ? "s" : ""}
                  </li>
                )}
                {COORDINATION_ENTITIES.map((entity) => {
                  const n = entity.countIn(parsedData);
                  return n > 0 ? (
                    <li key={entity.key} data-testid={`preview-${entity.key}`}>
                      ✓ {n} {entity.label}
                    </li>
                  ) : null;
                })}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Import Button */}
        {hasData && !hasErrors && (
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={clearAll} data-testid="button-cancel-import">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (parsedData.agency && selectedAgencyIds.length === 0) {
                  toast({
                    title: "No agencies selected",
                    description: "Select at least one agency to import or cancel.",
                    variant: "destructive",
                  });
                  return;
                }
                setShowConfirmDialog(true);
              }}
              data-testid="button-import-data"
              disabled={!!parsedData.agency && selectedAgencyIds.length === 0}
            >
              Import Data
            </Button>
          </div>
        )}

        {/* Confirmation Dialog */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent data-testid="dialog-import-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Import</AlertDialogTitle>
              <AlertDialogDescription>
                {importMode === "replace" ? (
                  <>
                    <strong className="text-destructive">Warning:</strong> This will replace all
                    existing data with the imported data. This action cannot be undone.
                  </>
                ) : (
                  <>
                    This will merge the imported data with your existing data. Duplicate entries
                    will be skipped.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-confirm">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleImport} data-testid="button-confirm-import">
                {importMode === "replace" ? "Replace All Data" : "Merge Data"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
