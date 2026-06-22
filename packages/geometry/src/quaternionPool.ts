import type { Quaternion } from '@flighthq/types';

import { createQuaternion } from './quaternion';

export function acquireIdentityQuaternion(): Quaternion {
  const q = acquireQuaternion();
  q.x = 0;
  q.y = 0;
  q.z = 0;
  q.w = 1;
  return q;
}

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
  pool.push(q);
}

const pool: Quaternion[] = [];
