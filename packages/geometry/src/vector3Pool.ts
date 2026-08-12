import type { Vector3 } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { geometryPoolReleaseGuard } from './geometryPoolGuards';
import { createVector3 } from './vector3';

export function acquireEmptyVector3(): Vector3 {
  const v = acquireVector3();
  v.x = 0;
  v.y = 0;
  v.z = 0;
  return v;
}

// Acquires without initializing the components. Use acquireEmptyVector3 when a zero value is required.
export function acquireVector3(): Vector3 {
  let v: Vector3;

  if (pool.length > 0) {
    v = pool.pop() as Vector3;
  } else {
    v = createVector3();
  }

  return v;
}

export function clearVector3Pool(): void {
  pool.length = 0;
}

export function releaseVector3(v: Vector3): void {
  if (!v) return;
  if (geometryPoolReleaseGuard !== null && pool.includes(v)) geometryPoolReleaseGuard('releaseVector3');
  v[EntityRuntimeKey] = undefined;
  pool.push(v);
}

const pool: Vector3[] = [];
