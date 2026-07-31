import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setSnapshotCaptureGuard } from './captureSnapshot';

/** Uninstalls the guard installed by `enableSnapshotGuards`. */
export function disableSnapshotGuards(): void {
  setSnapshotCaptureGuard(null);
}

/**
 * Installs the caller-facing snapshot guard (opt-in, dev-only). It inspects each `captureSnapshot`
 * source and warns once — through `@flighthq/log` — about the two shapes that pass `structuredClone`
 * but then break the guarantees the rest of the package is built on.
 *
 * **Non-plain values.** `Map`, `Set`, `Date`, and typed arrays clone successfully, so capture appears
 * to work, but neither of the package's two contracts survives: `Object.freeze` on a `Map` leaves
 * `set`/`delete` fully functional, so the snapshot is not immutable, and `equalsSnapshot` compares
 * leaves with `===`, so two `Map`s holding identical entries — or two `Date`s at the same instant —
 * are reported unequal. State that looks unchanged then pushes a fresh undo entry every frame.
 *
 * **Cycles.** The package contract is acyclic plain data, narrower than structured-cloneable on
 * purpose: `structuredClone` supports cycles and `captureSnapshot` handles them, but `equalsSnapshot`,
 * `interpolateSnapshots`, and `restoreSnapshot` all recurse without tracking what they have visited,
 * and adding a visited set would tax every acyclic walk in the per-frame path. So a cycle is programmer
 * error, and this is where it becomes diagnosable rather than a stack overflow several frames later. `restoreSnapshot`
 * is the one that hides: the first restore into a fresh target clones and succeeds, and only the
 * second — once the target itself holds the cycle — recurses forever. A `RangeError` with no Flight
 * frame in the stack is the least diagnosable failure in the package, which is why it is worth a
 * message at the point the cyclic state is captured rather than several frames later.
 *
 * Not importing this module costs production nothing: the messages and the `@flighthq/log` dependency
 * live only here.
 */
export function enableSnapshotGuards(): void {
  setSnapshotCaptureGuard(warnOnUnsupportedSnapshotSource);
}

// Walks the source once, reporting the first occurrence of each problem kind. Tracks visited objects
// so the walk itself terminates on the very cycles it is looking for.
function warnOnUnsupportedSnapshotSource(source: unknown): void {
  const seen = new Set<object>();
  const nonPlain = new Set<string>();
  let cyclic = false;

  const visit = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return;
    if (seen.has(value)) {
      cyclic = true;
      return;
    }
    seen.add(value);
    const kind = nonPlainSnapshotKind(value);
    if (kind !== null) {
      nonPlain.add(kind);
      // A non-plain container's contents are not part of the plain-data tree; naming the container is
      // the actionable half, and descending into a Map's entries would only repeat it.
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    for (const key of Object.keys(value as Record<string, unknown>)) {
      visit((value as Record<string, unknown>)[key]);
    }
  };
  visit(source);

  if (nonPlain.size > 0) {
    logOnce(
      'snapshot:non-plain-source',
      LogLevel.Warn,
      {
        message:
          `captureSnapshot: source contains non-plain value(s) (${Array.from(nonPlain).sort().join(', ')}). ` +
          'They clone, but a frozen Map/Set stays mutable and equalsSnapshot compares them by reference, ' +
          'so the snapshot is neither immutable nor comparable. Convert to plain arrays/objects first.',
      },
      'snapshot',
    );
  }
  if (cyclic) {
    logOnce(
      'snapshot:cyclic-source',
      LogLevel.Warn,
      {
        message:
          'captureSnapshot: source contains a cycle. Capture handles it, but equalsSnapshot, ' +
          'interpolateSnapshots, and restoreSnapshot recurse without cycle tracking and will overflow ' +
          'the stack — restoreSnapshot only on the second restore into the same target.',
      },
      'snapshot',
    );
  }
}

// Names the non-plain built-ins that structuredClone accepts, so the warning can say which one was
// found. Anything structuredClone rejects outright (functions, class instances) already throws at the
// capture call and needs no guard.
function nonPlainSnapshotKind(value: object): string | null {
  if (value instanceof Map) return 'Map';
  if (value instanceof Set) return 'Set';
  if (value instanceof Date) return 'Date';
  if (value instanceof RegExp) return 'RegExp';
  if (ArrayBuffer.isView(value)) return 'TypedArray';
  if (value instanceof ArrayBuffer) return 'ArrayBuffer';
  return null;
}
