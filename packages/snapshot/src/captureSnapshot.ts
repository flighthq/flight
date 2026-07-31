import type { Snapshot } from '@flighthq/types/contract';

/** Capture `source` into an immutable snapshot: a deep clone of the plain state, deep-frozen so
 *  nothing can mutate it afterward.
 *
 *  The clone means the returned snapshot does not alias `source` — mutating `source` later never
 *  affects the snapshot, and vice versa. The freeze makes it a fixed point-in-time value safe to
 *  store in an undo stack, send over the wire, or interpolate toward.
 *
 *  `source` must be plain, **acyclic**, structured-cloneable data (numbers, strings, booleans, arrays,
 *  nested objects). Passing a class instance, function, or other non-cloneable value is programmer
 *  error and throws via `structuredClone`.
 *
 *  Acyclic is a narrower contract than structured-cloneable, and deliberately so. `structuredClone`
 *  itself handles cycles, and capture handles them too — but `equalsSnapshot`, `interpolateSnapshots`,
 *  and `restoreSnapshot` walk a snapshot without tracking what they have visited, and giving them a
 *  visited set would tax every acyclic walk in the common per-frame netcode path to serve a shape
 *  almost no game state has. So a cycle is programmer error here, not a supported input. Import
 *  `enableSnapshotGuards` to have it reported at capture time, where it is diagnosable, rather than as
 *  a stack overflow several frames later.
 */
export function captureSnapshot<T>(source: Readonly<T>): Snapshot<T> {
  _captureGuard?.(source);
  const clone = structuredClone(source) as T;
  freezeSnapshotDeep(clone);
  return clone as Snapshot<T>;
}

/** Installs the capture-time guard, or clears it with `null`. The seam exists so the message and the
 *  `@flighthq/log` dependency live in the separately-importable guard module rather than here; not
 *  importing that module costs production nothing. Called by `enableSnapshotGuards`, not directly. */
export function setSnapshotCaptureGuard(guard: ((source: unknown) => void) | null): void {
  _captureGuard = guard;
}

let _captureGuard: ((source: unknown) => void) | null = null;

// Recursively `Object.freeze`s every object and array reachable from `value`, so the whole tree is
// immutable — not just the top level. Primitives and `null` are already immutable and skipped.
//
// `Object.isFrozen` doubles as the visited check. structuredClone preserves cycles and shared
// references, so without it a cyclic clone recurses until the stack overflows, and a diamond is walked
// once per path. Freezing before descending means an already-frozen node has been seen, which makes
// the walk terminate on cycles and linear on shared subtrees, with no side table to allocate.
function freezeSnapshotDeep(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
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
