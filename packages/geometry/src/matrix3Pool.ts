import type { Matrix3 } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { geometryPoolReleaseGuard } from './geometryPoolGuards';
import { createMatrix3, setMatrix3Identity } from './matrix3';

export function acquireIdentityMatrix3(): Matrix3 {
  const m = acquireMatrix3();
  setMatrix3Identity(m);
  return m;
}

// Acquires without initializing the elements. Use acquireIdentityMatrix3 when a known value is required.
export function acquireMatrix3(): Matrix3 {
  let m: Matrix3;

  if (pool.length > 0) {
    m = pool.pop() as Matrix3;
  } else {
    m = createMatrix3();
  }

  return m;
}

export function clearMatrix3Pool(): void {
  pool.length = 0;
}

export function releaseMatrix3(m: Matrix3): void {
  if (!m) return;
  if (geometryPoolReleaseGuard !== null && pool.includes(m)) geometryPoolReleaseGuard('releaseMatrix3');
  m[EntityRuntimeKey] = undefined;
  pool.push(m);
}

const pool: Matrix3[] = [];
