import type { Snapshot } from '@flighthq/types';

/** Deep structural equality between two snapshots: `true` when they have the same shape and every
 *  leaf value is strictly equal.
 *
 *  Objects must have the same own keys; arrays must have the same length with element-wise equal
 *  entries. Leaves are compared with `===`, so `NaN` never equals itself and `-0`/`+0` are equal.
 *  Used to detect whether state actually changed before pushing an undo entry or sending a frame.
 */
export function snapshotsEqual<T>(a: Snapshot<T>, b: Snapshot<T>): boolean {
  return snapshotValuesEqual(a, b);
}

function snapshotValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) {
    return false;
  }
  if (aIsArray) {
    const aArray = a as unknown[];
    const bArray = b as unknown[];
    if (aArray.length !== bArray.length) {
      return false;
    }
    for (let index = 0; index < aArray.length; index += 1) {
      if (!snapshotValuesEqual(aArray[index], bArray[index])) {
        return false;
      }
    }
    return true;
  }
  const aObject = a as Record<string, unknown>;
  const bObject = b as Record<string, unknown>;
  const aKeys = Object.keys(aObject);
  if (aKeys.length !== Object.keys(bObject).length) {
    return false;
  }
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObject, key)) {
      return false;
    }
    if (!snapshotValuesEqual(aObject[key], bObject[key])) {
      return false;
    }
  }
  return true;
}
