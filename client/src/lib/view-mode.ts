// Lookup mode: on a phone the app is a read-only tool for finding and reading
// existing signals, not for entering data.
//
// IMPORTANT: this module must not import from "gtss". Importing that package
// evaluates it, and some of its storage migrations run at module-evaluation
// time (phaseStorage.getAll() renumbers pedestrian phases, and the zustand
// store calls it while building its initial state). The read-only flag has to
// be set *before* any of that runs, so this module writes the global cell
// directly and is imported first in main.tsx.
//
// Contract: packages/gtss/src/localStorage/write-guard.ts
const GTSS_READ_ONLY_FLAG = "__gtssStorageReadOnly";

/** Keep in sync with client/src/hooks/use-mobile.tsx. */
export const MOBILE_BREAKPOINT = 768;

/** App-owned, per-device. Deliberately NOT one of the package's STORAGE_KEYS:
 *  if it were written through the guarded storage layer, the guard would block
 *  the very toggle meant to lift it. */
const FULL_EDITOR_KEY = "gtss_full_editor_optin";

function prefersFullEditor(): boolean {
  try {
    return localStorage.getItem(FULL_EDITOR_KEY) === "1";
  } catch {
    return false;
  }
}

function isNarrowViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
}

/**
 * Both flags are latched once per page load, on purpose.
 *
 * Recomputing on resize would unmount the whole editor the moment a desktop
 * user narrowed their window — losing in-progress edits — and latching is also
 * what makes the mode safe to read synchronously at module scope, before React
 * renders anything. Rotating a phone does not change the answer.
 */
export const IS_NARROW_VIEWPORT: boolean = isNarrowViewport();

export const IS_LOOKUP_MODE: boolean = IS_NARROW_VIEWPORT && !prefersFullEditor();

if (IS_LOOKUP_MODE) {
  (globalThis as Record<string, unknown>)[GTSS_READ_ONLY_FLAG] = true;
}

/** Opt this device into (or out of) the full editing UI.
 *
 *  Reloads deliberately: the mode is latched at boot, and a reload is also the
 *  simplest way to discard any in-memory store state that diverged from
 *  storage while writes were blocked. */
export function setFullEditor(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(FULL_EDITOR_KEY, "1");
    else localStorage.removeItem(FULL_EDITOR_KEY);
  } catch {
    // Private browsing with storage blocked — the mode just won't persist.
  }
  window.location.reload();
}
