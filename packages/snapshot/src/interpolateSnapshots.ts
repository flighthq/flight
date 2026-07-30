import { clamp, lerp } from '@flighthq/math/contract';
import type { Snapshot, SnapshotSchema } from '@flighthq/types/contract';

/** Interpolate between two snapshots into a live mutable `out`, the "tween over instances" for smooth
 *  netcode/replay rendering between two fixed frames.
 *
 *  `t` is clamped to `[0, 1]`. For each numeric leaf present as a number in both `a` and `b`, `out`
 *  receives `lerp(a, b, t)`. Every non-numeric leaf — strings, booleans, `null`/`undefined`, or a
 *  slot that is a number in only one snapshot — snaps to the destination value from `b` (cloned so
 *  `out` stays mutable and unaliased). Nested objects and arrays are walked recursively; arrays are
 *  resized to `b`'s length and interpolated positionally.
 *
 *  With a `schema` (dot-separated paths from the root, array elements by index), only numeric leaves
 *  whose path is listed interpolate; every other numeric leaf snaps to `b` — how a numeric id or
 *  discrete count is kept from blending. Without a schema, all numeric leaves interpolate.
 *
 *  `out` may be a separate live object; it is read from `a`/`b` and written field by field, so it can
 *  safely be the caller's render-state object.
 */
export function interpolateSnapshots<T>(
  a: Snapshot<T>,
  b: Snapshot<T>,
  t: number,
  out: T,
  schema?: Readonly<SnapshotSchema>,
): void {
  if (
    a === null ||
    typeof a !== 'object' ||
    b === null ||
    typeof b !== 'object' ||
    out === null ||
    typeof out !== 'object'
  ) {
    return;
  }
  // The schema is compiled to a Set once per call rather than scanned per leaf: SnapshotSchema is a
  // readonly string[], so the old per-leaf `includes` was linear in the schema on every numeric field.
  // `undefined` (no schema, every numeric leaf interpolates) stays distinct from an empty Set (a schema
  // that lists nothing, so nothing interpolates) — collapsing those two inverts the caller's intent.
  const paths = schema === undefined ? undefined : new Set(schema);
  interpolateSnapshotsInto(out as object, a as object, b as object, clamp(t, 0, 1), paths, '');
}

// Walks `b` (the destination shape) key by key, writing each interpolated or snapped field into
// `out`, reading the matching value from `a`. `prefix` is the dotted path to the current container.
function interpolateSnapshotsInto(
  out: object,
  a: object,
  b: object,
  t: number,
  paths: ReadonlySet<string> | undefined,
  prefix: string,
): void {
  const outRecord = out as Record<string, unknown>;
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  if (Array.isArray(b)) {
    (out as unknown[]).length = (b as unknown[]).length;
  }
  for (const key of Object.keys(bRecord)) {
    const aValue = aRecord[key];
    const bValue = bRecord[key];
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      // With no schema every numeric leaf interpolates, so the dotted path is never consulted — and
      // building it was the walk's main per-leaf allocation. Only pay for it when a schema exists.
      outRecord[key] = paths === undefined || paths.has(snapshotPath(prefix, key)) ? lerp(aValue, bValue, t) : bValue;
      continue;
    }
    if (
      aValue !== null &&
      typeof aValue === 'object' &&
      bValue !== null &&
      typeof bValue === 'object' &&
      Array.isArray(aValue) === Array.isArray(bValue)
    ) {
      const container = ensureSnapshotContainer(outRecord[key], Array.isArray(bValue));
      outRecord[key] = container;
      interpolateSnapshotsInto(
        container,
        aValue,
        bValue,
        t,
        paths,
        paths === undefined ? '' : snapshotPath(prefix, key),
      );
      continue;
    }
    outRecord[key] = cloneSnapshotValue(bValue);
  }
}

// Joins a container prefix and key into the dotted path a schema lists.
function snapshotPath(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}.${key}`;
}

// Reuses `existing` when it is already a mutable container of the needed kind, else allocates a fresh
// empty one, so the walk can recurse into `out` even when `out` did not mirror the snapshot's shape.
function ensureSnapshotContainer(existing: unknown, isArray: boolean): object {
  if (existing !== null && typeof existing === 'object' && Array.isArray(existing) === isArray) {
    return existing as object;
  }
  return isArray ? [] : {};
}

// Snaps a non-interpolated value into `out`: primitives pass through; an object/array is deep-cloned
// so `out` holds a fresh mutable copy rather than aliasing the frozen snapshot.
function cloneSnapshotValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return structuredClone(value);
}
