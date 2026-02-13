import type { Matrix3 } from '@flighthq/types';

import { create, identity } from './matrix3.js';

export function clear(): void {
  pool.length = 0;
}

export function get(): Matrix3 {
  let m: Matrix3;

  if (pool.length > 0) {
    m = pool.pop() as Matrix3;
  } else {
    m = create();
  }

  return m;
}

export function getIdentity(): Matrix3 {
  const m = get();
  identity(m);
  return m;
}

export function release(m: Matrix3): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix3[] = [];
