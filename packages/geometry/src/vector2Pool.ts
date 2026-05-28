import type { Vector2 } from '@flighthq/types';

import { createVector2 } from './vector2';

export function vec2PoolClear(): void {
  pool.length = 0;
}

export function vec2PoolGet(): Vector2 {
  return pool.length > 0 ? (pool.pop() as Vector2) : createVector2();
}

export function vec2PoolGetEmpty(): Vector2 {
  const v = vec2PoolGet();
  v.x = 0;
  v.y = 0;
  return v;
}

export function vec2PoolRelease(v: Vector2): void {
  if (!v) return;
  pool.push(v);
}

const pool: Vector2[] = [];
