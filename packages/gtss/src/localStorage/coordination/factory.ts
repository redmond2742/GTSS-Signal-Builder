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
  /**
   * Row properties that make up the identity. The cell editor renders these
   * read-only: changing one would silently relocate the row, and with
   * composite keys it could collide with an existing one.
   */
  readonly keyFields: readonly string[];
  /** Narrow to the rows that survive an agency/signal filter on export. */
  readonly applyScope: (rows: CoordinationRows[K], scope: CoordinationScope) => CoordinationRows[K];
  /** Present only for the four files that carry a signal_id. */
  readonly signalRef?: {
    readonly get: (row: CoordinationRow<K>) => string;
    readonly set: (row: CoordinationRow<K>, signalId: string) => CoordinationRow<K>;
  };
}

/** What happened when one row's signal ID was changed. */
export type RowSignalChange =
  | "ok"
  /** The new ID is the one the row already has. */
  | "unchanged"
  /** Another row already has the key this one would end up with. Nothing written. */
  | "duplicate"
  | "missing"
  | "blank";

/** Result of re-pointing every row of one signal in a file. */
export interface SignalMoveReport {
  changed: number;
  /** Rows left alone because moving them would duplicate an existing row. */
  skipped: number;
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
  /** Signal delete fan-out, for the four signal-scoped files. */
  readonly deleteBySignal?: (signalId: string) => void;
  /**
   * Point ONE row at a different signal. The signal id is part of the identity of
   * PatternSignals, Splits and PhaseSequence rows, so this is a move, not a patch:
   * if another row already has the resulting key it refuses and writes nothing,
   * rather than leave two rows claiming the same address.
   */
  readonly changeRowSignal?: (identity: string, newSignalId: string) => RowSignalChange;
  /**
   * Point every row of `oldId` at `newId`. Rows that would collide with an
   * existing row are skipped and counted, not merged or overwritten.
   */
  readonly changeSignalInFile?: (oldId: string, newId: string) => SignalMoveReport;

  // --- editing -----------------------------------------------------------
  /** Row properties that form the identity; the cell editor locks these. */
  readonly keyFields: readonly string[];
  /** Natural key for a row, for list keys and row addressing. */
  readonly identityOf: (row: unknown) => string;
  /** Patch one row's non-key fields, addressed by natural key. */
  readonly updateRow: (identity: string, patch: Record<string, unknown>) => void;
  /** Append a row. Returns false (and writes nothing) if the key already exists. */
  readonly addRow: (row: unknown) => boolean;
  readonly deleteRow: (identity: string) => void;
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

    keyFields: d.keyFields,
    identityOf: (row) => d.identity(row as CoordinationRow<K>),

    updateRow: (identity, patch) => {
      const rows = read();
      let touched = false;
      const next = rows.map((row) => {
        if (d.identity(row as CoordinationRow<K>) !== identity) return row;
        touched = true;
        // Key fields are dropped rather than trusted: a patch that changed one
        // would move the row out from under its own identity.
        const safe = Object.fromEntries(
          Object.entries(patch).filter(([field]) => !d.keyFields.includes(field)),
        );
        return { ...row, ...safe };
      });
      if (touched) write(next as CoordinationRows[K]);
    },

    addRow: (row) => {
      const rows = read();
      const key = d.identity(row as CoordinationRow<K>);
      if (rows.some((r) => d.identity(r as CoordinationRow<K>) === key)) return false;
      write([...rows, row] as CoordinationRows[K]);
      return true;
    },

    deleteRow: (identity) => {
      const rows = read();
      const kept = rows.filter((r) => d.identity(r as CoordinationRow<K>) !== identity);
      if (kept.length !== rows.length) write(kept as CoordinationRows[K]);
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
    changeRowSignal: (identity, newSignalId) => {
      const target = newSignalId.trim();
      if (target === "") return "blank";
      const rows = read();
      const index = rows.findIndex((r) => d.identity(r as CoordinationRow<K>) === identity);
      if (index < 0) return "missing";
      const current = rows[index] as CoordinationRow<K>;
      if (get(current) === target) return "unchanged";

      const moved = set(current, target);
      const movedKey = d.identity(moved);
      const clash = rows.some(
        (r, i) => i !== index && d.identity(r as CoordinationRow<K>) === movedKey,
      );
      if (clash) return "duplicate";

      write(rows.map((r, i) => (i === index ? moved : r)) as CoordinationRows[K]);
      return "ok";
    },
    changeSignalInFile: (oldId, newId) => {
      const target = newId.trim();
      if (target === "" || target === oldId) return { changed: 0, skipped: 0 };

      const rows = read();
      // Keys in use, kept current as rows move so two rows of the old signal
      // can't both land on one key.
      const taken = new Set(rows.map((r) => d.identity(r as CoordinationRow<K>)));
      let changed = 0;
      let skipped = 0;
      const next = rows.map((r) => {
        const row = r as CoordinationRow<K>;
        if (get(row) !== oldId) return r;
        const moved = set(row, target);
        const ownKey = d.identity(row);
        const movedKey = d.identity(moved);
        // For corridorSignals the signal isn't part of the key, so the moved row
        // has the same key as itself. That is not a clash.
        if (movedKey !== ownKey && taken.has(movedKey)) {
          skipped++;
          return r;
        }
        taken.delete(ownKey);
        taken.add(movedKey);
        changed++;
        return moved;
      });
      if (changed > 0) write(next as CoordinationRows[K]);
      return { changed, skipped };
    },
  };
}
