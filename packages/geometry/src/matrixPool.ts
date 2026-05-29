import type { Matrix } from '@flighthq/types';

import { createMatrix, identityMatrix } from './matrix';

export function clearMatrixPool(): void {
  pool.length = 0;
}

export function acquireMatrix(): Matrix {
  let m: Matrix;

  if (pool.length > 0) {
    m = pool.pop() as Matrix;
  } else {
    m = createMatrix();
  }

  return m;
}

export function acquireIdentityMatrix(): Matrix {
  const m = acquireMatrix();
  identityMatrix(m);
  return m;
}

export function releaseMatrix(m: Matrix): void {
  if (!m) return;
  pool.push(m);
}

const pool: Matrix[] = [];
