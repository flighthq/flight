import type { Matrix3x2 } from '@flighthq/types';

import { createMatrix3x2, mat3x2Identity } from './matrix3x2';

export function mat3x2PoolClear(): void {
  pool.length = 0;
}

export function mat3x2PoolGet(): Matrix3x2 {
  let m: Matrix3x2;

  if (pool.length > 0) {
    m = pool.pop() as Matrix3x2;
  } else {
    m = createMatrix3x2();
  }

  return m;
}

export function mat3x2PoolGetIdentity(): Matrix3x2 {
  const m = mat3x2PoolGet();
  mat3x2Identity(m);
  return m;
}

export function mat3x2PoolRelease(m: Matrix3x2): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix3x2[] = [];
