import type { Kind } from './Entity';

// A registry's identity, used to report a miss against the registry that would have served it and to
// refuse composition between two tables that are not the same registry.
export type RegistryId = string;

// What one registered key holds.
//
// `bound` carries the value; `tombstoned` carries nothing and means "this table has an opinion about
// this key, and the opinion is NOTHING". A key ABSENT from the table is the third meaning — "no
// opinion" — and it is deliberately not a variant here: there is nothing to store for it, and typing it
// would BE the tombstone. Three meanings, two stored states, the third is the absence.
//
// This is a union of SHAPES rather than a flag or a reserved value, and that is the requirement rather
// than a style choice: a flag (`{ value: T; omitted?: boolean }`) and a reserved value both TYPE-CHECK
// at every site that has never heard of tombstones, so neither can fail a build. This union is NOT
// assignable to `T`, so the only way to reach a value is to narrow, and the only way to narrow is to
// have handled both cases.
export type RegistryTableEntry<T> =
  | { readonly state: typeof RegistryEntryState.Bound; readonly value: T }
  | { readonly state: typeof RegistryEntryState.Tombstoned };

// The discriminant values, as a const object plus its derived type — the spelling `SceneCoverage` and
// the rest of this package already use. The union of shapes above cannot collapse into a const object,
// because its variants carry different payloads, which is the whole point; only the VALUES follow the
// existing precedent, so there are not two spellings of the same idea in one file.
export const RegistryEntryState = {
  Bound: 'bound',
  Tombstoned: 'tombstoned',
} as const;

export type RegistryEntryState = (typeof RegistryEntryState)[keyof typeof RegistryEntryState];

// Common to every table shape.
//
// NOTE: the miss-policy field is deliberately ABSENT rather than placeheld. Its vocabulary is pending a
// ruling, and the previously published union is retired — declaring a stand-in here (a string alias, or
// the retired union under a new name) would re-derive the thing that was retired, one indirection away,
// and would read as settled to everyone downstream. The gap is labelled instead of filled. See
// `concatRegistryTable`, which implements every mismatch refusal EXCEPT the policy one for this reason.
export interface RegistryTableBase {
  readonly registry: RegistryId;
}

// Open `Kind` → entry lookup, last write wins. The default shape; what every unremarkable registry is.
//
// `entries` holds `RegistryTableEntry<T>` rather than `T` for two reasons, both load-bearing. It is the
// only place a tombstone can be represented at all — a sentinel the storage cannot hold is not a
// sentinel. And because these tables are plain data with PUBLIC fields, an assembly can iterate
// `table.entries` without calling any function of ours; holding the union means that loop fails to
// compile until it narrows, so the constraint defends the FIELD and not merely the function.
//
// `ReadonlyMap`, not `Map`: `readonly entries` freezes the field and leaves the map mutable, which a
// persistent table cannot survive — a replacement table means nothing if a caller can mutate the map
// that both tables share.
export interface KeyedTable<T> extends RegistryTableBase {
  readonly entries: ReadonlyMap<Kind, RegistryTableEntry<T>>;
  readonly shape: 'keyed';
}

// A one-element vocabulary: the capability is present or it is not. Its key is its own `RegistryId`, so
// a miss reports once rather than once per kind that wanted it. `entry` is nullable for the same reason
// a keyed table omits a key — `null` is "no opinion", a tombstone is "explicitly omitted".
export interface SlotTable<T> extends RegistryTableBase {
  readonly entry: RegistryTableEntry<T> | null;
  readonly shape: 'slot';
}

// A dense array indexed by a token the wire format already carries as a small integer. `vocabulary` maps
// ordinal to `Kind` so a miss can be named; the hot path never consults it, because the decoder already
// holds the integer.
//
// It carries NO tombstone and NO composition operations, BECAUSE NOTHING COMPOSES IT. That is a fact
// rather than a preference: no overlay omits a wire-format token reader, and out-of-range is already the
// format's own skip path. So this is not "the composable table minus the sentinel" — it is a
// structurally different type that cannot be passed where a composable table is expected, so the
// exemption cannot be rediscovered later as a quiet third meaning. Adding a composition operation here
// is the trigger to revisit, and the hot-path cost of a discriminant read must be MEASURED before the
// type is weakened.
export interface OrdinalTable<T> extends RegistryTableBase {
  readonly entries: readonly (T | null)[];
  readonly shape: 'ordinal';
  readonly vocabulary: readonly Kind[];
}

// Closed by design: entries are open forever, shapes are not. Plain data with a discriminant rather than
// a method table, so a table lowers to a C/C++ struct and a hot path reads its concrete member without
// dispatch.
export type RegistryTable<T> = KeyedTable<T> | OrdinalTable<T> | SlotTable<T>;
