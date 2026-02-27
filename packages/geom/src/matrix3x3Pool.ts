import type { Matrix3x3 } from '@flighthq/types';

import { create, identity } from './matrix3x3.js';

export function clear(): void {
  pool.length = 0;
}

export function get(): Matrix3x3 {
  let m: Matrix3x3;

  if (pool.length > 0) {
    m = pool.pop() as Matrix3x3;
  } else {
    m = create();
  }

  return m;
}

export function getIdentity(): Matrix3x3 {
  const m = get();
  identity(m);
  return m;
}

export function release(m: Matrix3x3): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix3x3[] = [];
