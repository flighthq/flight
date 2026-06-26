import type { Mesh } from './Mesh';

// Result of a successful scene pick (a camera ray hitting a Mesh's geometry). `distance` is the
// parametric `t` along the pick ray in world units (the world-space hit point is `point`). `u`/`v`/`w`
// are the barycentric weights of the hit triangle's first/second/third vertex, so the hit point is
// `u*A + v*B + w*C` with `u + v + w === 1`.
export interface SceneHit {
  node: Mesh;
  distance: number;
  u: number;
  v: number;
  w: number;
  pointX: number;
  pointY: number;
  pointZ: number;
}
