import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { parseAgencyTXT, parseSignalsTXT, parsePhasesTXT, parseDetectorsTXT, importData } from '@/lib/localStorage';
import { Agency, Signal, Phase, Detector } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
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

type FileData = {
  name: string;
  content: string;
  type: 'agency' | 'signals' | 'phases' | 'detectors' | 'unknown';
};

type ParsedData = {
  agency?: Agency | null;
  signals?: Signal[];
  phases?: Phase[];
  detectors?: Detector[];
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
  const { toast } = useToast();

  const detectFileType = (filename: string): 'agency' | 'signals' | 'phases' | 'detectors' | 'unknown' => {
    const lower = filename.toLowerCase();
    if (lower.includes('agency')) return 'agency';
    if (lower.includes('signal')) return 'signals';
    if (lower.includes('phase')) return 'phases';
    if (lower.includes('detector')) return 'detectors';
    return 'unknown';
  };

  const handleFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileDataArray: FileData[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.endsWith('.txt')) {
        const content = await file.text();
        fileDataArray.push({
          name: file.name,
          content,
          type: detectFileType(file.name),
        });
      }
    }

    setUploadedFiles(fileDataArray);
    parseFiles(fileDataArray);
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
          case 'phases':
            const phases = parsePhasesTXT(file.content);
            parsed.phases = phases;
            break;
          case 'detectors':
            const detectors = parseDetectorsTXT(file.content);
            parsed.detectors = detectors;
            break;
          case 'unknown':
            errors.push({ file: file.name, message: 'Could not determine file type from filename. File should contain "agency", "signal", "phase", or "detector" in the name.' });
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
        phases: parsedData.phases?.length || 0,
        detectors: parsedData.detectors?.length || 0,
      };

      toast({
        title: "Import Successful",
        description: `Imported: ${stats.agency} agency, ${stats.signals} signals, ${stats.phases} phases, ${stats.detectors} detectors`,
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

  const hasData = Object.keys(parsedData).length > 0;
  const hasErrors = validationErrors.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import GTSS Data</CardTitle>
        <CardDescription>
          Upload TXT files to import traffic signal data. Supports agency.txt, signals.txt, phases.txt, and detectors.txt files.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File Upload Area */}
        <div>
          <Label>Upload Files</Label>
          <div
            className={`mt-2 border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-gray-300'
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
                Drag and drop TXT files here, or click to browse
              </p>
              <input
                type="file"
                multiple
                accept=".txt"
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
                  Replace All Data - Clear existing data and import new data
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="merge" id="merge" data-testid="radio-merge" />
                <Label htmlFor="merge" className="font-normal cursor-pointer">
                  Merge with Existing - Keep existing data and add new items (skip duplicates)
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
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Import Button */}
        {hasData && !hasErrors && (
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setUploadedFiles([]);
                setParsedData({});
                setValidationErrors([]);
              }}
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
