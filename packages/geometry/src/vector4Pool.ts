import type { Vector4 } from '@flighthq/types';

import { createVector4 } from './vector4';

export function vec4PoolClear(): void {
  pool.length = 0;
}

export function vec4PoolGet(): Vector4 {
  let v: Vector4;

  if (pool.length > 0) {
    v = pool.pop() as Vector4;
  } else {
    v = createVector4();
  }

  return v;
}

export function vec4PoolGetEmpty(): Vector4 {
  const v = vec4PoolGet();
  v.x = 0;
  v.y = 0;
  v.z = 0;
  v.w = 0;
  return v;
}

export function vec4PoolRelease(v: Vector4): void {
  if (!v) return;
  pool.push(v);
}

const pool: Vector4[] = [];
