import type { Matrix } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { geometryPoolReleaseGuard } from './geometryPoolGuards';
import { createMatrix, setMatrixIdentity } from './matrix';

export function acquireIdentityMatrix(): Matrix {
  const m = acquireMatrix();
  setMatrixIdentity(m);
  return m;
}

// Acquires without initializing the components. Use acquireIdentityMatrix when a known value is required.
export function acquireMatrix(): Matrix {
  let m: Matrix;

  if (pool.length > 0) {
    m = pool.pop() as Matrix;
  } else {
    m = createMatrix();
  }

  return m;
}

export function clearMatrixPool(): void {
  pool.length = 0;
}

export function releaseMatrix(m: Matrix): void {
  if (!m) return;
  if (geometryPoolReleaseGuard !== null && pool.includes(m)) geometryPoolReleaseGuard('releaseMatrix');
  m[EntityRuntimeKey] = undefined;
  pool.push(m);
}

const pool: Matrix[] = [];
