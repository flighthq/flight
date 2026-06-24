import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import { copyRectangle, createRectangle, reserveFloat32Array, reserveUint16Array } from '@flighthq/geometry';
import { invalidateNodeLocalBounds } from '@flighthq/node';
import { createSignal } from '@flighthq/signals';
import type {
  MethodsOf,
  Node,
  PartialNode,
  QuadBatch,
  QuadBatchData,
  QuadBatchRuntime,
  QuadBatchSignals,
  QuadTransformType,
  Rectangle,
  Vector2Like,
} from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';

// Per-instance stride constants. The stride layout is intentionally internal to this
// module so callers never hand-write i*2 or i*6.
const QUAD_VECTOR2_STRIDE = 2;
const QUAD_MATRIX3X2_STRIDE = 6;

/**
 * Appends a new instance at the end of `target` using vector2 (translation-only) transform,
 * auto-growing capacity via `resizeQuadBatch`. Returns the new instance index.
 * The materialData slot for the appended instance is not set — leave it null or assign after.
 * Fires `onInstanceAppended` when signals are enabled.
 */
export function appendQuadBatchInstance(target: QuadBatch, id: number, x: number, y: number): number {
  const index = target.data.instanceCount;
  resizeQuadBatch(target, index + 1);
  target.data.ids[index] = id;
  const o = index * QUAD_VECTOR2_STRIDE;
  target.data.transforms[o] = x;
  target.data.transforms[o + 1] = y;
  const signals = getQuadBatchSignals(target);
  if (signals !== null) signals.onInstanceAppended.emit(index);
  return index;
}

/** Sets `target.data.instanceCount = 0`, keeping allocated capacity. Fires `onCleared` when signals are enabled. */
export function clearQuadBatch(target: QuadBatch): void {
  target.data.instanceCount = 0;
  const signals = getQuadBatchSignals(target);
  if (signals !== null) signals.onCleared.emit();
}

/**
 * Deep-copies `source` into a new `QuadBatch` with independent typed arrays and a fresh runtime.
 * The new batch has the same `atlas`, `instanceCount`, `transformType`, and `materialData` (shallow copy),
 * but its `ids` and `transforms` are cloned typed arrays.
 */
export function cloneQuadBatch(source: Readonly<QuadBatch>): QuadBatch {
  const src = source.data;
  return createQuadBatch({
    data: {
      atlas: src.atlas,
      ids: src.ids.slice(),
      instanceCount: src.instanceCount,
      materialData: src.materialData !== null ? src.materialData.slice() : null,
      transforms: src.transforms.slice(),
      transformType: src.transformType,
    },
  });
}

function copyLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const runtime = getDisplayObjectRuntime(source as QuadBatch) as QuadBatchRuntime;
  if (runtime.localBoundsRectangle !== null) copyRectangle(out, runtime.localBoundsRectangle);
}

/**
 * Removes swap-remove holes by compacting all live instances (`[0, instanceCount)`) to the
 * front of the buffer in index order, skipping entries that have been logically deleted.
 * This is not needed for swap-remove–only callers, but is useful when stable iteration order
 * must be restored after a batch of removals. After compaction, `instanceCount` equals the
 * number of entries whose id is `>= 0`.
 *
 * Note: this function does NOT filter by id; it simply copies all `instanceCount` entries to a
 * fresh contiguous layout. To remove specific entries, call `removeQuadBatchInstance` first, then
 * compact if needed.
 */
