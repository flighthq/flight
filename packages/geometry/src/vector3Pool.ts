import type { Vector3 } from '@flighthq/types';

import { createVector3 } from './vector3';

export function vec3PoolClear(): void {
  pool.length = 0;
}

export function vec3PoolGet(): Vector3 {
  let v: Vector3;

  if (pool.length > 0) {
    v = pool.pop() as Vector3;
  } else {
    v = createVector3();
  }

  return v;
}

export function vec3PoolGetEmpty(): Vector3 {
  const v = vec3PoolGet();
  v.x = 0;
  v.y = 0;
  v.z = 0;
  return v;
}

export function vec3PoolRelease(v: Vector3): void {
  if (!v) return;
  pool.push(v);
}

const pool: Vector3[] = [];
