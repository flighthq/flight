import type { Vector2 } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { geometryPoolReleaseGuard } from './geometryPoolGuards';
import { createVector2 } from './vector2';

export function acquireEmptyVector2(): Vector2 {
  const v = acquireVector2();
  v.x = 0;
  v.y = 0;
  return v;
}

// Acquires without initializing the components. Use acquireEmptyVector2 when a zero value is required.
export function acquireVector2(): Vector2 {
  return pool.length > 0 ? (pool.pop() as Vector2) : createVector2();
}

export function clearVector2Pool(): void {
  pool.length = 0;
}

export function releaseVector2(v: Vector2): void {
  if (!v) return;
  if (geometryPoolReleaseGuard !== null && pool.includes(v)) geometryPoolReleaseGuard('releaseVector2');
  v[EntityRuntimeKey] = undefined;
  pool.push(v);
}

const pool: Vector2[] = [];
