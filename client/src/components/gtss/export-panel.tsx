import { useState } from "react";
import { useExport } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, CheckCircle, AlertTriangle, XCircle, Info } from "lucide-react";

export default function ExportPanel() {
  const [packageName, setPackageName] = useState("GTSS_Export_Package");
  const [exportFormat, setExportFormat] = useState("zip");
  const [includeFiles, setIncludeFiles] = useState({
    agency: true,
    signals: true,
    phases: true,
    detection: true,
  });
  
  const { agency, signals, phases, detectors } = useGTSSStore();
  const { toast } = useToast();

  const { exportAsZip } = useExport();

  const handleExport = async () => {
    try {
      await exportAsZip();
      toast({
        title: "Success",
        description: "GTSS package exported successfully",
      });
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
    
    signals.forEach(signal => {
      if (!signal.cabinetLat || !signal.cabinetLon) {
        issues.push({ type: "warning", section: "Signal Locations", message: `Missing cabinet coordinates for ${signal.signalId}` });
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {validationIssues.length === 0 ? (
              <div className="md:col-span-2 flex items-center space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="text-green-600 text-xl" />
                <div>
                  <p className="font-medium text-green-800">All Validations Passed</p>
                  <p className="text-sm text-green-600">Configuration is ready for export</p>
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
                    <SelectItem value="csv">Individual CSV Files</SelectItem>
                    <SelectItem value="json">JSON Configuration</SelectItem>
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
                    detection.txt ({detectors.length} records)
                  </Label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-grey-200">
              <div className="flex items-center text-sm text-grey-600">
                <Info className="text-primary-500 mr-2" size={16} />
                Export will create a ZIP file with CSV files following GTSS specification
              </div>
              <Button 
                onClick={handleExportValidated}
                disabled={hasErrors}
                className="bg-primary-600 hover:bg-primary-700 text-lg px-8 py-3"
              >
                <Download className="w-5 h-5 mr-3" />
                Generate & Download GTSS Package
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
