import type { Entity } from './Entity';
import type { Mesh } from './Mesh';

// Result of a successful scene pick (a camera or world ray hitting a Mesh's geometry). `distance` is
// the parametric `t` along the pick ray in world units (the world-space hit point is `point`).
// `triangleIndex` is the zero-based index of the hit triangle within the mesh's geometry (the i-th
// triangle in index order). `u`/`v`/`w` are the barycentric weights of that triangle's
// first/second/third vertex, so the hit point is `u*A + v*B + w*C` with `u + v + w === 1`.
// `normalX`/`normalY`/`normalZ` are the triangle's unit geometric face normal in world space (the
// normalized cross product of two edges), matching the flat-scalar shape of `pointX/Y/Z`.
export interface SceneHit extends Entity {
  node: Mesh;
  distance: number;
  triangleIndex: number;
  u: number;
  v: number;
  w: number;
  pointX: number;
  pointY: number;
  pointZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
}
