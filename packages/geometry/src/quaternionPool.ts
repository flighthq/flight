import type { Quaternion } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { geometryPoolReleaseGuard } from './geometryPoolGuards';
import { createQuaternion } from './quaternion';

export function acquireIdentityQuaternion(): Quaternion {
  const q = acquireQuaternion();
  q.x = 0;
  q.y = 0;
  q.z = 0;
  q.w = 1;
  return q;
}

// Acquires without initializing the components. Use acquireIdentityQuaternion when a known value is required.
export function acquireQuaternion(): Quaternion {
  let q: Quaternion;

  if (pool.length > 0) {
    q = pool.pop() as Quaternion;
  } else {
    q = createQuaternion();
  }

  return q;
}

export function clearQuaternionPool(): void {
  pool.length = 0;
}

export function releaseQuaternion(q: Quaternion): void {
  if (!q) return;
  if (geometryPoolReleaseGuard !== null && pool.includes(q)) geometryPoolReleaseGuard('releaseQuaternion');
  q[EntityRuntimeKey] = undefined;
  pool.push(q);
}

const pool: Quaternion[] = [];
