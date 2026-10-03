import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IS_LOOKUP_MODE } from "@/lib/view-mode";
import GTSSBuilder from "@/pages/gtss-builder";
import MobileLookup from "@/pages/mobile-lookup";

function App() {
  return (
    <TooltipProvider>
      <Toaster />
      {/* A branch, not a prop. The editor shell parses deep-link params
          (?approachId, ?phaseId, ?detectorId, ?timingId) straight into
          auto-opened edit modals, and listens for an "open-agency-modal"
          window event — so in lookup mode the only safe thing is for none of
          it to mount. */}
      {IS_LOOKUP_MODE ? <MobileLookup /> : <GTSSBuilder />}
    </TooltipProvider>
  );
}

export default App;
