import type { Matrix3x3 } from '@flighthq/types';

import { createMatrix3x3, mat3x3Identity } from './matrix3x3';

export function mat3x3PoolClear(): void {
  pool.length = 0;
}

export function mat3x3PoolGet(): Matrix3x3 {
  let m: Matrix3x3;

  if (pool.length > 0) {
    m = pool.pop() as Matrix3x3;
  } else {
    m = createMatrix3x3();
  }

  return m;
}

export function mat3x3PoolGetIdentity(): Matrix3x3 {
  const m = mat3x3PoolGet();
  mat3x3Identity(m);
  return m;
}

export function mat3x3PoolRelease(m: Matrix3x3): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix3x3[] = [];
