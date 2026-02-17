import type { Matrix4x4 } from '@flighthq/types';

import { create, identity } from './matrix4x4.js';

export function clear(): void {
  pool.length = 0;
}

export function get(): Matrix4x4 {
  let m: Matrix4x4;

  if (pool.length > 0) {
    m = pool.pop() as Matrix4x4;
  } else {
    m = create();
  }

  return m;
}

export function getIdentity(): Matrix4x4 {
  const m = get();
  identity(m);
  return m;
}

export function release(m: Matrix4x4): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix4x4[] = [];
