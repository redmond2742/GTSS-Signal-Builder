import { Input } from "@/components/ui/input";
import { getDerivedStreetNames, getSignalDisplayName, naturalCompare, useGTSSStore } from "gtss";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/** Most matches to show at once; beyond this the list stops being scannable. */
const MAX_RESULTS = 8;

interface SignalSearchBoxProps {
  /** Extra classes for the wrapper, e.g. to set the input width per header. */
  className?: string;
}

/**
 * Jump-to-signal box. Type an ID (or part of a street name), pick from the
 * dropdown or press Enter, and land on that signal's detail page.
 *
 * Lives in both the main shell header and the signal-details header — those two
 * views don't share a layout, so it mounts in each. Renders nothing until at
 * least two signals exist.
 */
export default function SignalSearchBox({ className = "" }: SignalSearchBoxProps) {
  const { signals, approaches, navigateToSignalDetails } = useGTSSStore();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const trimmed = query.trim();

  // Match on the signal ID or on any street name — including names derived from
  // the signal's approaches, since streetName1/2 are often blank.
  const matches = useMemo(() => {
    const q = trimmed.toLowerCase();
    if (!q) return [];
    return signals
      .filter((signal) => {
        const derived = getDerivedStreetNames(signal.signalId, approaches);
        return [
          signal.signalId,
          signal.streetName1,
          signal.streetName2,
          derived.streetName1,
          derived.streetName2,
        ].some((v) => (v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => naturalCompare(a.signalId, b.signalId))
      .slice(0, MAX_RESULTS);
  }, [signals, approaches, trimmed]);

  // Keep the highlight in range as the result list changes under it.
  useEffect(() => {
    setHighlight(0);
  }, [trimmed]);

  // Close when the click lands outside the box.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  const go = (signalId: string) => {
    navigateToSignalDetails(signalId);
    setQuery("");
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (matches.length === 0) return;
      e.preventDefault();
      setIsOpen(true);
      setHighlight((h) => {
        const next = e.key === "ArrowDown" ? h + 1 : h - 1;
        return (next + matches.length) % matches.length;
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!trimmed) return;
      // The highlighted row wins; otherwise an exact ID match, so typing a full
      // ID and hitting Enter never lands on a different signal that merely
      // contains it (e.g. "12" when both 12 and 128 exist).
      const exact = signals.find((s) => s.signalId.toLowerCase() === trimmed.toLowerCase());
      const target = matches[highlight] ?? exact ?? matches[0];
      if (target) go(target.signalId);
    }
  };

  // Nothing to search with a single signal (or none) — the box only earns its
  // place in the header once there's something to pick between. Declared after
  // the hooks above so the early return doesn't change hook order.
  if (signals.length < 2) return null;

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-grey-400 pointer-events-none" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Go to signal ID…"
        aria-label="Search for a signal by ID or street name"
        className="h-7 pl-7 text-xs"
      />

      {isOpen && trimmed !== "" && (
        <div className="absolute right-0 z-50 mt-1 w-72 max-w-[80vw] rounded-md border border-grey-200 bg-white shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-grey-500">No signal matches “{trimmed}”</p>
          ) : (
            <ul className="py-1">
              {matches.map((signal, i) => (
                <li key={signal.signalId}>
                  <button
                    type="button"
                    // The input's blur would close the list before a click
                    // registers, so commit on mousedown instead.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(signal.signalId);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`block w-full truncate px-3 py-1.5 text-left text-xs ${
                      i === highlight ? "bg-primary-50 text-primary-700" : "text-grey-700"
                    }`}
                  >
                    {getSignalDisplayName(signal, approaches)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
