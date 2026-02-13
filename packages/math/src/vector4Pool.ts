import type { Vector4 } from '@flighthq/types';

import { create } from './vector4.js';

export function clear(): void {
  pool.length = 0;
}

export function get(): Vector4 {
  let v: Vector4;

  if (pool.length > 0) {
    v = pool.pop() as Vector4;
  } else {
    v = create();
  }

  return v;
}

export function getEmpty(): Vector4 {
  const v = get();
  v.x = 0;
  v.y = 0;
  v.z = 0;
  v.w = 0;
  return v;
}

export function release(v: Vector4): void {
  if (!v) return;
  pool.push(v);
}

const pool: Vector4[] = [];
