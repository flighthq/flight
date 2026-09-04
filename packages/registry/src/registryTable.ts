import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  KeyedTable,
  Kind,
  OrdinalTable,
  RegistryId,
  RegistryMissPolicy,
  RegistryTable,
  RegistryTableEntry,
  SlotTable,
} from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

// Registry tables are PERSISTENT: every operation that changes one returns a REPLACEMENT and mutates
// nothing, and the owner assigns the result. That is why the mutating verbs are named `with*` rather
// than `set*` — this repo reserves `set*` for in-place mutation, and a `set*` that does not set
// contradicts a stated rule at the call site, where the reader has only the name to go on.
//
// Every operation here is cold: construction, composition, enumeration, diagnostics. None is on a draw
// path. `getOrdinalTableEntry` is the one hot-path form and does a direct index with no dispatch.

// Composes `overlay` onto `base`, entry by entry. The overlay wins wherever it has an opinion.
//
// Refuses rather than guesses: composing two tables of different SHAPE, or belonging to different
// registries, is a programmer error and throws. It is not an expected failure a caller could handle.
//
// Three refusals, all the same kind of programmer error: a different SHAPE, a different REGISTRY, or a
// different MISS POLICY. The policy comparison is equality only — composition never interprets a policy,
// which is why the table layer needs no vocabulary of its own and the type is an open alias.
//
// `OrdinalTable` is not accepted, and that is structural rather than an oversight — nothing composes an
// ordinal table, so it carries no composition operations at all. The signature refuses it.
export function concatRegistryTable<T>(
  base: Readonly<KeyedTable<T>> | Readonly<SlotTable<T>>,
  overlay: Readonly<KeyedTable<T>> | Readonly<SlotTable<T>>,
): (KeyedTable<T> & Entity) | (SlotTable<T> & Entity) {
  if (base.shape !== overlay.shape) {
    throw new Error(`concatRegistryTable: cannot compose a '${base.shape}' table with a '${overlay.shape}' table`);
  }
  if (base.registry !== overlay.registry) {
    throw new Error(
      `concatRegistryTable: cannot compose registry '${base.registry}' with registry '${overlay.registry}'`,
    );
  }
  if (base.onMiss !== overlay.onMiss) {
    throw new Error(
      `concatRegistryTable: cannot compose miss policy '${base.onMiss}' with miss policy '${overlay.onMiss}'`,
    );
  }

  if (base.shape === 'slot') {
    const overlaySlot = overlay as Readonly<SlotTable<T>>;
    // `null` on the overlay is "no opinion" — inherit. A tombstone is "explicitly omitted" and wins.
    const out = allocateEntity<SlotTable<T> & Entity>();
    out.entry = overlaySlot.entry ?? base.entry;
    out.onMiss = base.onMiss;
    out.registry = base.registry;
    out.shape = 'slot';
    return finishEntity(out);
  }

  const baseKeyed = base as Readonly<KeyedTable<T>>;
  const overlayKeyed = overlay as Readonly<KeyedTable<T>>;
  const entries = new Map<Kind, RegistryTableEntry<T>>(baseKeyed.entries);
  for (const [key, entry] of overlayKeyed.entries) {
    // The switch is what makes a THIRD state a build failure rather than a silent fall-through. Both
    // arms carry the entry forward; a tombstone is copied AS a tombstone, never resolved to a binding,
    // because resolving it here would resurrect the entry the overlay meant to omit.
    switch (entry.state) {
      case RegistryEntryState.Bound:
        entries.set(key, entry);
        break;
      case RegistryEntryState.Tombstoned:
        entries.set(key, entry);
        break;
      default: {
        const unreachable: never = entry;
        return unreachable;
      }
    }
  }
  const out = allocateEntity<KeyedTable<T> & Entity>();
  out.entries = entries;
  out.onMiss = baseKeyed.onMiss;
  out.registry = baseKeyed.registry;
  out.shape = 'keyed';
  return finishEntity(out);
}

/** An empty keyed table for `registry`, carrying the miss policy every replacement of it preserves. */
export function createKeyedTable<T>(registry: RegistryId, onMiss: RegistryMissPolicy): KeyedTable<T> & Entity {
  const out = allocateEntity<KeyedTable<T> & Entity>();
  out.entries = new Map();
  out.onMiss = onMiss;
  out.registry = registry;
  out.shape = 'keyed';
  return finishEntity(out);
}

/** An ordinal table over `vocabulary`, every ordinal unbound. */
export function createOrdinalTable<T>(
  registry: RegistryId,
  onMiss: RegistryMissPolicy,
  vocabulary: readonly Kind[],
): OrdinalTable<T> & Entity {
  const out = allocateEntity<OrdinalTable<T> & Entity>();
  out.entries = vocabulary.map(() => null);
  out.onMiss = onMiss;
  out.registry = registry;
  out.shape = 'ordinal';
  out.vocabulary = vocabulary;
  return finishEntity(out);
}

/** An empty slot table for `registry`. Its key is its own `RegistryId`. */
export function createSlotTable<T>(registry: RegistryId, onMiss: RegistryMissPolicy): SlotTable<T> & Entity {
  const out = allocateEntity<SlotTable<T> & Entity>();
  out.entry = null;
  out.onMiss = onMiss;
  out.registry = registry;
  out.shape = 'slot';
  return finishEntity(out);
}

