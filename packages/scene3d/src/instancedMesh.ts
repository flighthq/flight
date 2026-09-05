import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { copyMatrix4, createAabb, createMatrix4, transformAabbByMatrix4, unionAabb } from '@flighthq/geometry/contract';
import { ensureMeshGeometryBounds } from '@flighthq/mesh/contract';
import { getNodeRuntime } from '@flighthq/node/contract';
import { createSignal } from '@flighthq/signals/contract';
import type {
  Aabb,
  EntityConstruction,
  InstancedMesh,
  InstancedMeshRuntime,
  InstancedMeshSignals,
  Kind,
  Material,
  Matrix4,
  MeshGeometry,
} from '@flighthq/types/contract';
import { InstancedMeshKind } from '@flighthq/types/contract';

export { InstancedMeshKind };

import { createNode3D } from './sceneNode';

/**
 * Appends one instance at the end of `target`, growing `instanceCount` (and capacity, via
 * `setInstancedMeshInstanceCount`) to make room, and returns the new instance's index.
 *
 * This is the verb to reach for when adding instances. The `set*` functions deliberately refuse to
 * write past `instanceCount` — an index beyond the live range names an instance that does not exist
 * — so growing first and writing second is the only correct order, and this does both. Writing
 * `setInstancedMeshInstanceMatrix(mesh, mesh.instanceCount, m)` by hand silently does nothing.
 *
 * The instance's color slot is left at whatever the batch's default is; assign it afterwards with
 * `setInstancedMeshInstanceColor` if the instance needs its own.
 * Fires `onInstanceAppended` when signals are enabled.
 */
export function appendInstancedMeshInstance(target: InstancedMesh, matrix: Readonly<Matrix4>): number {
  const index = target.instanceCount;
  setInstancedMeshInstanceCount(target, index + 1);
  copyMatrix4(target.instanceMatrices[index], matrix);
  invalidateInstancedMesh(target);
  const signals = getInstancedMeshSignals(target);
  if (signals !== null) signals.onInstanceAppended.emit(index);
  return index;
}

/** Sets `target.instanceCount = 0`, keeping allocated capacity. Fires `onCleared` when signals are enabled. */
export function clearInstancedMesh(target: InstancedMesh): void {
  target.instanceCount = 0;
  invalidateInstancedMesh(target);
  const signals = getInstancedMeshSignals(target);
  if (signals !== null) signals.onCleared.emit();
}

/**
 * Deep-copies `source` into a new `InstancedMesh` with independent instance matrices and a fresh
 * runtime. `geometry` is SHARED (it is the point of instancing, and geometry is immutable to this
 * type); `materials` is a shallow copy, so the two meshes reference the same material entities.
 */
export function cloneInstancedMesh(source: Readonly<InstancedMesh>): InstancedMesh {
  const clone = createInstancedMesh(
    source.geometry,
    [...source.materials],
    source.instanceMatrices.length,
    source.kind,
  );
  for (let i = 0; i < source.instanceCount; i++) copyMatrix4(clone.instanceMatrices[i], source.instanceMatrices[i]);
  clone.instanceCount = source.instanceCount;
  if (source.instanceColors !== null) clone.instanceColors = new Uint32Array(source.instanceColors);
  return clone;
}

/**
 * Writes the union, in the mesh's own local space, of the geometry bounds over every live instance
 * matrix — the box an instanced batch actually occupies before its node transform is applied.
 *
 * This is the authoring-facing twin of the cull's cached union in `@flighthq/render`; that package is
 * a sibling of this one and cannot import it, which is why the loop appears in both. Writes an empty
 * box (min > max) for a batch with no instances or geometry whose bounds cannot be computed.
 */
export function computeInstancedMeshLocalBoundsAabb(out: Aabb, source: Readonly<InstancedMesh>): void {
  const bounds = ensureMeshGeometryBounds(source.geometry);
  if (bounds === null || source.instanceCount === 0) {
    out.min.x = out.min.y = out.min.z = Infinity;
    out.max.x = out.max.y = out.max.z = -Infinity;
    return;
  }
  for (let i = 0; i < source.instanceCount; i++) {
    transformAabbByMatrix4(_scratchInstanceBounds, bounds, source.instanceMatrices[i]);
    if (i === 0) {
      out.min.x = _scratchInstanceBounds.min.x;
      out.min.y = _scratchInstanceBounds.min.y;
      out.min.z = _scratchInstanceBounds.min.z;
      out.max.x = _scratchInstanceBounds.max.x;
      out.max.y = _scratchInstanceBounds.max.y;
      out.max.z = _scratchInstanceBounds.max.z;
    } else {
      unionAabb(out, out, _scratchInstanceBounds);
    }
  }
}

