import type { Matrix3 } from '@flighthq/types';

import { createMatrix3, identityMatrix3 } from './matrix3';

export function clearMatrix3Pool(): void {
  pool.length = 0;
}

export function acquireMatrix3(): Matrix3 {
  let m: Matrix3;

  if (pool.length > 0) {
    m = pool.pop() as Matrix3;
  } else {
    m = createMatrix3();
  }

  return m;
}

export function acquireIdentityMatrix3(): Matrix3 {
  const m = acquireMatrix3();
  identityMatrix3(m);
  return m;
}

export function releaseMatrix3(m: Matrix3): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix3[] = [];
