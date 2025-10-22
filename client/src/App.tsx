import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import GTSSBuilder from "@/pages/gtss-builder";

function App() {
  return (
    <TooltipProvider>
      <Toaster />
      <GTSSBuilder />
    </TooltipProvider>
  );
}

export default App;
