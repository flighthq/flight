import type { Matrix4 } from '@flighthq/types';

import { createMatrix4, identityMatrix4 } from './matrix4';

export function acquireIdentityMatrix4(): Matrix4 {
  const m = acquireMatrix4();
  identityMatrix4(m);
  return m;
}

export function acquireMatrix4(): Matrix4 {
  let m: Matrix4;

  if (pool.length > 0) {
    m = pool.pop() as Matrix4;
  } else {
    m = createMatrix4();
  }

  return m;
}

export function clearMatrix4Pool(): void {
  pool.length = 0;
}

export function releaseMatrix4(m: Matrix4): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix4[] = [];
