import type { Path, PathMeshTyped } from '@flighthq/types/contract';

import { tessellatePath } from './tessellatePath';

// Triangulates a path's fill into a `PathMeshTyped` using `Float32Array` vertices and `Uint32Array`
// indices, ready for zero-copy GPU buffer upload. Internally delegates to `tessellatePath` and
// copies the result into typed arrays. Use `tessellatePath` directly if `number[]` buffers suffice.
export function tessellatePathTyped(path: Readonly<Path>, tolerance = 0.25): PathMeshTyped {
  const mesh = tessellatePath(path, tolerance);
  return {
    vertices: new Float32Array(mesh.vertices),
    indices: new Uint32Array(mesh.indices),
  };
}

// Tessellates into an existing `PathMeshTyped`, reusing its typed arrays when they are large enough
// and reallocating grow-only when the new mesh exceeds their capacity.
export function tessellatePathTypedInto(path: Readonly<Path>, out: PathMeshTyped, tolerance = 0.25): void {
  const mesh = tessellatePath(path, tolerance);
  const vLen = mesh.vertices.length;
  const iLen = mesh.indices.length;
  if (out.vertices.length < vLen) out.vertices = new Float32Array(vLen);
  if (out.indices.length < iLen) out.indices = new Uint32Array(iLen);
  for (let i = 0; i < vLen; i++) out.vertices[i] = mesh.vertices[i];
  for (let i = 0; i < iLen; i++) out.indices[i] = mesh.indices[i];
}
