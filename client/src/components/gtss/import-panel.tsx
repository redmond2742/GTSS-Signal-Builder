import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Agency, Approach, BasicTiming, Detector, Phase, Signal } from '@shared/schema';
import { importData, parseAgencyTXT, parseApproachesTXT, parseBasicTimingsTXT, parseDetectorsTXT, parsePhasesTXT, parseSignalsTXT } from 'gtss';
import JSZip from 'jszip';
import { AlertTriangle, CheckCircle, ClipboardPaste, FileText, Upload } from 'lucide-react';
import { useState } from 'react';

type FileData = {
  name: string;
  content: string;
  type: 'agency' | 'signals' | 'approaches' | 'phases' | 'detectors' | 'basic_timings' | 'unknown';
};

type ParsedData = {
  agency?: Agency | null;
  signals?: Signal[];
  approaches?: Approach[];
  phases?: Phase[];
  detectors?: Detector[];
  basicTimings?: BasicTiming[];
};

type ValidationError = {
  file: string;
  message: string;
};

export function ImportPanel({ onImportComplete }: { onImportComplete?: () => void }) {
  const [uploadedFiles, setUploadedFiles] = useState<FileData[]>([]);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [parsedData, setParsedData] = useState<ParsedData>({});
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pasteContent, setPasteContent] = useState<string>("");
  const [pasteFileType, setPasteFileType] = useState<'agency' | 'signals' | 'approaches' | 'phases' | 'detectors' | 'basic_timings'>('signals');
  const { toast } = useToast();

  const detectFileType = (filename: string): 'agency' | 'signals' | 'approaches' | 'phases' | 'detectors' | 'basic_timings' | 'unknown' => {
    const lower = filename.toLowerCase();
    if (lower.includes('agency')) return 'agency';
    if (lower.includes('signal')) return 'signals';
    if (lower.includes('approach')) return 'approaches';
    if (lower.includes('phase')) return 'phases';
    if (lower.includes('detector')) return 'detectors';
    if (lower.includes('basic_timing') || lower.includes('timing')) return 'basic_timings';
    return 'unknown';
  };

  const handleFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileDataArray: FileData[] = [];
    const errors: ValidationError[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lower = file.name.toLowerCase();

      if (lower.endsWith('.zip')) {
        // Extract every .txt entry from the archive and treat each one as if
        // it had been uploaded individually.
        try {
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          let extracted = 0;
          for (const path of Object.keys(zip.files)) {
            const entry = zip.files[path];
            if (entry.dir) continue;
            if (!path.toLowerCase().endsWith('.txt')) continue;
            const content = await entry.async('string');
            const base = path.split('/').pop() || path;
            fileDataArray.push({ name: base, content, type: detectFileType(base) });
            extracted++;
          }
          if (extracted === 0) {
            errors.push({ file: file.name, message: 'Zip contained no .txt GTSS files.' });
          }
        } catch (err) {
          errors.push({
            file: file.name,
            message: err instanceof Error ? `Could not read zip: ${err.message}` : 'Could not read zip file.',
          });
        }
      } else if (lower.endsWith('.txt')) {
        const content = await file.text();
        fileDataArray.push({
          name: file.name,
          content,
          type: detectFileType(file.name),
        });
      } else {
        errors.push({ file: file.name, message: 'Unsupported file type — upload .txt or .zip.' });
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

    files.forEach(file => {
      try {
        switch (file.type) {
          case 'agency':
            const agency = parseAgencyTXT(file.content);
            if (agency) {
              parsed.agency = agency;
            }
            break;
          case 'signals':
            const signals = parseSignalsTXT(file.content);
            parsed.signals = signals;
            break;
          case 'approaches':
            const approaches = parseApproachesTXT(file.content);
            parsed.approaches = approaches;
            break;
          case 'phases':
            const phases = parsePhasesTXT(file.content);
            parsed.phases = phases;
            break;
          case 'detectors':
            const detectors = parseDetectorsTXT(file.content);
            parsed.detectors = detectors;
            break;
          case 'basic_timings':
            const basicTimings = parseBasicTimingsTXT(file.content);
            parsed.basicTimings = basicTimings;
            break;
          case 'unknown':
            errors.push({ file: file.name, message: 'Could not determine file type from filename. File should contain "agency", "signal", "approach", "phase", "detector", or "timing" in the name.' });
            break;
        }
      } catch (error) {
        errors.push({
          file: file.name,
          message: error instanceof Error ? error.message : 'Unknown error occurred'
        });
      }
    });

    setParsedData(parsed);
    setValidationErrors(errors);
  };

  const handleImport = () => {
    try {
      importData(parsedData, importMode);

      const stats = {
        agency: parsedData.agency ? 1 : 0,
        signals: parsedData.signals?.length || 0,
        approaches: parsedData.approaches?.length || 0,
        phases: parsedData.phases?.length || 0,
        detectors: parsedData.detectors?.length || 0,
        basicTimings: parsedData.basicTimings?.length || 0,
      };

      const importedItems = [
        stats.agency > 0 ? `${stats.agency} agency` : null,
        stats.signals > 0 ? `${stats.signals} signals` : null,
        stats.approaches > 0 ? `${stats.approaches} approaches` : null,
        stats.phases > 0 ? `${stats.phases} phases` : null,
        stats.detectors > 0 ? `${stats.detectors} detectors` : null,
        stats.basicTimings > 0 ? `${stats.basicTimings} timings` : null,
      ].filter(Boolean).join(', ');

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

      // Reload the page to refresh all data
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
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

  const hasData = Object.keys(parsedData).length > 0;
  const hasErrors = validationErrors.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import GTSS Data</CardTitle>
        <CardDescription>
          Upload TXT files or a ZIP of GTSS files to import traffic signal data. Supports agency.txt, signals.txt, approaches.txt, phases.txt, detectors.txt, and basic_timings.txt files (the same files produced by Export).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
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
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive ? 'border-primary bg-primary/5' : 'border-gray-300'
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
                    Drag and drop <span className="font-medium">.txt</span> or <span className="font-medium">.zip</span> files here, or click to browse
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
                    onClick={() => document.getElementById('file-upload')?.click()}
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
              <Select value={pasteFileType} onValueChange={(value) => setPasteFileType(value as typeof pasteFileType)}>
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
            <Button
              onClick={handlePasteData}
              disabled={!pasteContent.trim()}
              className="w-full"
            >
              Parse Pasted Data
            </Button>
          </TabsContent>
        </Tabs>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div>
            <Label>Uploaded Files</Label>
            <div className="mt-2 space-y-2">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded" data-testid={`file-item-${index}`}>
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
            <RadioGroup value={importMode} onValueChange={(value) => setImportMode(value as 'replace' | 'merge')} className="mt-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="replace" id="replace" data-testid="radio-replace" />
                <Label htmlFor="replace" className="font-normal cursor-pointer">
                  <span className="font-semibold">Overwrite existing</span> — clear current data, then import what's in the file(s)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="merge" id="merge" data-testid="radio-merge" />
                <Label htmlFor="merge" className="font-normal cursor-pointer">
                  <span className="font-semibold">Append to existing</span> — keep current data and add new items (skips duplicates)
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
                    ✓ Agency: {parsedData.agency.agencyName}
                  </li>
                )}
                {parsedData.signals && parsedData.signals.length > 0 && (
                  <li data-testid="preview-signals">
                    ✓ {parsedData.signals.length} Signal{parsedData.signals.length !== 1 ? 's' : ''}
                  </li>
                )}
                {parsedData.approaches && parsedData.approaches.length > 0 && (
                  <li data-testid="preview-approaches">
                    ✓ {parsedData.approaches.length} Approach{parsedData.approaches.length !== 1 ? 'es' : ''}
                  </li>
                )}
                {parsedData.phases && parsedData.phases.length > 0 && (
                  <li data-testid="preview-phases">
                    ✓ {parsedData.phases.length} Phase{parsedData.phases.length !== 1 ? 's' : ''}
                  </li>
                )}
                {parsedData.detectors && parsedData.detectors.length > 0 && (
                  <li data-testid="preview-detectors">
                    ✓ {parsedData.detectors.length} Detector{parsedData.detectors.length !== 1 ? 's' : ''}
                  </li>
                )}
                {parsedData.basicTimings && parsedData.basicTimings.length > 0 && (
                  <li data-testid="preview-basicTimings">
                    ✓ {parsedData.basicTimings.length} Basic Timing{parsedData.basicTimings.length !== 1 ? 's' : ''}
                  </li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Import Button */}
        {hasData && !hasErrors && (
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={clearAll}
              data-testid="button-cancel-import"
            >
              Cancel
            </Button>
            <Button
              onClick={() => setShowConfirmDialog(true)}
              data-testid="button-import-data"
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
                {importMode === 'replace' ? (
                  <>
                    <strong className="text-destructive">Warning:</strong> This will replace all existing data with the imported data.
                    This action cannot be undone.
                  </>
                ) : (
                  <>
                    This will merge the imported data with your existing data. Duplicate entries will be skipped.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-confirm">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleImport} data-testid="button-confirm-import">
                {importMode === 'replace' ? 'Replace All Data' : 'Merge Data'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
