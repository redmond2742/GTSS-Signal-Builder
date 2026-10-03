// Storage write policy.
//
// The host app owns the policy; this package only ever asks "may I write?".
// That keeps `gtss` app-agnostic, the same way `gtss-diagram` takes `isLht` as a
// prop instead of reaching into storage itself.
//
// The flag lives on `globalThis` rather than in a module variable for two
// reasons, both of which bite in this repo:
//
//  1. Some writes happen at module-evaluation time, before any React code runs
//     — `phaseStorage.getAll()` performs a one-time migration, and the zustand
//     store calls it while building its initial state. Importing a setter from
//     "gtss" would evaluate that chain *before* the setter could be called.
//  2. `npm run build --workspace=gtss` bundles each entry point separately, so
//     a second entry would get its own copy of a module-level variable. A
//     global cell is immune to both.
//
// The app sets this in `client/src/lib/view-mode.ts`, imported first in
// `client/src/main.tsx`.

const FLAG = "__gtssStorageReadOnly";

type GlobalWithFlag = Record<string, unknown>;

/** Block (or unblock) every write this package performs. */
export function setStorageReadOnly(readOnly: boolean): void {
  (globalThis as GlobalWithFlag)[FLAG] = readOnly;
}

/** Whether writes are currently blocked. Exposed so the UI can disable controls
 *  up front rather than relying on the silent backstop. */
export function isStorageReadOnly(): boolean {
  return (globalThis as GlobalWithFlag)[FLAG] === true;
}

// One warning per key+operation. A blocked write can sit inside a React effect,
// so an unthrottled warn would flood the console.
const warned = new Set<string>();

/**
 * Refuse a write. Deliberately a silent no-op plus a one-shot warning rather
 * than a throw: several callers wrap writes in try/catch and surface a "Failed
 * to update" toast, and `saveToStorage` already throws for genuine quota
 * failures. Throwing here would conflate "policy denied" with "storage broken"
 * and show the user an error for something the UI never offered.
 */
export function refuseWrite(key: string, op: string): void {
  const seen = `${op}:${key}`;
  if (warned.has(seen)) return;
  warned.add(seen);
  // Not gated on import.meta.env.DEV — this package ships as a prebuilt browser
  // bundle with no define pass, so import.meta.env is undefined at runtime.
  console.warn(`[gtss] ${op} "${key}" ignored: storage is read-only.`);
}
