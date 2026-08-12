import type { Matrix4 } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { geometryPoolReleaseGuard } from './geometryPoolGuards';
import { createMatrix4, setMatrix4Identity } from './matrix4';

export function acquireIdentityMatrix4(): Matrix4 {
  const m = acquireMatrix4();
  setMatrix4Identity(m);
  return m;
}

// Acquires without initializing the elements. Use acquireIdentityMatrix4 when a known value is required.
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
  if (geometryPoolReleaseGuard !== null && pool.includes(m)) geometryPoolReleaseGuard('releaseMatrix4');
  m[EntityRuntimeKey] = undefined;
  pool.push(m);
}

const pool: Matrix4[] = [];
