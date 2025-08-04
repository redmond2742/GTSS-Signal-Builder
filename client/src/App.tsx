import { Switch, Route } from "wouter";
// React Query removed - using localStorage instead
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import GTSSBuilder from "@/pages/gtss-builder";
import SignalDetails from "@/pages/signal-details";
import ExportPage from "@/pages/export";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={GTSSBuilder} />
      <Route path="/signal/:signalId" component={SignalDetails} />
      <Route path="/export" component={ExportPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <TooltipProvider>
      <Toaster />
      <Router />
    </TooltipProvider>
  );
}

export default App;
