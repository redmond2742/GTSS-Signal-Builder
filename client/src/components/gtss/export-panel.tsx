import { useState, useEffect } from "react";
import { useExport } from "@/lib/localStorageHooks";
import { generateAgencyCSV, generateSignalsCSV, generatePhasesCSV, generateDetectionCSV } from "@/lib/localStorage";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Download, CheckCircle, AlertTriangle, XCircle, Info, TrendingUp, Settings2, Target, ChevronDown, ChevronRight, Eye } from "lucide-react";
import { evaluateGTSSCompleteness } from "@/lib/gtssValidation";
import GTSSFileViewer, { GTSSFilePreview } from "@/components/gtss/gtss-file-viewer";

export default function ExportPanel() {
  const { agency, signals, phases, detectors } = useGTSSStore();
  
  // Generate default package name with agency name and date
  const getDefaultPackageName = () => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // yyyy-mm-dd format
    const agencyName = agency?.agencyName ? agency.agencyName.replace(/\s+/g, '_') : 'Export';
    return `GTSS_${agencyName}_${dateStr}`;
  };
  
  const [packageName, setPackageName] = useState(getDefaultPackageName());
  const [exportFormat, setExportFormat] = useState("zip");
  const [includeFiles, setIncludeFiles] = useState({
    agency: true,
    signals: true,
    phases: true,
    detection: true,
  });
  const { toast } = useToast();

  const { exportAsZip, exportAsIndividualFiles } = useExport();

  // Update package name when agency changes
  useEffect(() => {
    setPackageName(getDefaultPackageName());
  }, [agency?.agencyName]);

  const handleExport = async () => {
    try {
      if (exportFormat === "txt") {
        // Export as individual TXT files
        await exportAsIndividualFiles(includeFiles);
        const fileCount = Object.values(includeFiles).filter(Boolean).length;
        toast({
          title: "Success",
          description: `${fileCount} TXT file${fileCount > 1 ? 's' : ''} downloaded successfully`,
        });
      } else if (exportFormat === "zip") {
        // Export as ZIP file
        await exportAsZip(includeFiles);
        toast({
          title: "Success",
          description: "GTSS ZIP package exported successfully",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export GTSS package",
        variant: "destructive",
      });
    }
  };

  const getValidationStatus = () => {
    const issues = [];
    
    if (!agency) {
      issues.push({ type: "error", section: "Agency Information", message: "Agency information is required" });
    }
    
    if (signals.length === 0) {
      issues.push({ type: "warning", section: "Signal Locations", message: "No signals configured" });
    }
    
    // Validation checks for required signal data
    signals.forEach(signal => {
      if (!signal.latitude || !signal.longitude) {
        issues.push({ type: "error", section: "Signal Locations", message: `Missing coordinates for ${signal.signalId}` });
      }
      if (!signal.signalId) {
        issues.push({ type: "error", section: "Signal Locations", message: `Missing signal ID for signal` });
      }
      if (!signal.streetName1 || !signal.streetName2) {
        issues.push({ type: "warning", section: "Signal Locations", message: `Missing street names for ${signal.signalId}` });
      }
    });
    
    const signalIds = signals.map(s => s.signalId);
    const orphanPhases = phases.filter(p => !signalIds.includes(p.signalId));
    if (orphanPhases.length > 0) {
      issues.push({ type: "error", section: "Phases", message: `${orphanPhases.length} phases reference non-existent signals` });
    }
    
    const orphanDetectors = detectors.filter(d => !signalIds.includes(d.signalId));
    if (orphanDetectors.length > 0) {
      issues.push({ type: "error", section: "Detectors", message: `${orphanDetectors.length} detectors reference non-existent signals` });
    }
    
    return issues;
  };

  const validationIssues = getValidationStatus();
  const hasErrors = validationIssues.some(issue => issue.type === "error");
  
  // Get GTSS completeness analysis
  const completenessAnalysis = evaluateGTSSCompleteness(signals, phases, detectors);
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState(false);

  const previewFiles: GTSSFilePreview[] = [
    includeFiles.agency
      ? { id: "agency", label: "agency.txt", content: generateAgencyCSV(agency) }
      : null,
    includeFiles.signals
      ? { id: "signals", label: "signals.txt", content: generateSignalsCSV(signals) }
      : null,
    includeFiles.phases
      ? { id: "phases", label: "phases.txt", content: generatePhasesCSV(phases) }
      : null,
    includeFiles.detection
      ? { id: "detectors", label: "detectors.txt", content: generateDetectionCSV(detectors) }
      : null,
  ].filter(Boolean) as GTSSFilePreview[];

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
      {/* Validation Status */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200">
          <CardTitle className="text-lg font-semibold text-grey-800">Validation Status</CardTitle>
          <p className="text-sm text-grey-600">Review configuration before export</p>
        </CardHeader>
        <CardContent className="p-6">
          {/* Completeness Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-primary-50 border-primary-200">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5 text-primary-600" />
                  <div>
                    <p className="text-xs font-medium text-primary-700">Overall Completeness</p>
                    <p className="text-lg font-bold text-primary-800">{completenessAnalysis.overallCompleteness}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-success-50 border-success-200">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-success-600" />
                  <div>
                    <p className="text-xs font-medium text-success-700">Complete Signals</p>
                    <p className="text-lg font-bold text-success-800">{completenessAnalysis.completeSignals}/{completenessAnalysis.totalSignals}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-warning-50 border-warning-200">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-warning-600" />
                  <div>
                    <p className="text-xs font-medium text-warning-700">Partial Signals</p>
                    <p className="text-lg font-bold text-warning-800">{completenessAnalysis.partialSignals}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <div>
                    <p className="text-xs font-medium text-red-700">Incomplete Signals</p>
                    <p className="text-lg font-bold text-red-800">{completenessAnalysis.incompleteSignals}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Signal-by-Signal Analysis - Collapsible */}
          {completenessAnalysis.results.length > 0 && (
            <Collapsible open={isAnalysisExpanded} onOpenChange={setIsAnalysisExpanded} className="mb-6">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2 p-0 h-auto text-left">
                  {isAnalysisExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <h4 className="text-sm font-medium text-grey-700">Signal Completeness Analysis ({completenessAnalysis.results.length} signals)</h4>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="space-y-3">
                  {completenessAnalysis.results.map((result) => (
                    <Card key={result.signalId} className="border-grey-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <Badge 
                                variant={result.status === 'complete' ? 'default' : result.status === 'partial' ? 'secondary' : 'destructive'}
                                className="text-xs"
                              >
                                {result.status === 'complete' ? 'Complete' : result.status === 'partial' ? 'Partial' : 'Incomplete'}
                              </Badge>
                              <div>
                                <p className="text-sm font-medium text-grey-800">{result.signalId}</p>
                                <p className="text-xs text-grey-600">{result.street}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 mt-3">
                              <div className="flex items-center space-x-2">
                                <Settings2 className="w-4 h-4 text-grey-500" />
                                <div>
                                  <p className="text-xs text-grey-500">Phases</p>
                                  <p className="text-sm font-medium">{result.phaseCount}/8 ({result.phaseCompleteness})</p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Target className="w-4 h-4 text-grey-500" />
                                <div>
                                  <p className="text-xs text-grey-500">Detectors</p>
                                  <p className="text-sm font-medium">{result.detectorCount}/4 ({result.detectorCompleteness})</p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <TrendingUp className="w-4 h-4 text-grey-500" />
                                <div>
                                  <p className="text-xs text-grey-500">Overall</p>
                                  <p className="text-sm font-medium">{result.overallScore}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Basic Validation Issues */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {validationIssues.length === 0 ? (
              <div className="md:col-span-2 flex items-center space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="text-green-600 text-xl" />
                <div>
                  <p className="font-medium text-green-800">All Basic Validations Passed</p>
                  <p className="text-sm text-green-600">No structural issues detected</p>
                </div>
              </div>
            ) : (
              validationIssues.map((issue, index) => (
                <div key={index} className={`flex items-center space-x-3 p-4 rounded-lg border ${
                  issue.type === "error" 
                    ? "bg-red-50 border-red-200"
                    : "bg-amber-50 border-amber-200"
                }`}>
                  {issue.type === "error" ? (
                    <XCircle className="text-red-600 text-xl" />
                  ) : (
                    <AlertTriangle className="text-amber-600 text-xl" />
                  )}
                  <div>
                    <p className={`font-medium ${issue.type === "error" ? "text-red-800" : "text-amber-800"}`}>
                      {issue.section}
                    </p>
                    <p className={`text-sm ${issue.type === "error" ? "text-red-600" : "text-amber-600"}`}>
                      {issue.message}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Export Configuration */}
      <Card>
        <CardHeader className="bg-grey-50 border-b border-grey-200">
          <CardTitle className="text-lg font-semibold text-grey-800">Export Configuration</CardTitle>
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
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="agency"
                    checked={includeFiles.agency}
                    onCheckedChange={(checked) => 
                      setIncludeFiles(prev => ({ ...prev, agency: checked as boolean }))
                    }
                  />
                  <Label htmlFor="agency" className="text-sm text-grey-700">
                    agency.txt ({agency ? 1 : 0} record)
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="signals"
                    checked={includeFiles.signals}
                    onCheckedChange={(checked) => 
                      setIncludeFiles(prev => ({ ...prev, signals: checked as boolean }))
                    }
                  />
                  <Label htmlFor="signals" className="text-sm text-grey-700">
                    signals.txt ({signals.length} records)
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="phases"
                    checked={includeFiles.phases}
                    onCheckedChange={(checked) => 
                      setIncludeFiles(prev => ({ ...prev, phases: checked as boolean }))
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
                      setIncludeFiles(prev => ({ ...prev, detection: checked as boolean }))
                    }
                  />
                  <Label htmlFor="detection" className="text-sm text-grey-700">
                    detectors.txt ({detectors.length} records)
                  </Label>
                </div>
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
                disabled={hasErrors || Object.values(includeFiles).every(v => !v)}
                className="bg-primary-600 hover:bg-primary-700 text-lg px-8 py-3"
              >
                <Download className="w-5 h-5 mr-3" />
                {exportFormat === "txt" ? "Download TXT Files" : "Generate & Download Package"}
              </Button>
            </div>

            <Collapsible open={showFilePreview} onOpenChange={setShowFilePreview} className="pt-4 border-t border-grey-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-grey-800">Copy GTSS Files</h4>
                  <p className="text-xs text-grey-500">Preview and copy file contents without downloading.</p>
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
