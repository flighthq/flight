import type { Vector4 } from '@flighthq/types';

import { createVector4 } from './vector4';

export function acquireEmptyVector4(): Vector4 {
  const v = acquireVector4();
  v.x = 0;
  v.y = 0;
  v.z = 0;
  v.w = 0;
  return v;
}

export function acquireVector4(): Vector4 {
  let v: Vector4;

  if (pool.length > 0) {
    v = pool.pop() as Vector4;
  } else {
    v = createVector4();
  }

  return v;
}

export function clearVector4Pool(): void {
  pool.length = 0;
}

export function releaseVector4(v: Vector4): void {
  if (!v) return;
  pool.push(v);
}

const pool: Vector4[] = [];
