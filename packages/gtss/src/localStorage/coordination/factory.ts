import { getFromStorage, removeFromStorage, saveToStorage } from "../storage-utils";
import type {
  CoordinationKey,
  CoordinationRow,
  CoordinationRows,
  ParsedCoordination,
} from "./rows";
import type { CoordinationScope } from "./scope";

/**
 * Everything the registry needs to know about one coordination file.
 *
 * Generic over the registry KEY rather than the row type. That is what keeps an
 * array of heterogeneous descriptors honest: because `generate`, `parse` and
 * `identity` are all expressed in terms of `CoordinationRows[K]`, a generator
 * for `Split[]` cannot be paired with `key: "corridors"`.
 */
export interface Descriptor<K extends CoordinationKey> {
  readonly key: K;
  readonly storageKey: string;
  /** Filename inside the coordination zip, e.g. "Splits.txt". */
  readonly filename: string;
  /** Human label for counts and previews, e.g. "Splits". */
  readonly label: string;
  /**
   * Lowercase filename fragments that identify this file on import, most
   * specific first. Order matters across the whole registry — see
   * `detectCoordinationFile`.
   */
  readonly filenameMatch: readonly string[];
  readonly generate: (rows: CoordinationRows[K]) => string;
  readonly parse: (content: string) => CoordinationRows[K];
  /** Natural key. Never a surrogate id — these rows don't have one. */
  readonly identity: (row: CoordinationRow<K>) => string;
  /** Narrow to the rows that survive an agency/signal filter on export. */
  readonly applyScope: (rows: CoordinationRows[K], scope: CoordinationScope) => CoordinationRows[K];
  /** Present only for the four files that carry a signal_id. */
  readonly signalRef?: {
    readonly get: (row: CoordinationRow<K>) => string;
    readonly set: (row: CoordinationRow<K>, signalId: string) => CoordinationRow<K>;
  };
}

/**
 * Row-type-erased view of one entity.
 *
 * Every member is pre-bound to a single row type, so consumers iterate
 * `COORDINATION_ENTITIES` and call these without ever re-correlating a type
 * parameter and without a cast.
 */
export interface Entity {
  readonly key: CoordinationKey;
  readonly storageKey: string;
  readonly filename: string;
  readonly label: string;
  readonly filenameMatch: readonly string[];
  /** Rows currently in storage. */
  readonly read: () => readonly unknown[];
  readonly count: () => number;
  readonly countIn: (bag: ParsedCoordination) => number;
  readonly clear: () => void;
  /** CSV for the rows in storage, narrowed by scope. */
  readonly render: (scope: CoordinationScope) => string;
  /** CSV for rows from an in-memory bag (used by the export preview). */
  readonly renderFrom: (bag: ParsedCoordination, scope: CoordinationScope) => string;
  readonly parseInto: (content: string, bag: ParsedCoordination) => void;
  readonly replaceFrom: (bag: ParsedCoordination) => void;
  readonly mergeFrom: (bag: ParsedCoordination) => void;
  /** Signal rename / delete fan-out, for the four signal-scoped files. */
  readonly deleteBySignal?: (signalId: string) => void;
  readonly updateSignalId?: (oldId: string, newId: string) => void;
}

export function defineEntity<K extends CoordinationKey>(d: Descriptor<K>): Entity {
  const read = (): CoordinationRows[K] =>
    getFromStorage<CoordinationRows[K]>(d.storageKey, [] as unknown as CoordinationRows[K]);

  const write = (rows: CoordinationRows[K]) => saveToStorage(d.storageKey, rows);

  // `bag[d.key]` is `CoordinationRows[K] | undefined`, but writing back through
  // the Partial loses the K correlation. This is the one erasure in the design;
  // it is confined here, where K is still in scope and checked against the
  // declared return type of `d.parse`.
  const put = (bag: ParsedCoordination, rows: CoordinationRows[K]) => {
    (bag as CoordinationRows)[d.key] = rows;
  };

  const entity: Entity = {
    key: d.key,
    storageKey: d.storageKey,
    filename: d.filename,
    label: d.label,
    filenameMatch: d.filenameMatch,

    read,
    count: () => read().length,
    countIn: (bag) => bag[d.key]?.length ?? 0,
    clear: () => removeFromStorage(d.storageKey),

    render: (scope) => d.generate(d.applyScope(read(), scope)),
    renderFrom: (bag, scope) =>
      d.generate(d.applyScope((bag[d.key] ?? []) as CoordinationRows[K], scope)),

    parseInto: (content, bag) => {
      const parsed = d.parse(content);
      const existing = (bag[d.key] ?? []) as CoordinationRows[K];
      put(bag, [...existing, ...parsed] as CoordinationRows[K]);
    },

    replaceFrom: (bag) => {
      const rows = bag[d.key];
      // `!== undefined`, not truthy: an empty array is a meaningful "this file
      // was present and had no rows", and must clear what is stored.
      if (rows !== undefined) write(rows as CoordinationRows[K]);
    },

    mergeFrom: (bag) => {
      const incoming = (bag[d.key] ?? []) as CoordinationRows[K];
      if (incoming.length === 0) return;
      const existing = read();
      const seen = new Set(existing.map((r) => d.identity(r as CoordinationRow<K>)));
      const added = incoming.filter((row) => {
        const key = d.identity(row as CoordinationRow<K>);
        if (seen.has(key)) return false;
        // Added to the set as we go, so duplicates *within* one incoming file
        // are also collapsed. The six original entities build their key set
        // from existing rows only and so append intra-file duplicates.
        seen.add(key);
        return true;
      }) as CoordinationRows[K];
      if (added.length > 0) write([...existing, ...added] as CoordinationRows[K]);
    },
  };

  if (!d.signalRef) return entity;

  const { get, set } = d.signalRef;
  return {
    ...entity,
    deleteBySignal: (signalId) => {
      const rows = read();
      const kept = rows.filter((r) => get(r as CoordinationRow<K>) !== signalId);
      if (kept.length !== rows.length) write(kept as CoordinationRows[K]);
    },
    updateSignalId: (oldId, newId) => {
      const rows = read();
      let touched = false;
      const next = rows.map((r) => {
        if (get(r as CoordinationRow<K>) !== oldId) return r;
        touched = true;
        return set(r as CoordinationRow<K>, newId);
      });
      if (touched) write(next as CoordinationRows[K]);
    },
  };
}