export function compactQuadBatch(target: QuadBatch): void {
  // Nothing to compact — already dense.
  const data = target.data;
  if (data.instanceCount === 0) return;
  // A compact batch is always in good shape; we just shrink the logical count to remove any
  // zero-id entries left by swap-removes. Since swap-remove preserves layout, the buffer is
  // already packed — this is a no-op for the common case.
  // The only meaningful compaction is when callers zero-out ids for "deleted" entries and need
  // to collapse those holes. That is a caller convention; this function preserves order.
  // We re-copy only if there are id==-1 sentinel entries (which some callers use for deletion).
  const stride = getQuadTransformStride(data.transformType);
  let write = 0;
  for (let read = 0; read < data.instanceCount; read++) {
    if (data.ids[read] === 0xffff) continue; // sentinel for "deleted" slots (Uint16Array max)
    if (write !== read) {
      data.ids[write] = data.ids[read];
      const dst = write * stride;
      const src = read * stride;
      for (let k = 0; k < stride; k++) data.transforms[dst + k] = data.transforms[src + k];
      if (data.materialData !== null) data.materialData[write] = data.materialData[read] ?? null;
    }
    write++;
  }
  data.instanceCount = write;
}

export function computeQuadBatchLocalBoundsRectangle(out: Rectangle, source: Readonly<QuadBatch>): void {
  const { atlas, ids, instanceCount, transforms, transformType } = source.data;
  if (atlas === null || instanceCount === 0) {
    out.x = 0;
    out.y = 0;
    out.width = 0;
    out.height = 0;
    return;
  }
  const regions = atlas.regions;
  const numRegions = regions.length;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  if (transformType === 'vector2') {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      const dx = transforms[i * QUAD_VECTOR2_STRIDE];
      const dy = transforms[i * QUAD_VECTOR2_STRIDE + 1];
      if (dx < minX) minX = dx;
      if (dy < minY) minY = dy;
      const rx = dx + region.width;
      const ry = dy + region.height;
      if (rx > maxX) maxX = rx;
      if (ry > maxY) maxY = ry;
    }
  } else {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      const o = i * QUAD_MATRIX3X2_STRIDE;
      const a = transforms[o];
      const b = transforms[o + 1];
      const c = transforms[o + 2];
      const d = transforms[o + 3];
      const tx = transforms[o + 4];
      const ty = transforms[o + 5];
      const w = region.width;
      const h = region.height;
      const x0 = tx;
      const y0 = ty;
      const x1 = a * w + tx;
      const y1 = b * w + ty;
      const x2 = c * h + tx;
      const y2 = d * h + ty;
      const x3 = a * w + c * h + tx;
      const y3 = b * w + d * h + ty;
      const qMinX = Math.min(x0, x1, x2, x3);
      const qMinY = Math.min(y0, y1, y2, y3);
      const qMaxX = Math.max(x0, x1, x2, x3);
      const qMaxY = Math.max(y0, y1, y2, y3);
      if (qMinX < minX) minX = qMinX;
      if (qMinY < minY) minY = qMinY;
      if (qMaxX > maxX) maxX = qMaxX;
      if (qMaxY > maxY) maxY = qMaxY;
    }
  }
  if (minX === Infinity) {
    out.x = 0;
    out.y = 0;
    out.width = 0;
    out.height = 0;
  } else {
    out.x = minX;
    out.y = minY;
    out.width = maxX - minX;
    out.height = maxY - minY;
  }
}

export function createQuadBatch(obj?: Readonly<PartialNode<QuadBatch>>): QuadBatch {
  return createDisplayObjectGeneric(QuadBatchKind, obj, createQuadBatchData, createQuadBatchRuntime) as QuadBatch;
}

export function createQuadBatchData(data?: Readonly<Partial<QuadBatchData>>): QuadBatchData {
  return {
    atlas: data?.atlas ?? null,
    ids: data?.ids ?? new Uint16Array(),
    instanceCount: data?.instanceCount ?? 0,
    materialData: data?.materialData ?? null,
    transforms: data?.transforms ?? new Float32Array(),
    transformType: data?.transformType ?? 'vector2',
  };
}

export function createQuadBatchRuntime(): QuadBatchRuntime {
  const runtime = createDisplayObjectRuntime(defaultMethods) as QuadBatchRuntime;
  runtime.localBoundsRectangle = null;
  runtime.instanceVelocities = null;
  return runtime;
}

