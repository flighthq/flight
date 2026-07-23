import type { Mesh } from './Mesh';

// Options for a scene pick raycast. `predicate` is an include/exclude test per mesh (it does not prune
// the mesh's descendants); `maxDistance` rejects hits whose ray-parametric distance `t` exceeds it (in
// the ray's direction-length units — world distance for a unit-length camera ray); `cullBackfaces`
// discards back-facing triangle hits (the default is double-sided).
export interface ScenePickOptions {
  cullBackfaces?: boolean;
  maxDistance?: number;
  predicate?: (mesh: Readonly<Mesh>) => boolean;
}
