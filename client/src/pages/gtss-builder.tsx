import { useState } from "react";
import { TrafficCone, Building, MapPin, Shuffle, Target, FolderOutput, Save, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AgencyForm from "@/components/gtss/agency-form";
import SignalsTable from "@/components/gtss/signals-table";
import PhasesTable from "@/components/gtss/phases-table";
import DetectorsTable from "@/components/gtss/detectors-table";
import ExportPanel from "@/components/gtss/export-panel";
import { useGTSSStore } from "@/store/gtss-store";
import { cn } from "@/lib/utils";

type TabType = "agency" | "signals" | "phases" | "detectors" | "export";

const tabs = [
  { id: "agency", label: "Agency Info", icon: Building },
  { id: "signals", label: "Signal Locations", icon: MapPin },
  { id: "phases", label: "Phases", icon: Shuffle },
  { id: "detectors", label: "Detectors", icon: Target },
  { id: "export", label: "Preview & Export", icon: FolderOutput },
];

const tabTitles = {
  agency: { title: "Agency Information", desc: "Configure your traffic management agency details" },
  signals: { title: "Signal Locations", desc: "Manage traffic signal installation locations" },
  phases: { title: "Signal Phases", desc: "Configure movement phases for each signal" },
  detectors: { title: "Detection Systems", desc: "Configure vehicle and pedestrian detection equipment" },
  export: { title: "Preview & Export", desc: "Review configuration and export GTSS package" },
};

export default function GTSSBuilder() {
  const [activeTab, setActiveTab] = useState<TabType>("agency");
  const { signals, phases, detectors } = useGTSSStore();

  const getCounts = () => ({
    signals: signals.length,
    phases: phases.length,
    detectors: detectors.length,
  });

  const counts = getCounts();

  const renderTabContent = () => {
    switch (activeTab) {
      case "agency":
        return <AgencyForm />;
      case "signals":
        return <SignalsTable />;
      case "phases":
        return <PhasesTable />;
      case "detectors":
        return <DetectorsTable />;
      case "export":
        return <ExportPanel />;
      default:
        return <AgencyForm />;
    }
  };

  return (
    <div className="min-h-screen flex bg-grey-50">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-lg border-r border-grey-200 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-grey-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <TrafficCone className="text-white text-lg" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-grey-800">GTSS Builder</h1>
              <p className="text-sm text-grey-500">Traffic Signal Config</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const count = tab.id === "signals" ? counts.signals : 
                           tab.id === "phases" ? counts.phases :
                           tab.id === "detectors" ? counts.detectors : 0;

              return (
                <li key={tab.id}>
                  <button
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={cn(
                      "w-full flex items-center space-x-3 px-4 py-3 text-left rounded-lg transition-colors font-medium",
                      isActive
                        ? "bg-primary-50 text-primary-700 border border-primary-200"
                        : "text-grey-600 hover:bg-grey-100"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                    {count > 0 && (
                      <Badge variant="secondary" className="ml-auto bg-grey-200 text-grey-700 text-xs">
                        {count}
                      </Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer Actions */}
        <div className="p-4 border-t border-grey-200 space-y-2">
          <Button variant="outline" className="w-full bg-grey-100 text-grey-700 hover:bg-grey-200">
            <Save className="w-4 h-4 mr-2" />
            Save Config
          </Button>
          <Button variant="outline" className="w-full bg-grey-100 text-grey-700 hover:bg-grey-200">
            <FolderOpen className="w-4 h-4 mr-2" />
            Load Config
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-grey-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-grey-800">
                {tabTitles[activeTab].title}
              </h2>
              <p className="text-grey-500">{tabTitles[activeTab].desc}</p>
            </div>
            <div className="flex items-center space-x-3">
              <Button className="bg-primary-600 hover:bg-primary-700">
                <FolderOutput className="w-4 h-4 mr-2" />
                Export GTSS
              </Button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-6">
          {renderTabContent()}
        </main>
      </div>
    </div>
  );
}
