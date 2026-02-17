import type { Matrix3x2 } from '@flighthq/types';

import { create, identity } from './matrix3x2.js';

export function clear(): void {
  pool.length = 0;
}

export function get(): Matrix3x2 {
  let m: Matrix3x2;

  if (pool.length > 0) {
    m = pool.pop() as Matrix3x2;
  } else {
    m = create();
  }

  return m;
}

export function getIdentity(): Matrix3x2 {
  const m = get();
  identity(m);
  return m;
}

export function release(m: Matrix3x2): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix3x2[] = [];
