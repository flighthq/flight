import type { Snapshot } from '@flighthq/types';

/** Capture `source` into an immutable snapshot: a deep clone of the plain state, deep-frozen so
 *  nothing can mutate it afterward.
 *
 *  The clone means the returned snapshot does not alias `source` — mutating `source` later never
 *  affects the snapshot, and vice versa. The freeze makes it a fixed point-in-time value safe to
 *  store in an undo stack, send over the wire, or interpolate toward.
 *
 *  `source` must be plain, structured-cloneable data (numbers, strings, booleans, arrays, nested
 *  objects). Passing a class instance, function, or other non-cloneable value is programmer error and
 *  throws via `structuredClone`.
 */
export function captureSnapshot<T>(source: Readonly<T>): Snapshot<T> {
  const clone = structuredClone(source) as T;
  freezeSnapshotDeep(clone);
  return clone as Snapshot<T>;
}

// Recursively `Object.freeze`s every object and array reachable from `value`, so the whole tree is
// immutable — not just the top level. Primitives and `null` are already immutable and skipped.
function freezeSnapshotDeep(value: unknown): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      freezeSnapshotDeep(value[index]);
    }
    return;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    freezeSnapshotDeep((value as Record<string, unknown>)[key]);
  }
}
