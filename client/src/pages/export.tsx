import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import ExportPanel from "@/components/gtss/export-panel";
import { useLoadFromStorage } from "@/lib/localStorageHooks";

export default function ExportPage() {
  const [, navigate] = useLocation();
  
  // Load data from localStorage on mount
  useLoadFromStorage();

  return (
    <div className="min-h-screen bg-grey-50">
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="h-7 px-2 text-xs"
          >
            <ArrowLeft className="w-3 h-3 mr-1" />
            Back to Main
          </Button>
          <div>
            <h1 className="text-lg font-bold text-grey-800">Preview and Export</h1>
            <p className="text-xs text-grey-500">
              Review your configuration and export GTSS package
            </p>
          </div>
        </div>

        {/* Export Panel */}
        <ExportPanel />
      </div>
    </div>
  );
}