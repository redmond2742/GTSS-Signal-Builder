import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import ExportPanel from "@/components/gtss/export-panel";
import { ImportPanel } from "@/components/gtss/import-panel";
import { useLoadFromStorage } from "@/lib/localStorageHooks";
import { useGTSSStore } from "@/store/gtss-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ExportPage() {
  const [, navigate] = useLocation();
  const { loadFromStorage } = useGTSSStore();
  
  // Load data from localStorage on mount
  useLoadFromStorage();

  return (
    <div className="min-h-screen bg-grey-50">
      <div className="max-w-6xl mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        {/* Header */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="h-7 px-2 text-xs"
            data-testid="button-back-to-main"
          >
            <ArrowLeft className="w-3 h-3 sm:mr-1" />
            <span className="hidden sm:inline">Back to Main</span>
          </Button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-grey-800">Import and Export</h1>
            <p className="text-xs text-grey-500 hidden sm:block">
              Import or export GTSS data packages
            </p>
          </div>
        </div>

        {/* Tabs for Export and Import */}
        <Tabs defaultValue="export" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="export" data-testid="tab-export">Export</TabsTrigger>
            <TabsTrigger value="import" data-testid="tab-import">Import</TabsTrigger>
          </TabsList>
          
          <TabsContent value="export" className="mt-3 sm:mt-4">
            <ExportPanel />
          </TabsContent>
          
          <TabsContent value="import" className="mt-3 sm:mt-4">
            <ImportPanel onImportComplete={loadFromStorage} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}