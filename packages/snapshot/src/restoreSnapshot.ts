import type { Snapshot } from '@flighthq/types';

/** Restore `snapshot` back into the live mutable `target`, deep-assigning every field in place.
 *
 *  `target` keeps its own object identity — this mutates the caller's live state rather than
 *  replacing it. Where `target` already holds a compatible nested object or array, that container is
 *  reused and mutated in place (preserving its identity too); otherwise a fresh mutable clone of the
 *  snapshot's subtree is assigned, so the restored state never aliases the frozen snapshot and stays
 *  freely mutable.
 *
 *  Array handling: a target array is resized to the snapshot array's length — extra tail elements are
 *  dropped, missing elements are added — then each element is restored positionally.
 *
 *  A top-level primitive snapshot has nothing to assign into a live reference and is a no-op.
 */
export function restoreSnapshot<T>(snapshot: Snapshot<T>, target: T): void {
  if (snapshot === null || typeof snapshot !== 'object' || target === null || typeof target !== 'object') {
    return;
  }
  restoreSnapshotInto(target as object, snapshot as object);
}

// Deep-assigns every own key of `source` into `target`, recursing through compatible nested
// containers and resizing arrays to match. Both are known to be objects/arrays here.
function restoreSnapshotInto(target: object, source: object): void {
  if (Array.isArray(source)) {
    const targetArray = target as unknown[];
    const sourceArray = source as unknown[];
    targetArray.length = sourceArray.length;
    for (let index = 0; index < sourceArray.length; index += 1) {
      targetArray[index] = restoreSnapshotValue(targetArray[index], sourceArray[index]);
    }
    return;
  }
  const targetObject = target as Record<string, unknown>;
  const sourceObject = source as Record<string, unknown>;
  for (const key of Object.keys(sourceObject)) {
    targetObject[key] = restoreSnapshotValue(targetObject[key], sourceObject[key]);
  }
}

// Resolves the value to store for one field: primitives pass through; an object/array reuses a
// compatible mutable container in `targetValue` (mutated in place) or is cloned fresh and mutable.
function restoreSnapshotValue(targetValue: unknown, sourceValue: unknown): unknown {
  if (sourceValue === null || typeof sourceValue !== 'object') {
    return sourceValue;
  }
  const sourceIsArray = Array.isArray(sourceValue);
  if (targetValue !== null && typeof targetValue === 'object' && Array.isArray(targetValue) === sourceIsArray) {
    restoreSnapshotInto(targetValue as object, sourceValue as object);
    return targetValue;
  }
  return structuredClone(sourceValue);
}
