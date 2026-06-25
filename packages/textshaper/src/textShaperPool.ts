import type { ShapedRun } from '@flighthq/types';

import { createShapedRun } from './textShaperRun';

// Acquires a ShapedRun from the pool, allocating a new one when the pool is empty.
// Must be paired with a matching `releaseShapedRun` call. Treat as paired brackets:
// every `acquireShapedRun` call must have exactly one `releaseShapedRun` in its lifetime.
//
// The returned run is in an unspecified state — always populate it before use (e.g. via
// `shapeTextRunInto`).
export function acquireShapedRun(): ShapedRun {
  if (_pool.length > 0) return _pool.pop()!;
  return createShapedRun();
}

// Returns a ShapedRun to the pool. The run must not be used after release. Pairs with
// `acquireShapedRun`. Runs released beyond the pool capacity are silently discarded (GC-collected).
export function releaseShapedRun(run: ShapedRun): void {
  if (_pool.length < _POOL_MAX_SIZE) {
    _pool.push(run);
  }
}

// Maximum number of ShapedRuns to retain in the pool before discarding on release. Keeps
// memory bounded in cases where burst shaping produces many runs.
const _POOL_MAX_SIZE = 64;
const _pool: ShapedRun[] = [];