export function createQuadBatchSignals(): QuadBatchSignals {
  return {
    onCleared: createSignal(),
    onInstanceAppended: createSignal(),
    onInstanceRemoved: createSignal(),
  };
}

/**
 * Opt-in signals for a `QuadBatch` node. Returns the {@link QuadBatchSignals} group attached to
 * `target`, creating it on the first call. Zero cost until enabled — honors the `enable*` convention.
 * Use `getQuadBatchSignals` to read without creating.
 */
export function enableQuadBatchSignals(target: QuadBatch): QuadBatchSignals {
  const s = target as QuadBatchWithSignals;
  return (s[quadBatchSignalsSlot] ??= createQuadBatchSignals());
}

export function getQuadBatchCapacity(source: Readonly<QuadBatch>): number {
  const data = source.data;
  const stride = getQuadTransformStride(data.transformType);
  const transformCapacity = (data.transforms.length / stride) | 0;
  return Math.min(data.ids.length, transformCapacity);
}

/**
 * Returns the region id stored at `index`, or -1 when `index` is out of range.
 * Bounds-checked against `instanceCount`.
 */
export function getQuadBatchInstanceId(source: Readonly<QuadBatch>, index: number): number {
  if (index < 0 || index >= source.data.instanceCount) return -1;
  return source.data.ids[index];
}

/**
 * Writes the transform of instance `index` into `out`.
 * For vector2 batches, writes `out.x = tx, out.y = ty` (matrix fields left unchanged).
 * For matrix3x2 batches, writes `out.a/b/c/d/tx/ty`.
 * Returns false and writes nothing when `index` is out of range.
 */
export function getQuadBatchInstanceTransform(out: Vector2Like, source: Readonly<QuadBatch>, index: number): boolean {
  const { instanceCount, transforms, transformType } = source.data;
  if (index < 0 || index >= instanceCount) return false;
  if (transformType === 'vector2') {
    const o = index * QUAD_VECTOR2_STRIDE;
    out.x = transforms[o];
    out.y = transforms[o + 1];
  } else {
    const o = index * QUAD_MATRIX3X2_STRIDE;
    out.x = transforms[o + 4];
    out.y = transforms[o + 5];
  }
  return true;
}

export function getQuadBatchRuntime(source: Readonly<QuadBatch>): Readonly<QuadBatchRuntime> {
  return getDisplayObjectRuntime(source) as QuadBatchRuntime;
}

/** Returns the {@link QuadBatchSignals} attached to `source`, or `null` if not yet enabled. */
export function getQuadBatchSignals(source: Readonly<QuadBatch>): QuadBatchSignals | null {
  return (source as QuadBatchWithSignals)[quadBatchSignalsSlot] ?? null;
}

export function getQuadTransformStride(transformType: QuadTransformType): number {
  return quadTransformStride[transformType];
}

export function hitTestQuadBatchPoint(source: Readonly<QuadBatch>, point: Readonly<Vector2Like>): number {
  return hitTestQuadBatchPointXY(source, point.x, point.y);
}

/**
 * Returns the topmost instance index whose quad polygon contains `(x, y)`, or -1 for a miss.
 *
 * For `vector2` batches this is equivalent to `hitTestQuadBatchPointXY` (axis-aligned quads have
 * no rotation; AABB = exact polygon). For `matrix3x2` batches this performs a true point-in-quad
 * test via the cross-product winding rule, while `hitTestQuadBatchPointXY` uses the AABB of the
 * transformed quad (which over-reports for rotated quads). Use this variant when rotation accuracy
 * matters; it is slightly more expensive than the AABB version.
 */
export function hitTestQuadBatchPointExact(source: Readonly<QuadBatch>, point: Readonly<Vector2Like>): number {
  return hitTestQuadBatchPointExactXY(source, point.x, point.y);
}

/**
 * XY variant of `hitTestQuadBatchPointExact`. See that function for details.
 */
