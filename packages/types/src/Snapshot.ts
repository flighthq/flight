// Snapshot header. `@flighthq/snapshot` captures a plain state object into an immutable `Snapshot`
// value (deep-cloned and deep-frozen), restores a snapshot back into live mutable state, and
// interpolates between two snapshots. It is the primitive under save/load, undo/redo, netcode
// interpolation, and replay: an immutable point-in-time capture of "what the app was at this
// instant" that can be stored, sent, rewound, or tweened toward. Snapshots are of plain,
// deep-cloneable data (numbers, strings, booleans, arrays, nested objects) — not class instances or
// entity-runtime objects.

// Recursively marks every property of `T` as `readonly`, all the way down through nested objects and
// arrays. A `Snapshot` is deeply immutable at the type level (and deep-frozen at runtime), so the
// compiler rejects any write into a captured value, mirroring the `Object.freeze` applied by
// `captureSnapshot`. Primitives pass through unchanged.
export type DeepReadonly<T> = T extends (infer Element)[]
  ? ReadonlyArray<DeepReadonly<Element>>
  : T extends readonly (infer Element)[]
    ? ReadonlyArray<DeepReadonly<Element>>
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

// An immutable point-in-time capture of a plain state value `T`. `captureSnapshot` produces one by
// deep-cloning its source and deep-freezing the clone, so a `Snapshot` never changes after capture
// and does not alias the live state it came from — the contract that makes undo, netcode, replay,
// and interpolation correct (no accidental mutation of a stored frame).
export type Snapshot<T> = DeepReadonly<T>;

// Selects which numeric leaf fields `interpolateSnapshots` may interpolate, as a list of
// dot-separated paths from the state root. Array elements use their numeric index, e.g.
// `'players.0.health'`. A numeric leaf whose path is listed is `lerp`-ed between the two snapshots;
// every other numeric leaf snaps to the destination snapshot instead. Passing no schema interpolates
// all numeric leaves (auto-detect); a schema is how a numeric field that must not blend — an id, an
// enum-as-number, a discrete count — is excluded.
export type SnapshotSchema = readonly string[];
