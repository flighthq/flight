import type { Matrix4x4 } from '@flighthq/types';

import { createMatrix4x4, mat4x4Identity } from './matrix4x4';

export function mat4x4PoolClear(): void {
  pool.length = 0;
}

export function mat4x4PoolGet(): Matrix4x4 {
  let m: Matrix4x4;

  if (pool.length > 0) {
    m = pool.pop() as Matrix4x4;
  } else {
    m = createMatrix4x4();
  }

  return m;
}

export function mat4x4PoolGetIdentity(): Matrix4x4 {
  const m = mat4x4PoolGet();
  mat4x4Identity(m);
  return m;
}

export function mat4x4PoolRelease(m: Matrix4x4): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix4x4[] = [];
