import type { ShapedRun } from '@flighthq/types/contract';

import { createShapedRun } from './textShaperRun';

// Acquires a ShapedRun from the pool, allocating a new one when the pool is empty.
// Must be paired with a matching `releaseShapedRun` call. Treat as paired brackets:
// every `acquireShapedRun` call must have exactly one `releaseShapedRun` in its lifetime.
//
// The returned run is in an unspecified state — always populate it before use (e.g. via
// `shapeTextRunInto`).
export function acquireShapedRun(): ShapedRun {
  const pooled = _pool.pop();
  if (pooled === undefined) return createShapedRun();
  _pooled.delete(pooled);
  return pooled;
}

// Returns a ShapedRun to the pool. The run must not be used after release. Pairs with
// `acquireShapedRun`. Runs released beyond the pool capacity are silently discarded (GC-collected).
//
// Releasing a run that is already pooled is ignored rather than honoured. Without that check the run
// sits in the pool twice, and the next two acquires hand the same object to two callers who then shape
// into one buffer -- corruption that surfaces as wrong glyphs far from its cause. Ignoring keeps the
// pool invariant (an entry appears at most once) intact whatever the caller does.
export function releaseShapedRun(run: ShapedRun): void {
  if (_pooled.has(run)) return;
  if (_pool.length < _POOL_MAX_SIZE) {
    _pool.push(run);
    _pooled.add(run);
  }
}

// Maximum number of ShapedRuns to retain in the pool before discarding on release. Keeps
// memory bounded in cases where burst shaping produces many runs.
const _POOL_MAX_SIZE = 64;
const _pool: ShapedRun[] = [];
// Membership mirror for `_pool`, so the double-release check is O(1) rather than scanning the pool on
// every release. Weak so a run dropped past capacity stays collectable.
const _pooled = new WeakSet<ShapedRun>();
