import type { Path, PathMesh, PathMeshTyped } from '@flighthq/types/contract';

import { tessellatePathInto } from './tessellatePath';
import { tessellatePathTypedInto } from './tessellatePathTyped';

// Pool-backed flatten+tessellate for hot-loop usage. Each `acquirePathMesh` retrieves a `PathMesh`
// from a shared pool, tessellates the given path into it (replacing its contents), and returns it.
// Call `releasePathMesh` when done; the mesh is returned to the pool and must not be used again.
//
// Intended for scenes that flatten+tessellate the same paths every frame (particles, procedural
// shapes) to avoid per-frame heap allocation. The pool itself has no fixed capacity; released
// meshes are held until the pool grows beyond the high-water mark, then excess meshes are dropped.
// Each acquire/release pair is a matching bracket — do not acquire without releasing.
export function acquirePathMesh(path: Readonly<Path>, tolerance = 0.25): PathMesh {
  const mesh = pathMeshPool.length > 0 ? pathMeshPool.pop()! : { vertices: [], indices: [] };
  tessellatePathInto(path, mesh, tolerance);
  return mesh;
}

// Pool-backed flatten+tessellate returning a `PathMeshTyped` (Float32Array / Uint32Array). The same
// acquire/release contract applies: one matching `releasePathMeshTyped` per `acquirePathMeshTyped`.
// Typed arrays are grow-only: reused when the new mesh fits, reallocated when it exceeds capacity.
export function acquirePathMeshTyped(path: Readonly<Path>, tolerance = 0.25): PathMeshTyped {
  const mesh = typedPool.length > 0 ? typedPool.pop()! : { vertices: new Float32Array(0), indices: new Uint32Array(0) };
  tessellatePathTypedInto(path, mesh, tolerance);
  return mesh;
}

// Returns a `PathMesh` previously obtained from `acquirePathMesh` to the pool.
// The mesh must not be used after this call.
export function releasePathMesh(mesh: PathMesh): void {
  if (pathMeshPool.length < POOL_HIGH_WATER) {
    pathMeshPool.push(mesh);
  }
}

// Returns a `PathMeshTyped` previously obtained from `acquirePathMeshTyped` to the pool.
export function releasePathMeshTyped(mesh: PathMeshTyped): void {
  if (typedPool.length < POOL_HIGH_WATER) {
    typedPool.push(mesh);
  }
}

// Maximum number of meshes held in each pool. Beyond this count, released meshes are dropped.
// A single active scene rarely needs more than a few dozen simultaneous meshes; 64 is a generous
// upper bound that still keeps pool overhead negligible.
const POOL_HIGH_WATER = 64;
const pathMeshPool: PathMesh[] = [];
const typedPool: PathMeshTyped[] = [];
