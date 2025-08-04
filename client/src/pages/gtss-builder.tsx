import { useState } from "react";
import { useLocation } from "wouter";
import { useLoadFromStorage } from "@/lib/localStorageHooks";
import { TrafficCone, Building, MapPin, ArrowUpDown, Target, FolderOutput, Navigation, Plus, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AgencyForm from "@/components/gtss/agency-form";
import SignalsTable from "@/components/gtss/signals-table";
import PhasesTable from "@/components/gtss/phases-table";
import DetectorsTable from "@/components/gtss/detectors-table";
import ExportPanel from "@/components/gtss/export-panel";
import { useGTSSStore } from "@/store/gtss-store";
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
  const [, navigate] = useLocation();
  const { signals, phases, detectors } = useGTSSStore();
  
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
    window.location.href = '/signal/new';
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

  return (
    <div className="min-h-screen flex bg-grey-50">
      {/* Sidebar */}
      <div className="w-56 bg-white shadow-lg border-r border-grey-200 flex flex-col">
        {/* Header */}
        <div className="p-3 border-b border-grey-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <TrafficCone className="text-white" size={16} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-grey-800">Signal Configurator</h1>
              <p className="text-sm text-grey-500">GTSS Builder</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2">
          <div className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const count = counts[tab.id as keyof typeof counts] || 0;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
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
                  {count > 0 && tab.id !== "phases" && (
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
          <Button 
            variant="outline" 
            className="w-full h-7 text-xs bg-grey-100 text-grey-700 hover:bg-grey-200"
            onClick={() => navigate('/export')}
          >
            <FolderOutput className="w-3 h-3 mr-1" />
            Import/Export
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-grey-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-grey-800">
                {tabTitles[activeTab].title}
              </h2>
              <p className="text-xs text-grey-500">{tabTitles[activeTab].desc}</p>
            </div>
            {activeTab === "signals" && (
              <div className="flex space-x-1">
                <Button onClick={handleAddMultiple} variant="outline" className="h-7 px-2 text-xs border-primary-200 text-primary-700 hover:bg-primary-50">
                  <Navigation className="w-3 h-3 mr-1" />
                  Add Multiple
                </Button>
                <Button onClick={handleAddSignal} className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700">
                  <Plus className="w-3 h-3 mr-1" />
                  Add Signal
                </Button>
              </div>
            )}
            {activeTab === "phases" && (
              <div className="flex space-x-1">
                <Button onClick={handleAddPhase} className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700 text-white">
                  <Plus className="w-3 h-3 mr-1" />
                  Add Phase
                </Button>
                <Button onClick={handleVisualEditor} variant="outline" className="h-7 px-2 text-xs border-grey-300 text-grey-700 hover:bg-white hover:text-grey-900">
                  <Map className="w-3 h-3 mr-1" />
                  Visual Editor
                </Button>
              </div>
            )}
            {activeTab === "detectors" && (
              <div className="flex space-x-1">
                <Button onClick={handleAddDetector} className="h-7 px-2 text-xs bg-primary-600 hover:bg-primary-700">
                  <Plus className="w-3 h-3 mr-1" />
                  Add Detector
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