// The hot-path ordinal form: a direct index, no hash and no string. Out-of-range returns `null`, which
// is the format's skip-what-you-do-not-know path rather than a miss — a caller distinguishing "unknown
// token" from "unregistered reader" compares the ordinal against `vocabulary.length`.
export function getOrdinalTableEntry<T>(table: Readonly<OrdinalTable<T>>, ordinal: number): T | null {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= table.entries.length) return null;
  return table.entries[ordinal];
}

// What is bound to `key`, or `null`.
//
// RESOLUTION collapses a tombstone to `null`, and that is correct rather than lossy: the caller asked
// what is bound and the answer is nothing. No tombstone escapes into caller code through this door,
// which is why this returns `T | null` while composition deals in entries.
export function getRegistryTableEntry<T>(table: Readonly<RegistryTable<T>>, key: Kind): T | null {
  const entry = getRegistryTableEntryState(table, key);
  if (entry === null || entry.state !== RegistryEntryState.Bound) return null;
  return entry.value;
}

// Clears `out`, then appends every BOUND key in sorted order — a tombstoned key is NOT listed, and a
// caller that enumerates and then resolves therefore cannot get `null` for a key this just reported.
// Sorting here rather than in storage is what lets the keyed shape stay a map.
export function getRegistryTableKeys(out: Kind[], table: Readonly<RegistryTable<unknown>>): void {
  out.length = 0;
  if (table.shape === 'keyed') {
    for (const [key, entry] of table.entries) {
      if (entry.state === RegistryEntryState.Bound) out.push(key);
    }
  } else if (table.shape === 'slot') {
    if (table.entry !== null && table.entry.state === RegistryEntryState.Bound) out.push(table.registry);
  } else {
    for (let ordinal = 0; ordinal < table.entries.length; ordinal++) {
      if (table.entries[ordinal] !== null) out.push(table.vocabulary[ordinal]);
    }
  }
  out.sort();
}

// FALSE for a tombstoned key — the same rule as `getRegistryTableKeys`, one call apart: `has` answering
// true where `get` answers null is that disagreement wearing a different name.
export function hasRegistryTableEntry(table: Readonly<RegistryTable<unknown>>, key: Kind): boolean {
  const entry = getRegistryTableEntryState(table, key);
  return entry !== null && entry.state === RegistryEntryState.Bound;
}

// NO OPINION. Removes `key` from the table entirely, so under composition the base's entry is INHERITED.
//
// The opposite of `withRegistryTableTombstone`: that one overrides the base with nothing, this one
// declines to override at all. There is no third union variant for this and there should not be — "no
// opinion" IS the key being absent from the map, so there is nothing to store and therefore nothing to
// type. Typing it would be the tombstone.
export function withoutRegistryTableEntry<T>(table: Readonly<KeyedTable<T>>, key: Kind): KeyedTable<T> & Entity {
  const entries = new Map(table.entries);
  entries.delete(key);
  const out = allocateEntity<KeyedTable<T> & Entity>();
  out.entries = entries;
  out.onMiss = table.onMiss;
  out.registry = table.registry;
  out.shape = 'keyed';
  return finishEntity(out);
}

// Binds `key` to `value`, returning a REPLACEMENT table. Not `setRegistryTableEntry`: this mutates
// nothing, and `set*` is reserved for in-place mutation. The owner assigns the result:
//   registries.textureResolvers = withRegistryTableEntry(registries.textureResolvers, kind, resolver);
export function withRegistryTableEntry<T>(table: Readonly<KeyedTable<T>>, key: Kind, value: T): KeyedTable<T> & Entity {
  const entries = new Map(table.entries);
  entries.set(key, { state: RegistryEntryState.Bound, value });
  const out = allocateEntity<KeyedTable<T> & Entity>();
  out.entries = entries;
  out.onMiss = table.onMiss;
  out.registry = table.registry;
  out.shape = 'keyed';
  return finishEntity(out);
}

// OMIT. Binds `key` to the tombstone: this table has an opinion about `key`, and the opinion is NOTHING.
// Under composition the overlay's tombstone WINS and the base's entry does not survive.
//
// The opposite of `withoutRegistryTableEntry`, which reads almost identically in English and composes the
// other way. Both leave `getRegistryTableEntry` answering `null` on a table with no base, so the
// difference is invisible until the table is composed. Choose by what you MEAN — override-with-nothing,
// or decline-to-override — never by which looks right at the call site.
export function withRegistryTableTombstone<T>(table: Readonly<KeyedTable<T>>, key: Kind): KeyedTable<T> & Entity {
  const entries = new Map(table.entries);
  entries.set(key, { state: RegistryEntryState.Tombstoned });
  const out = allocateEntity<KeyedTable<T> & Entity>();
  out.entries = entries;
  out.onMiss = table.onMiss;
  out.registry = table.registry;
  out.shape = 'keyed';
  return finishEntity(out);
}

// The stored entry for `key`, tombstones included — the shape-dispatch every resolution query shares.
// Deliberately not exported: entries are composition currency, and handing one to a caller that only
// wanted a value is how a tombstone reaches somewhere that has never heard of one.
function getRegistryTableEntryState<T>(table: Readonly<RegistryTable<T>>, key: Kind): RegistryTableEntry<T> | null {
  if (table.shape === 'keyed') return table.entries.get(key) ?? null;
  if (table.shape === 'slot') return key === table.registry ? table.entry : null;
  const ordinal = table.vocabulary.indexOf(key);
  if (ordinal === -1) return null;
  const value = table.entries[ordinal];
  return value === null ? null : { state: RegistryEntryState.Bound, value };
}
