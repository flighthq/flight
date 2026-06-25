import type { Path, PathMeshTyped } from '@flighthq/types';

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