export function hitTestQuadBatchPointExactXY(source: Readonly<QuadBatch>, x: number, y: number): number {
  const { atlas, ids, instanceCount, transforms, transformType } = source.data;
  if (atlas === null || instanceCount === 0) return -1;
  const regions = atlas.regions;
  const numRegions = regions.length;
  if (transformType === 'vector2') {
    // Axis-aligned — AABB is exact.
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      const dx = transforms[i * QUAD_VECTOR2_STRIDE];
      const dy = transforms[i * QUAD_VECTOR2_STRIDE + 1];
      if (x >= dx && x < dx + region.width && y >= dy && y < dy + region.height) return i;
    }
  } else {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      const o = i * QUAD_MATRIX3X2_STRIDE;
      const a = transforms[o];
      const b = transforms[o + 1];
      const c = transforms[o + 2];
      const d = transforms[o + 3];
      const tx = transforms[o + 4];
      const ty = transforms[o + 5];
      const w = region.width;
      const h = region.height;
      // Four corners of the quad: (0,0)→(w,0)→(w,h)→(0,h) mapped by the affine.
      const x0 = tx;
      const y0 = ty;
      const x1 = a * w + tx;
      const y1 = b * w + ty;
      const x2 = a * w + c * h + tx;
      const y2 = b * w + d * h + ty;
      const x3 = c * h + tx;
      const y3 = d * h + ty;
      // Point-in-convex-polygon via signed cross products. A point P is inside a CCW quad when
      // the cross product of each edge vector with (P - edge_start) is >= 0 for all four edges.
      if (
        crossSign(x0, y0, x1, y1, x, y) &&
        crossSign(x1, y1, x2, y2, x, y) &&
        crossSign(x2, y2, x3, y3, x, y) &&
        crossSign(x3, y3, x0, y0, x, y)
      )
        return i;
    }
  }
  return -1;
}

export function hitTestQuadBatchPointXY(source: Readonly<QuadBatch>, x: number, y: number): number {
  const { atlas, ids, instanceCount, transforms, transformType } = source.data;
  if (atlas === null || instanceCount === 0) return -1;
  const regions = atlas.regions;
  const numRegions = regions.length;
  if (transformType === 'vector2') {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      const dx = transforms[i * QUAD_VECTOR2_STRIDE];
      const dy = transforms[i * QUAD_VECTOR2_STRIDE + 1];
      if (x >= dx && x < dx + region.width && y >= dy && y < dy + region.height) return i;
    }
  } else {
    for (let i = 0; i < instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      const o = i * QUAD_MATRIX3X2_STRIDE;
      const a = transforms[o];
      const b = transforms[o + 1];
      const c = transforms[o + 2];
      const d = transforms[o + 3];
      const tx = transforms[o + 4];
      const ty = transforms[o + 5];
      const w = region.width;
      const h = region.height;
      const x0 = tx;
      const y0 = ty;
      const x1 = a * w + tx;
      const y1 = b * w + ty;
      const x2 = c * h + tx;
      const y2 = d * h + ty;
      const x3 = a * w + c * h + tx;
      const y3 = b * w + d * h + ty;
      const minX = Math.min(x0, x1, x2, x3);
      const minY = Math.min(y0, y1, y2, y3);
      const maxX = Math.max(x0, x1, x2, x3);
      const maxY = Math.max(y0, y1, y2, y3);
      if (x >= minX && x < maxX && y >= minY && y < maxY) return i;
    }
  }
  return -1;
}

/**
 * Calls `visitor(index, id, transforms)` for each live instance in order. The `transforms`
 * argument is a `Float32Array` subarray view beginning at instance `index`'s offset with
 * length equal to the transform stride. Allocation-free: no per-call object is created.
 */
