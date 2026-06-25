/**
 * Scratch-buffer pool for filter surface operations.
 *
 * `apply*FilterToSurface` functions require one or more `Uint8ClampedArray`
 * scratch buffers (`blurBuffer`, intermediate) sized at least
 * `width * height * 4` bytes. Managing these buffers per-call is error-prone;
 * this pool centralizes allocation and lets callers bracket usage with
 * `acquireFilterSurfaceScratch`/`releaseFilterSurfaceScratch` to reuse buffers
 * across frames without re-allocating.
 *
 * Pool contract (same as all `acquire*`/`release*` pairs in the SDK):
 * - Every `acquireFilterSurfaceScratch` must have a matching
 *   `releaseFilterSurfaceScratch`. Treat them as paired brackets.
 * - Do not read from or write to a buffer after releasing it.
 * - Acquired buffers are not zero-initialized — callers must overwrite the full
 *   buffer before reading from it.
 */

/**
 * Acquires a scratch `Uint8ClampedArray` large enough to hold at least
 * `width * height * 4` bytes. Returns a buffer from the pool if a suitable
 * one is available, otherwise allocates a new one.
 *
 * Must be paired with `releaseFilterSurfaceScratch`. The buffer contents are
 * unspecified — overwrite before reading.
 */
export function acquireFilterSurfaceScratch(width: number, height: number): Uint8ClampedArray {
  const needed = width * height * 4;
  for (const entry of _pool) {
    if (!entry.inUse && entry.buffer.length >= needed) {
      entry.inUse = true;
      return entry.buffer;
    }
  }
  const buffer = new Uint8ClampedArray(needed);
  _pool.push({ buffer, inUse: true });
  return buffer;
}

/**
 * Creates a new `Uint8ClampedArray` scratch buffer for a surface of `width` ×
 * `height` pixels. This is the non-pooled allocation path; use
 * `acquireFilterSurfaceScratch`/`releaseFilterSurfaceScratch` to reuse buffers
 * across calls.
 *
 * The returned buffer is `width * height * 4` bytes.
 */
export function createFilterSurfaceScratch(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

/**
 * Returns the minimum byte length required for a filter scratch buffer of the
 * given dimensions. Equivalent to `width * height * 4`.
 */
export function getFilterSurfaceScratchByteLength(width: number, height: number): number {
  return width * height * 4;
}

/**
 * Returns a previously acquired scratch buffer to the pool. The buffer must
 * have been returned by `acquireFilterSurfaceScratch`. Releasing an
 * already-released buffer or a buffer not acquired from this pool is a
 * programmer error.
 */
export function releaseFilterSurfaceScratch(buffer: Uint8ClampedArray): void {
  for (const entry of _pool) {
    if (entry.buffer === buffer) {
      entry.inUse = false;
      return;
    }
  }
  // Buffer not found in pool — likely a programmer error (buffer not from pool).
}

interface ScratchEntry {
  buffer: Uint8ClampedArray;
  inUse: boolean;
}

const _pool: ScratchEntry[] = [];
