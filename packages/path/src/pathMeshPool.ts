import type { Path, PathMesh, PathMeshTyped } from '@flighthq/types';

import { tessellatePath } from './tessellatePath';
import { tessellatePathTyped } from './tessellatePathTyped';

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
  // Reuse backing arrays: clear them and re-tessellate in place.
  mesh.vertices.length = 0;
  mesh.indices.length = 0;
  const fresh = tessellatePath(path, tolerance);
  // Copy into the pooled mesh rather than replacing, to preserve the array identity the caller
  // receives (important if the caller passed an array reference into a renderer upload).
  for (let i = 0; i < fresh.vertices.length; i++) mesh.vertices[i] = fresh.vertices[i];
  mesh.vertices.length = fresh.vertices.length;
  for (let i = 0; i < fresh.indices.length; i++) mesh.indices[i] = fresh.indices[i];
  mesh.indices.length = fresh.indices.length;
  return mesh;
}

// Pool-backed flatten+tessellate returning a `PathMeshTyped` (Float32Array / Uint32Array). The same
// acquire/release contract applies: one matching `releasePathMeshTyped` per `acquirePathMeshTyped`.
export function acquirePathMeshTyped(path: Readonly<Path>, tolerance = 0.25): PathMeshTyped {
  // Typed array meshes are reallocated on each acquire (the underlying ArrayBuffer cannot be
  // resized to a different length). Pooling amortizes the allocation when the path data size is
  // stable across frames; if size varies significantly the gain is smaller.
  const fresh = tessellatePathTyped(path, tolerance);
  const mesh = typedPool.length > 0 ? typedPool.pop()! : { vertices: new Float32Array(0), indices: new Uint32Array(0) };
  mesh.vertices = fresh.vertices;
  mesh.indices = fresh.indices;
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
