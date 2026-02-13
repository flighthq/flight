import type { Vector3 } from '@flighthq/types';

import { create } from './vector3.js';

export function clear(): void {
  pool.length = 0;
}

export function get(): Vector3 {
  let v: Vector3;

  if (pool.length > 0) {
    v = pool.pop() as Vector3;
  } else {
    v = create();
  }

  return v;
}

export function getEmpty(): Vector3 {
  const v = get();
  v.x = 0;
  v.y = 0;
  v.z = 0;
  return v;
}

export function release(v: Vector3): void {
  if (!v) return;
  pool.push(v);
}

const pool: Vector3[] = [];
