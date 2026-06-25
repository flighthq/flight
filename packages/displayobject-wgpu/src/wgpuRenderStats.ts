import type { WgpuRenderState, WgpuRenderStats } from '@flighthq/types';

/**
 * Returns a snapshot of the current frame's GPU draw statistics for `state`. The returned object
 * reflects counts accumulated since the last `resetWgpuRenderStats` call. Returns zeroed stats
 * when no counting has been done on this state.
 */
export function getWgpuRenderStats(state: WgpuRenderState): WgpuRenderStats {
  return ensureWgpuRenderStatsMutable(state);
}

/**
 * Records one batch flush: increments `drawCallCount` by 1, `instanceCount` by `instances`, and
 * `batchFlushCount` by 1. Called by the batch flush path when stats are enabled.
 */
export function recordWgpuBatchFlush(state: WgpuRenderState, instances: number): void {
  const entry = _stats.get(state);
  if (entry === undefined) return;
  entry.drawCallCount++;
  entry.instanceCount += instances;
  entry.batchFlushCount++;
}

/**
 * Records one texture upload (a canvas-to-GPU upload): increments `textureUploadCount` by 1.
 * Called by the texture upload paths when stats are enabled.
 */
export function recordWgpuTextureUpload(state: WgpuRenderState): void {
  const entry = _stats.get(state);
  if (entry === undefined) return;
  entry.textureUploadCount++;
}

/** Resets all GPU draw statistics for `state` to zero. Call at the start of each frame. */
export function resetWgpuRenderStats(state: WgpuRenderState): void {
  const entry = ensureWgpuRenderStatsMutable(state);
  entry.batchFlushCount = 0;
  entry.drawCallCount = 0;
  entry.instanceCount = 0;
  entry.textureUploadCount = 0;
}

function ensureWgpuRenderStatsMutable(state: WgpuRenderState): Mutable<WgpuRenderStats> {
  let entry = _stats.get(state);
  if (entry === undefined) {
    entry = { batchFlushCount: 0, drawCallCount: 0, instanceCount: 0, textureUploadCount: 0 };
    _stats.set(state, entry);
  }
  return entry;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// Per-state mutable stats accumulator. Populated by the batch flush and per-kind submit paths.
// Stored in a WeakMap so it is GC'd with the state and never leaks.
const _stats = new WeakMap<WgpuRenderState, Mutable<WgpuRenderStats>>();