/**
 * Creates an InstancedMesh drawing `geometry` once per instance, each at its own model matrix.
 * `capacity` preallocates that many instance matrices; `instanceCount` starts at 0, so a freshly
 * created batch draws nothing until instances are appended (or the count is set).
 */
export function createInstancedMesh(
  geometry: MeshGeometry,
  materials: (Material | null)[],
  capacity?: number,
  kind: Kind = InstancedMeshKind,
): InstancedMesh {
  const cap = capacity ?? DEFAULT_CAPACITY;
  const matrices: Matrix4[] = new Array(cap);
  for (let i = 0; i < cap; i++) matrices[i] = createMatrix4();
  const node = createNode3D(kind) as InstancedMesh;
  node.geometry = geometry;
  node.instanceColors = null;
  node.instanceCount = 0;
  node.instanceMatrices = matrices;
  node.materials = materials;
  node.version = 0;
  return node;
}

export function createInstancedMeshSignals(): InstancedMeshSignals {
  const out = allocateEntity<InstancedMeshSignals>();
  initializeInstancedMeshSignals(out);
  return finishEntity(out);
}

/**
 * Opt-in signals for an `InstancedMesh`. Returns the {@link InstancedMeshSignals} group attached to
 * `target`, creating it on the first call. Zero cost until enabled — honors the `enable*` convention.
 * Use `getInstancedMeshSignals` to read without creating.
 */
export function enableInstancedMeshSignals(target: InstancedMesh): InstancedMeshSignals {
  const runtime = getNodeRuntime(target) as InstancedMeshRuntime;
  return (runtime.instancedMeshSignals ??= createInstancedMeshSignals());
}

/**
 * Returns how many instances `target` can hold before its matrix array has to grow. Distinct from
 * `instanceCount`, which is how many are live; capacity >= count always.
 */
export function getInstancedMeshCapacity(source: Readonly<InstancedMesh>): number {
  return source.instanceMatrices.length;
}

/**
 * Returns the packed RGBA color of instance `index`, or -1 when `index` is out of range
 * (`[0, instanceCount)`) — -1 is not a representable color, so it cannot be mistaken for one.
 * A batch with no per-instance colors reports every live instance as opaque white.
 */
export function getInstancedMeshInstanceColor(source: Readonly<InstancedMesh>, index: number): number {
  if (index < 0 || index >= source.instanceCount) return -1;
  if (source.instanceColors === null) return 0xffffffff;
  return source.instanceColors[index];
}

/**
 * Writes the model matrix of instance `index` into `out` and returns true.
 * Returns false and leaves `out` untouched when `index` is out of range (`[0, instanceCount)`).
 */
export function getInstancedMeshInstanceMatrix(out: Matrix4, source: Readonly<InstancedMesh>, index: number): boolean {
  if (index < 0 || index >= source.instanceCount) return false;
  copyMatrix4(out, source.instanceMatrices[index]);
  return true;
}

/** Returns the {@link InstancedMeshSignals} attached to `source`, or `null` if not yet enabled. */
export function getInstancedMeshSignals(source: Readonly<InstancedMesh>): InstancedMeshSignals | null {
  return (getNodeRuntime(source) as InstancedMeshRuntime).instancedMeshSignals ?? null;
}

export function initializeInstancedMeshSignals(out: EntityConstruction<InstancedMeshSignals>): void {
  out.onCleared = createSignal();
  out.onInstanceAppended = createSignal();
  out.onInstanceRemoved = createSignal();
}

/** Bumps `version`, the counter every cache over the instance payload keys on. */
export function invalidateInstancedMesh(target: InstancedMesh): void {
  target.version++;
}

export function isInstancedMesh(source: unknown): source is InstancedMesh {
  return (
    source != null &&
    typeof source === 'object' &&
    (source as Partial<InstancedMesh>).instanceMatrices != null &&
    (source as Partial<InstancedMesh>).geometry != null
  );
}

/**
 * Calls `visitor(index, matrix)` for each live instance in order. The `matrix` argument is the
 * batch's own live Matrix4 for that instance — not a copy — so a visitor may read it freely but must
 * treat writes as mutating the batch (and invalidate it afterwards). Allocation-free.
 */
export function iterateInstancedMeshInstances(
  source: Readonly<InstancedMesh>,
  visitor: (index: number, matrix: Readonly<Matrix4>) => void,
): void {
  for (let i = 0; i < source.instanceCount; i++) visitor(i, source.instanceMatrices[i]);
}