export function iterateQuadBatchInstances(
  source: Readonly<QuadBatch>,
  visitor: (index: number, id: number, transforms: Float32Array) => void,
): void {
  const { ids, instanceCount, transforms, transformType } = source.data;
  const stride = getQuadTransformStride(transformType);
  for (let i = 0; i < instanceCount; i++) {
    visitor(i, ids[i], transforms.subarray(i * stride, i * stride + stride));
  }
}

/**
 * Swap-removes instance `index` with the last instance (O(1)), decrementing `instanceCount`.
 * Does not preserve order — the instance that was at `instanceCount-1` moves to `index`.
 * No-ops when `index` is out of range.
 * Fires `onInstanceRemoved` when signals are enabled.
 */
export function removeQuadBatchInstance(target: QuadBatch, index: number): void {
  const data = target.data;
  const last = data.instanceCount - 1;
  if (index < 0 || index > last) return;
  const swapSource = index < last ? last : -1;
  if (index < last) {
    data.ids[index] = data.ids[last];
    if (data.transformType === 'vector2') {
      const dst = index * QUAD_VECTOR2_STRIDE;
      const src = last * QUAD_VECTOR2_STRIDE;
      data.transforms[dst] = data.transforms[src];
      data.transforms[dst + 1] = data.transforms[src + 1];
    } else {
      const dst = index * QUAD_MATRIX3X2_STRIDE;
      const src = last * QUAD_MATRIX3X2_STRIDE;
      for (let k = 0; k < QUAD_MATRIX3X2_STRIDE; k++) data.transforms[dst + k] = data.transforms[src + k];
    }
    if (data.materialData !== null) {
      data.materialData[index] = data.materialData[last] ?? null;
    }
  }
  data.instanceCount = last;
  const signals = getQuadBatchSignals(target);
  if (signals !== null) signals.onInstanceRemoved.emit(index, swapSource);
}

export function reserveQuadBatch(target: QuadBatch, capacity: number): void {
  const currentCapacity = getQuadBatchCapacity(target);
  if (currentCapacity >= capacity) return;
  const data = target.data;
  data.ids = reserveUint16Array(data.ids, capacity);
  data.transforms = reserveFloat32Array(data.transforms, capacity * getQuadTransformStride(data.transformType));
}

export function resizeQuadBatch(target: QuadBatch, instanceCount: number): void {
  const data = target.data;
  const oldInstanceCount = data.instanceCount;
  data.instanceCount = instanceCount;
  if (oldInstanceCount >= instanceCount) return;
  const capacity = getQuadBatchCapacity(target);
  if (capacity < instanceCount) {
    const newCapacity = Math.max(instanceCount, capacity * 2);
    reserveQuadBatch(target, newCapacity);
  }
}

/**
 * Writes the vector2 (translation-only) transform and id for instance `index`.
 * No-ops when `index` is out of range (`[0, instanceCount)`).
 * Target must use `transformType === 'vector2'`.
 */
export function setQuadBatchInstance(target: QuadBatch, index: number, id: number, x: number, y: number): void {
  const data = target.data;
  if (index < 0 || index >= data.instanceCount) return;
  data.ids[index] = id;
  const o = index * QUAD_VECTOR2_STRIDE;
  data.transforms[o] = x;
  data.transforms[o + 1] = y;
}

/**
 * Writes a full 2D affine (matrix3x2) transform and id for instance `index`.
 * No-ops when `index` is out of range (`[0, instanceCount)`).
 * Target must use `transformType === 'matrix3x2'`.
 * Layout: `[a, b, c, d, tx, ty]` — standard column-major 2D affine.
 */
export function setQuadBatchInstanceMatrix(
  target: QuadBatch,
  index: number,
  id: number,
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
): void {
  const data = target.data;
  if (index < 0 || index >= data.instanceCount) return;
  data.ids[index] = id;
  const o = index * QUAD_MATRIX3X2_STRIDE;
  data.transforms[o] = a;
  data.transforms[o + 1] = b;
  data.transforms[o + 2] = c;
  data.transforms[o + 3] = d;
  data.transforms[o + 4] = tx;
  data.transforms[o + 5] = ty;
}

