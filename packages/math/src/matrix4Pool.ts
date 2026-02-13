import type { Matrix4 } from '@flighthq/types';

import { create, identity } from './matrix4.js';

export function clear(): void {
  pool.length = 0;
}

export function get(): Matrix4 {
  let m: Matrix4;

  if (pool.length > 0) {
    m = pool.pop() as Matrix4;
  } else {
    m = create();
  }

  return m;
}

export function getIdentity(): Matrix4 {
  const m = get();
  identity(m);
  return m;
}

export function release(m: Matrix4): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix4[] = [];
