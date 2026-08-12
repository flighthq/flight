import type { Rectangle } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { geometryPoolReleaseGuard } from './geometryPoolGuards';
import { createRectangle } from './rectangle';

export function acquireEmptyRectangle(): Rectangle {
  const r = acquireRectangle();
  r.x = 0;
  r.y = 0;
  r.width = 0;
  r.height = 0;
  return r;
}

// Acquires without initializing the fields. Use acquireEmptyRectangle when an empty value is required.
export function acquireRectangle(): Rectangle {
  let r: Rectangle;

  if (pool.length > 0) {
    r = pool.pop() as Rectangle;
  } else {
    r = createRectangle();
  }

  return r;
}

export function clearRectanglePool(): void {
  pool.length = 0;
}

export function releaseRectangle(r: Rectangle): void {
  if (!r) return;
  if (geometryPoolReleaseGuard !== null && pool.includes(r)) geometryPoolReleaseGuard('releaseRectangle');
  r[EntityRuntimeKey] = undefined;
  pool.push(r);
}

const pool: Rectangle[] = [];