/**
 * Writes `count` contiguous transform entries from `source` into the batch starting at `startIndex`.
 * Reads `count * stride` floats from `source` (where stride = `getQuadTransformStride(target.data.transformType)`).
 * No-ops when `startIndex + count` exceeds `instanceCount`.
 * This is the bulk variant of `setQuadBatchInstance`/`setQuadBatchInstanceMatrix`.
 */
export function setQuadBatchInstanceRange(
  target: QuadBatch,
  startIndex: number,
  count: number,
  source: Readonly<Float32Array>,
): void {
  const data = target.data;
  if (startIndex < 0 || count <= 0 || startIndex + count > data.instanceCount) return;
  const stride = getQuadTransformStride(data.transformType);
  const dst = startIndex * stride;
  const len = count * stride;
  for (let k = 0; k < len; k++) data.transforms[dst + k] = source[k];
}

export function setQuadBatchLocalBoundsRectangle(target: QuadBatch, rect: Readonly<Rectangle>): void {
  const runtime = getDisplayObjectRuntime(target) as QuadBatchRuntime;
  if (runtime.localBoundsRectangle === null) runtime.localBoundsRectangle = createRectangle();
  copyRectangle(runtime.localBoundsRectangle, rect);
  invalidateNodeLocalBounds(target);
}

/**
 * Switches `target`'s `transformType`, re-striding the `transforms` buffer in place.
 * - `'vector2' → 'matrix3x2'`: each existing (x, y) pair is expanded to `[1, 0, 0, 1, x, y]` (identity + translation).
 * - `'matrix3x2' → 'vector2'`: each matrix is collapsed to its `(tx, ty)` translation, discarding scale/rotation.
 * Does nothing when `newType` matches the current `transformType`.
 */
export function setQuadBatchTransformType(target: QuadBatch, newType: QuadTransformType): void {
  const data = target.data;
  if (data.transformType === newType) return;
  const count = data.instanceCount;
  if (newType === 'matrix3x2') {
    // Expanding: allocate new buffer, fill in reverse order to avoid clobbering inputs.
    const newTransforms = new Float32Array(Math.max(data.transforms.length / QUAD_VECTOR2_STRIDE, count) * QUAD_MATRIX3X2_STRIDE);
    for (let i = count - 1; i >= 0; i--) {
      const src = i * QUAD_VECTOR2_STRIDE;
      const dst = i * QUAD_MATRIX3X2_STRIDE;
      const x = data.transforms[src];
      const y = data.transforms[src + 1];
      newTransforms[dst] = 1; // a
      newTransforms[dst + 1] = 0; // b
      newTransforms[dst + 2] = 0; // c
      newTransforms[dst + 3] = 1; // d
      newTransforms[dst + 4] = x; // tx
      newTransforms[dst + 5] = y; // ty
    }
    data.transforms = newTransforms;
  } else {
    // Collapsing: extract tx/ty in place (safe: dst < src for all i).
    for (let i = 0; i < count; i++) {
      const src = i * QUAD_MATRIX3X2_STRIDE;
      const dst = i * QUAD_VECTOR2_STRIDE;
      data.transforms[dst] = data.transforms[src + 4]; // tx
      data.transforms[dst + 1] = data.transforms[src + 5]; // ty
    }
  }
  data.transformType = newType;
}

const defaultMethods: Partial<MethodsOf<QuadBatchRuntime>> = {
  computeLocalBoundsRectangle: copyLocalBoundsRectangle,
};

const quadBatchSignalsSlot = Symbol('quadBatchSignals');

interface QuadBatchWithSignals {
  [quadBatchSignalsSlot]?: QuadBatchSignals;
}

const quadTransformStride = {
  vector2: 2,
  matrix3x2: 6,
} as const;

/** True when the cross product of edge (ax→bx, ay→by) and (P - A) is >= 0. */
function crossSign(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax) >= 0;
}
