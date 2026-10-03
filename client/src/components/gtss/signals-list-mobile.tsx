import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SignalsMap from "@/components/ui/signals-map";
import { getDerivedStreetNames, naturalCompare, useGTSSStore } from "gtss";
import { ChevronRight, Map as MapIcon, Search, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

type SortField = "signalId" | "streetName1" | "completeness";

const SORT_LABELS: Record<SortField, string> = {
  signalId: "Signal ID",
  streetName1: "Street name",
  completeness: "% complete",
};

/**
 * The signals list as it appears on a phone: tappable cards instead of a
 * four-column table.
 *
 * The desktop list puts the map and table in a draggable vertical split with a
 * 480px floor, which on a phone leaves a cramped map above about five visible
 * rows — and its saved split ratio carries over from whatever the user set at a
 * desk. Here the map is collapsed by default and the list gets the screen.
 */
export default function SignalsListMobile() {
  const { signals, approaches, phases, detectors, basicTimings, navigateToSignalDetails } =
    useGTSSStore();

  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("signalId");
  const [showMap, setShowMap] = useState(false);

  // 25% for each of approaches, phases, detectors and timings that has at least
  // one row for the signal — same rule as the desktop table.
  const completenessFor = useMemo(() => {
    return (signalId: string): number => {
      const has = (arr: { signalId: string }[]) => arr.some((x) => x.signalId === signalId);
      let n = 0;
      if (has(approaches)) n++;
      if (has(phases)) n++;
      if (has(detectors)) n++;
      if (has(basicTimings)) n++;
      return n * 25;
    };
  }, [approaches, phases, detectors, basicTimings]);

  const streetsFor = useCallback(
    (signalId: string, s1?: string | null, s2?: string | null) => {
      const derived = getDerivedStreetNames(signalId, approaches);
      const a = derived.streetName1 || s1;
      const b = derived.streetName2 || s2;
      if (a && b) return `${a} & ${b}`;
      return a || b || "";
    },
    [approaches],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = signals.filter((signal) => {
      if (!q) return true;
      const derived = getDerivedStreetNames(signal.signalId, approaches);
      return [
        signal.signalId,
        signal.streetName1,
        signal.streetName2,
        derived.streetName1,
        derived.streetName2,
      ].some((v) => (v || "").toLowerCase().includes(q));
    });

    return [...matched].sort((a, b) => {
      if (sortField === "completeness") {
        // Least complete first — on a phone the useful question is usually
        // "what still needs surveying?".
        const diff = completenessFor(a.signalId) - completenessFor(b.signalId);
        if (diff !== 0) return diff;
        return naturalCompare(a.signalId, b.signalId);
      }
      if (sortField === "streetName1") {
        return streetsFor(a.signalId, a.streetName1, a.streetName2).localeCompare(
          streetsFor(b.signalId, b.streetName1, b.streetName2),
        );
      }
      return naturalCompare(a.signalId, b.signalId);
    });
  }, [signals, approaches, query, sortField, completenessFor, streetsFor]);

  const barColor = (pct: number) => {
    if (pct === 100) return "bg-green-500";
    if (pct >= 75) return "bg-blue-500";
    if (pct >= 50) return "bg-amber-500";
    if (pct >= 25) return "bg-orange-500";
    return "bg-grey-300";
  };

  // Hover tooltips don't exist on touch, so the breakdown the desktop table
  // hides in a `title` is rendered as text here.
  const missingFor = (signalId: string) => {
    const has = (arr: { signalId: string }[]) => arr.some((x) => x.signalId === signalId);
    const gaps = [
      !has(approaches) && "approaches",
      !has(phases) && "phases",
      !has(detectors) && "detection",
      !has(basicTimings) && "timings",
    ].filter(Boolean) as string[];
    return gaps.length === 0 ? "Complete" : `No ${gaps.join(", ")}`;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-grey-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ID or street…"
            aria-label="Search signals by ID or street name"
            className="h-11 pl-9 pr-9 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-grey-400"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => setShowMap((v) => !v)}
          aria-pressed={showMap}
          className="h-11 px-3 text-xs"
        >
          <MapIcon className="mr-1 h-4 w-4" />
          {showMap ? "Hide" : "Map"}
        </Button>
      </div>

      {showMap && (
        <div className="h-[260px] overflow-hidden rounded-lg border border-grey-200">
          {/* enableClickToAdd stays off: on touch a stray pan registers as a
              click, which on the desktop list opens the Add Signal modal. */}
          <SignalsMap
            signals={signals}
            approaches={approaches}
            phases={phases}
            getCompletenessPct={completenessFor}
            onSignalSelect={(signal) => navigateToSignalDetails(signal.signalId)}
            enableClickToAdd={false}
            className="h-full w-full"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-grey-500">
          {query.trim() ? `${visible.length} of ${signals.length}` : `${signals.length}`} signals
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-grey-500">Sort</span>
          <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
            <SelectTrigger className="h-9 w-36 text-xs" aria-label="Sort signals">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortField[]).map((f) => (
                <SelectItem key={f} value={f} className="text-xs">
                  {SORT_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-grey-500">
          <Search className="h-8 w-8 text-grey-300" />
          {signals.length === 0 ? (
            <p>No signals yet.</p>
          ) : (
            <>
              <p>No signals match “{query.trim()}”</p>
              <p className="text-xs text-grey-400">Try a different ID or street name</p>
            </>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((signal) => {
            const pct = completenessFor(signal.signalId);
            const streets = streetsFor(signal.signalId, signal.streetName1, signal.streetName2);
            return (
              <li key={signal.id}>
                <button
                  type="button"
                  onClick={() => navigateToSignalDetails(signal.signalId)}
                  className="flex w-full items-center gap-3 rounded-lg border border-grey-200 bg-white px-3 py-3 text-left active:bg-grey-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-base font-semibold text-grey-900">
                        {signal.signalId}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-grey-500">{pct}%</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-grey-600">
                      {streets || <span className="italic text-grey-400">No street names</span>}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-grey-200">
                        <div className={`h-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="shrink-0 text-[11px] text-grey-500">
                        {missingFor(signal.signalId)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-grey-300" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
