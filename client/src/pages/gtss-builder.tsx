import { useState } from "react";
import { useLocation } from "wouter";
import { useLoadFromStorage } from "@/lib/localStorageHooks";
import { TrafficCone, Building, MapPin, ArrowUpDown, Target, FolderOutput, Navigation, Plus, Map, Coffee, Trash2, Menu, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import AgencyForm from "@/components/gtss/agency-form";
import SignalsTable from "@/components/gtss/signals-table";
import PhasesTable from "@/components/gtss/phases-table";
import DetectorsTable from "@/components/gtss/detectors-table";
import ExportPanel from "@/components/gtss/export-panel";
import { useGTSSStore } from "@/store/gtss-store";
import { useToast } from "@/hooks/use-toast";
import { clearAllData } from "@/lib/localStorage";
import { cn } from "@/lib/utils";

type TabType = "agency" | "signals" | "phases" | "detectors";

const tabs = [
  { id: "signals", label: "Traffic Signals", icon: MapPin },
  { id: "phases", label: "Phases", icon: ArrowUpDown },
  { id: "detectors", label: "Detectors", icon: Target },
  { id: "agency", label: "Agency Info", icon: Building },
];

const tabTitles = {
  agency: { title: "Agency Information", desc: "Configure your traffic management agency details" },
  signals: { title: "Traffic Signals", desc: "Manage traffic signal installation locations" },
  phases: { title: "Signal Phases", desc: "Configure movement phases for each signal" },
  detectors: { title: "Detection Systems", desc: "Configure vehicle and pedestrian detection equipment" },
};

export default function GTSSBuilder() {
  const [activeTab, setActiveTab] = useState<TabType>("signals");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [, navigate] = useLocation();
  const { signals, phases, detectors, setAgency, setSignals, setPhases, setDetectors } = useGTSSStore();
  const { toast } = useToast();
  
  // Load data from localStorage on mount
  useLoadFromStorage();

  const getCounts = () => ({
    signals: signals.length,
    phases: phases.length,
    detectors: detectors.length,
  });

  const counts = getCounts();

  const [triggerAdd, setTriggerAdd] = useState(0);
  const [triggerBulk, setTriggerBulk] = useState(0);
  const [triggerAddPhase, setTriggerAddPhase] = useState(0);
  const [triggerVisualEditor, setTriggerVisualEditor] = useState(0);
  const [triggerAddDetector, setTriggerAddDetector] = useState(0);

  const renderTabContent = () => {
    switch (activeTab) {
      case "agency":
        return <AgencyForm />;
      case "signals":
        return <SignalsTable triggerAdd={triggerAdd} triggerBulk={triggerBulk} />;
      case "phases":
        return <PhasesTable triggerAdd={triggerAddPhase} triggerVisualEditor={triggerVisualEditor} />;
      case "detectors":
        return <DetectorsTable triggerAdd={triggerAddDetector} />;
      default:
        return <AgencyForm />;
    }
  };

  const handleAddSignal = () => {
    // Navigate directly to signal details page for new signal creation
    navigate('/signal/new');
  };

  const handleAddMultiple = () => {
    setTriggerBulk(prev => prev + 1);
  };

  const handleAddPhase = () => {
    setTriggerAddPhase(prev => prev + 1);
  };

  const handleVisualEditor = () => {
    setTriggerVisualEditor(prev => prev + 1);
  };

  const handleAddDetector = () => {
    setTriggerAddDetector(prev => prev + 1);
  };

  const handleClearAllData = () => {
    clearAllData();
    // Reset store to empty state
    setAgency(null);
    setSignals([]);
    setPhases([]);
    setDetectors([]);
    
    toast({
      title: "Data Cleared",
      description: "All signal, phase, detector, and agency data has been cleared",
    });
  };

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
                    setActiveTab(tab.id as TabType);
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
                  {count > 0 && tab.id !== "phases" && tab.id !== "detectors" && (
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

          <Button 
            variant="outline" 
            className="w-full h-7 text-xs bg-grey-100 text-grey-700 hover:bg-grey-200"
            onClick={() => navigate('/export')}
          >
            <FolderOutput className="w-3 h-3 mr-1" />
            Import/Export
          </Button>

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
                  This will permanently delete all agency information, signals, phases, and detectors. 
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
                  {tabTitles[activeTab].title}
                </h2>
                <p className="text-xs text-grey-500 hidden sm:block">{tabTitles[activeTab].desc}</p>
              </div>
            </div>
            {activeTab === "signals" && (
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
            {activeTab === "phases" && (
              <div className="flex space-x-1">
                <Button onClick={handleVisualEditor} variant="outline" className="h-7 px-2 text-xs border-grey-300 text-grey-700 hover:bg-white hover:text-grey-900 hidden sm:flex">
                  <Map className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Visual Editor</span>
                </Button>
                <Button onClick={handleAddPhase} className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700 text-white">
                  <Plus className="w-3 h-3 sm:mr-1" />
                  <span className="hidden sm:inline">Add Phase</span>
                </Button>
              </div>
            )}
            {activeTab === "detectors" && (
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
