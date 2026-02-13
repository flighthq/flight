import type { Matrix2D } from '@flighthq/types';

import { create, identity } from './matrix2D.js';

export function clear(): void {
  pool.length = 0;
}

export function get(): Matrix2D {
  let m: Matrix2D;

  if (pool.length > 0) {
    m = pool.pop() as Matrix2D;
  } else {
    m = create();
  }

  return m;
}

export function getIdentity(): Matrix2D {
  const m = get();
  identity(m);
  return m;
}

export function release(m: Matrix2D): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix2D[] = [];
