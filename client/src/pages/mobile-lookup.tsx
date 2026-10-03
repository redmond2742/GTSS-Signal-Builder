import SignalSearchBox from "@/components/gtss/signal-search-box";
import SignalsListMobile from "@/components/gtss/signals-list-mobile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setFullEditor } from "@/lib/view-mode";
import SignalDetails from "@/pages/signal-details";
import { useGTSSStore, useLoadFromStorage } from "gtss";
import { Eye, MoreVertical, PencilLine, TrafficCone } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * The phone shell: find a signal, open it, read it.
 *
 * This is a sibling of GTSSBuilder rather than a mode inside it. The editor
 * shell turns deep-link params (?approachId, ?phaseId, ?detectorId, ?timingId)
 * straight into auto-opened edit modals and listens for an "open-agency-modal"
 * window event, so hiding its buttons would not be enough — a shared URL would
 * still land someone in an editor. Not mounting it is what makes that safe.
 */
export default function MobileLookup() {
  const { currentView, currentSignalId, navigateToSignalDetails, navigateToMain } = useGTSSStore();

  useLoadFromStorage();

  const onDetail = currentView === "signal-details" && !!currentSignalId;

  // Restore a signal from the URL on first load, so a shared link still opens
  // the right page. The ref keeps this to the first run: afterwards navigation
  // is driven by the store, and re-reading the URL would fight it.
  const restoredFromUrl = useRef(false);
  useEffect(() => {
    if (restoredFromUrl.current) return;
    restoredFromUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    const signalId = params.get("signalId");
    if (params.get("view") === "signal-details" && signalId) {
      navigateToSignalDetails(signalId);
    }
  }, [navigateToSignalDetails]);

  // pushState, not replaceState: on a phone the system back gesture is the
  // primary way out of a detail page, and replaceState would exit the app.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (onDetail && currentSignalId) {
      params.set("view", "signal-details");
      params.set("signalId", currentSignalId);
    } else {
      params.delete("view");
      params.delete("signalId");
    }
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    if (next === `${window.location.pathname}${window.location.search}`) return;
    window.history.pushState({ view: onDetail ? "signal-details" : "main" }, "", next);
  }, [onDetail, currentSignalId]);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const signalId = params.get("signalId");
      if (params.get("view") === "signal-details" && signalId) navigateToSignalDetails(signalId);
      else navigateToMain();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [navigateToSignalDetails, navigateToMain]);

  return (
    <div className="min-h-screen bg-grey-50">
      <header className="sticky top-0 z-30 border-b border-grey-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigateToMain()}
            className="flex min-w-0 items-center gap-2"
            aria-label="GTSS Builder — back to signals"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600">
              <TrafficCone className="h-4 w-4 text-white" />
            </span>
            <span className="truncate text-base font-bold text-grey-800">Signals</span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <SignalSearchBox className="w-36" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-11 w-11 p-0" aria-label="Menu">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-grey-500">
                  <Eye className="h-3.5 w-3.5" />
                  View only — editing is off on this device
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setFullEditor(true)} className="gap-2">
                  <PencilLine className="h-4 w-4" />
                  Switch to full editor
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="p-3">{onDetail ? <SignalDetails readOnly /> : <SignalsListMobile />}</main>
    </div>
  );
}
