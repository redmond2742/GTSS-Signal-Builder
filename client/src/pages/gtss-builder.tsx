import { useState } from "react";
import { useLoadFromStorage } from "@/lib/localStorageHooks";
import { TrafficCone, Building, MapPin, ArrowUpDown, Target, FolderOutput, FolderInput, Navigation, Plus, Coffee, Trash2, Menu, X, ExternalLink, Compass, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import AgencyForm from "@/components/gtss/agency-form";
import SignalsTable from "@/components/gtss/signals-table";
import ApproachesTable from "@/components/gtss/approaches-table";
import PhasesTable from "@/components/gtss/phases-table";
import DetectorsTable from "@/components/gtss/detectors-table";
import BasicTimingsTable from "@/components/gtss/basic-timings-table";
import ExportPanel from "@/components/gtss/export-panel";
import { ImportPanel } from "@/components/gtss/import-panel";
import SignalDetails from "@/pages/signal-details";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { clearAllData } from "@/lib/localStorage";
import { cn } from "@/lib/utils";

type TabType = "agency" | "signals" | "approaches" | "phases" | "detectors" | "basic-timings";

const tabs = [
  { id: "signals", label: "Traffic Signals", icon: MapPin },
  { id: "approaches", label: "Approaches", icon: Compass },
  { id: "phases", label: "Phases", icon: ArrowUpDown },
  { id: "basic-timings", label: "Basic Timings", icon: Clock },
  { id: "detectors", label: "Detectors", icon: Target },
  { id: "agency", label: "Agency Info", icon: Building },
];

const tabTitles: Record<TabType, { title: string; desc: string }> = {
  agency: { title: "Agency Information", desc: "Configure your traffic management agency details" },
  signals: { title: "Traffic Signals", desc: "Manage traffic signal installation locations" },
  approaches: { title: "Approaches", desc: "Configure approach directions and speeds for each signal" },
  phases: { title: "Signal Phases", desc: "Configure movement phases for each signal" },
  "basic-timings": { title: "Basic Timings", desc: "Configure timing parameters for each phase" },
  detectors: { title: "Detection Systems", desc: "Configure vehicle and pedestrian detection equipment" },
};

export default function GTSSBuilder() {
  const [activeTab, setActiveTab] = useState<TabType>("signals");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const { signals, approaches, phases, detectors, basicTimings, currentView, setAgency, setSignals, setApproaches, setPhases, setDetectors, setBasicTimings, navigateToSignalDetails } = useGTSSStore();
  const { toast } = useToast();

  // Load data from localStorage on mount
  useLoadFromStorage();

  const getCounts = () => ({
    signals: signals.length,
    approaches: approaches.length,
    phases: phases.length,
    detectors: detectors.length,
    "basic-timings": basicTimings.length,
  });

  const counts = getCounts();

  const [triggerAdd, setTriggerAdd] = useState(0);
  const [triggerBulk, setTriggerBulk] = useState(0);
  const [triggerAddApproach, setTriggerAddApproach] = useState(0);
  const [triggerBulkApproach, setTriggerBulkApproach] = useState(0);
  const [triggerAddPhase, setTriggerAddPhase] = useState(0);
  const [triggerBulkPhase, setTriggerBulkPhase] = useState(0);
  const [triggerAddDetector, setTriggerAddDetector] = useState(0);
  const [triggerAddBasicTiming, setTriggerAddBasicTiming] = useState(0);

  const renderTabContent = () => {
    // If export panel is shown, render it regardless of active tab
    if (showExportPanel) {
      return <ExportPanel />;
    }

    // If import panel is shown, render it regardless of active tab
    if (showImportPanel) {
      return <ImportPanel onImportComplete={() => window.location.reload()} />;
    }

    switch (activeTab) {
      case "agency":
        return <AgencyForm />;
      case "signals":
        return <SignalsTable triggerAdd={triggerAdd} triggerBulk={triggerBulk} />;
      case "approaches":
        return <ApproachesTable triggerAdd={triggerAddApproach} triggerBulk={triggerBulkApproach} />;
      case "phases":
        return <PhasesTable triggerAdd={triggerAddPhase} triggerBulk={triggerBulkPhase} />;
      case "basic-timings":
        return <BasicTimingsTable triggerAdd={triggerAddBasicTiming} />;
      case "detectors":
        return <DetectorsTable triggerAdd={triggerAddDetector} />;
      default:
        return <AgencyForm />;
    }
  };

  const handleAddSignal = () => {
    // Navigate to signal details view for new signal creation
    navigateToSignalDetails(null);
  };

  const handleAddMultiple = () => {
    setTriggerBulk(prev => prev + 1);
  };

  const handleAddApproach = () => {
    setTriggerAddApproach(prev => prev + 1);
  };

  const handleAddPhase = () => {
    setTriggerAddPhase(prev => prev + 1);
  };

  const handleAddDetector = () => {
    setTriggerAddDetector(prev => prev + 1);
  };

  const handleAddBasicTiming = () => {
    setTriggerAddBasicTiming(prev => prev + 1);
  };

  const handleClearAllData = () => {
    clearAllData();
    // Reset store to empty state
    setAgency(null);
    setSignals([]);
    setApproaches([]);
    setPhases([]);
    setDetectors([]);
    setBasicTimings([]);

    toast({
      title: "Data Cleared",
      description: "All signal, approach, phase, detector, timing, and agency data has been cleared",
    });
  };

  // Conditionally render signal details view or main view
  if (currentView === 'signal-details') {
    return <SignalDetails />;
  }

  return (
    <div className="h-screen flex bg-grey-50">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "w-56 bg-white shadow-lg border-r border-grey-200 flex flex-col h-full transition-transform duration-300 z-50",
        "fixed lg:static inset-y-0 left-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Header */}
        <div className="p-3 border-b border-grey-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <TrafficCone className="text-white" size={16} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-grey-800">GTSS Builder</h1>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 overflow-y-auto">
          <div className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const count = counts[tab.id as keyof typeof counts] || 0;

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setTriggerAdd(0);
                    setTriggerBulk(0);
                    setTriggerAddApproach(0);
                    setTriggerBulkApproach(0);
                    setTriggerAddPhase(0);
                    setTriggerBulkPhase(0);
                    setTriggerAddDetector(0);
                    setTriggerAddBasicTiming(0);
                    setActiveTab(tab.id as TabType);
                    setShowExportPanel(false);
                    setShowImportPanel(false);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center space-x-2 px-2 py-2 rounded-md text-left transition-all duration-200",
                    isActive
                      ? "bg-primary-100 text-primary-700 border border-primary-200 shadow-sm"
                      : "text-grey-600 hover:bg-grey-100 hover:text-grey-800"
                  )}
                >
                  <Icon size={16} className={isActive ? "text-primary-600" : "text-grey-500"} />
                  <div className="flex-1">
                    <span className="text-xs font-medium">{tab.label}</span>
                  </div>
                  {count > 0 && tab.id === "signals" && (
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className="text-xs px-1.5 py-0 min-w-[18px] h-4"
                    >
                      {count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Footer Actions */}
        <div className="p-2 border-t border-grey-200">
          {/* About GTSS section */}
          <div className="mb-4 pb-3 border-b border-grey-200">
            <p className="text-xs font-medium text-grey-600 mb-2 px-2">About GTSS</p>
            <Button
              size="sm"
              className="w-full h-7 text-xs bg-blue-500 text-white hover:bg-blue-600 shadow-sm transition-all duration-200"
              onClick={() => window.open('https://gtss.dev', '_blank')}
              data-testid="button-about-gtss"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Learn More
            </Button>
          </div>

          {/* Support this Tool section */}
          <div className="mb-4 pb-3 border-b border-grey-200">
            <p className="text-xs font-medium text-grey-600 mb-2 px-2">Support this Tool</p>
            <Button
              size="sm"
              className="w-full h-7 text-xs bg-orange-500 text-white hover:bg-orange-600 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105"
              onClick={() => window.open('https://buymeacoffee.com/mr2742', '_blank')}
            >
              <Coffee className="w-3 h-3 mr-1" />
              Buy me a Coffee
            </Button>
          </div>

          {/* Import/Export section */}
          <div className="mb-4 pb-3 border-b border-grey-200">
            <p className="text-xs font-medium text-grey-600 mb-2 px-2">Data Management</p>
            <div className="space-y-1">
              <Button
                variant="outline"
                className={cn(
                  "w-full h-7 text-xs",
                  showImportPanel
                    ? "bg-primary-100 text-primary-700 border-primary-200"
                    : "bg-grey-100 text-grey-700 hover:bg-grey-200"
                )}
                onClick={() => {
                  setShowImportPanel(true);
                  setShowExportPanel(false);
                  setIsMobileMenuOpen(false);
                }}
                data-testid="button-import"
              >
                <FolderInput className="w-3 h-3 mr-1" />
                Import
              </Button>
              <Button
                variant="outline"
                className={cn(
                  "w-full h-7 text-xs",
                  showExportPanel
                    ? "bg-primary-100 text-primary-700 border-primary-200"
                    : "bg-grey-100 text-grey-700 hover:bg-grey-200"
                )}
                onClick={() => {
                  setShowExportPanel(true);
                  setShowImportPanel(false);
                  setIsMobileMenuOpen(false);
                }}
                data-testid="button-export"
              >
                <FolderOutput className="w-3 h-3 mr-1" />
                Export
              </Button>
            </div>
          </div>

          {/* Clear All Data */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full h-7 text-xs mt-2 border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear All Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All Data</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all agency information, signals, approaches, phases, timings, and detectors.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearAllData}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Clear All Data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-grey-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden h-8 w-8 p-0"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                data-testid="button-mobile-menu"
              >
                {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </Button>
              <div>
                <h2 className="text-base lg:text-lg font-bold text-grey-800">
                  {showExportPanel ? "Export Data" : showImportPanel ? "Import Data" : tabTitles[activeTab].title}
                </h2>
                <p className="text-xs text-grey-500 hidden sm:block">
                  {showExportPanel ? "Export your traffic signal data to files" : showImportPanel ? "Import traffic signal data from files or paste" : tabTitles[activeTab].desc}
                </p>
              </div>
            </div>
            {!showExportPanel && !showImportPanel && activeTab === "signals" && (
              <div className="flex space-x-1">
                <Button onClick={handleAddMultiple} variant="outline" className="h-7 px-2 text-xs border-primary-200 text-primary-700 hover:bg-primary-50 hidden sm:flex">
                  <Navigation className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Add Multiple</span>
                </Button>
                <Button onClick={handleAddSignal} className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700">
                  <Plus className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Add Signal</span>
                </Button>
              </div>
            )}
            {!showExportPanel && !showImportPanel && activeTab === "approaches" && (
              <div className="flex space-x-1">
                <Button
                  variant="outline"
                  onClick={() => setTriggerBulkApproach(prev => prev + 1)}
                  className="h-7 px-2 text-xs"
                >
                  <Plus className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Add Multiple</span>
                </Button>
                <Button onClick={handleAddApproach} className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700">
                  <Plus className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Add Approach</span>
                </Button>
              </div>
            )}
            {!showExportPanel && !showImportPanel && activeTab === "phases" && (
              <div className="flex space-x-1">
                <Button
                  variant="outline"
                  onClick={() => setTriggerBulkPhase(prev => prev + 1)}
                  className="h-7 px-2 text-xs"
                >
                  <Plus className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Add Multiple</span>
                </Button>
                <Button onClick={handleAddPhase} className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700 text-white">
                  <Plus className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Add Phase</span>
                </Button>
              </div>
            )}
            {!showExportPanel && !showImportPanel && activeTab === "basic-timings" && (
              <div className="flex space-x-1">
                <Button onClick={handleAddBasicTiming} className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700">
                  <Plus className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Add Timing</span>
                </Button>
              </div>
            )}
            {!showExportPanel && !showImportPanel && activeTab === "detectors" && (
              <div className="flex space-x-1">
                <Button onClick={handleAddDetector} className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700">
                  <Plus className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Add Detector</span>
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-3">
          {renderTabContent()}
        </main>


      </div>
    </div>
  );
}
