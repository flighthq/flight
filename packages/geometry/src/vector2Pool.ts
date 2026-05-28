import type { Vector2 } from '@flighthq/types';

import { createVector2 as create } from './vector2';

export function clear(): void {
  pool.length = 0;
}

export function get(): Vector2 {
  return pool.length > 0 ? (pool.pop() as Vector2) : create();
}

export function getEmpty(): Vector2 {
  const v = get();
  v.x = 0;
  v.y = 0;
  return v;
}

export function release(v: Vector2): void {
  if (!v) return;
  pool.push(v);
}

const pool: Vector2[] = [];