/**
 * Swap-removes instance `index` with the last instance (O(1)), decrementing `instanceCount`.
 * Does not preserve order — the instance that was at `instanceCount - 1` moves to `index`, which is
 * the `swapSource` reported to `onInstanceRemoved` (-1 when the removed instance was the last one, so
 * nothing moved). No-ops when `index` is out of range.
 */
export function removeInstancedMeshInstance(target: InstancedMesh, index: number): void {
  const last = target.instanceCount - 1;
  if (index < 0 || index > last) return;
  const swapSource = index < last ? last : -1;
  if (index < last) {
    copyMatrix4(target.instanceMatrices[index], target.instanceMatrices[last]);
    if (target.instanceColors !== null) target.instanceColors[index] = target.instanceColors[last];
  }
  target.instanceCount = last;
  invalidateInstancedMesh(target);
  const signals = getInstancedMeshSignals(target);
  if (signals !== null) signals.onInstanceRemoved.emit(index, swapSource);
}

/**
 * Grows `target`'s instance capacity to at least `capacity`, allocating the matrices (and extending
 * the color array, when one exists) without changing `instanceCount`. Reserving ahead of a known
 * batch size keeps the append loop from reallocating.
 */
export function reserveInstancedMesh(target: InstancedMesh, capacity: number): void {
  const matrices = target.instanceMatrices;
  if (matrices.length >= capacity) return;
  const newCapacity = Math.max(capacity, matrices.length * 2);
  for (let i = matrices.length; i < newCapacity; i++) matrices.push(createMatrix4());
  if (target.instanceColors !== null) {
    const newColors = new Uint32Array(newCapacity);
    newColors.set(target.instanceColors);
    newColors.fill(0xffffffff, target.instanceColors.length);
    target.instanceColors = newColors;
  }
}

/**
 * Sets the packed RGBA color of instance `index`, allocating the per-instance color array on first
 * use (so an untinted batch carries none). No-ops when `index` is out of range (`[0, instanceCount)`)
 * — use `appendInstancedMeshInstance` to add an instance before coloring it.
 */
export function setInstancedMeshInstanceColor(target: InstancedMesh, index: number, color: number): void {
  if (index < 0 || index >= target.instanceCount) return;
  if (target.instanceColors === null) {
    target.instanceColors = new Uint32Array(target.instanceMatrices.length);
    target.instanceColors.fill(0xffffffff);
  }
  target.instanceColors[index] = color;
  invalidateInstancedMesh(target);
}

/**
 * Sets how many instances are live, growing capacity (doubling) when `count` exceeds it. Raising the
 * count exposes instances whose matrices are whatever they last held — identity for never-written
 * slots — so the caller is expected to write them. `appendInstancedMeshInstance` is the safer verb
 * when adding one instance at a time.
 */
export function setInstancedMeshInstanceCount(target: InstancedMesh, count: number): void {
  reserveInstancedMesh(target, count);
  target.instanceCount = count;
  invalidateInstancedMesh(target);
}

/**
 * Writes the model matrix of instance `index`.
 * No-ops when `index` is out of range (`[0, instanceCount)`): an index past the live count names an
 * instance that does not exist yet, and silently growing the batch here would make a typo'd index
 * allocate. Append first (`appendInstancedMeshInstance`) or raise the count
 * (`setInstancedMeshInstanceCount`), then write.
 */
export function setInstancedMeshInstanceMatrix(target: InstancedMesh, index: number, matrix: Readonly<Matrix4>): void {
  if (index < 0 || index >= target.instanceCount) return;
  copyMatrix4(target.instanceMatrices[index], matrix);
  invalidateInstancedMesh(target);
}

/**
 * Writes `count` contiguous instance matrices from `source` starting at `startIndex`, reading
 * `count * 16` floats in column-major Matrix4 order. The bulk form of
 * `setInstancedMeshInstanceMatrix`, and the one to use when instance transforms are rebuilt every
 * frame from an external array — it invalidates once for the whole range rather than per instance.
 * No-ops when the range is out of bounds or `source` is too short to supply it.
 */
export function setInstancedMeshInstanceMatrixRange(
  target: InstancedMesh,
  startIndex: number,
  count: number,
  source: Readonly<Float32Array>,
): void {
  if (startIndex < 0 || count <= 0 || startIndex + count > target.instanceCount) return;
  if (source.length < count * 16) return;
  for (let i = 0; i < count; i++) {
    const matrix = target.instanceMatrices[startIndex + i].m;
    const offset = i * 16;
    for (let k = 0; k < 16; k++) matrix[k] = source[offset + k];
  }
  invalidateInstancedMesh(target);
}

const DEFAULT_CAPACITY = 16;

const _scratchInstanceBounds = createAabb();
