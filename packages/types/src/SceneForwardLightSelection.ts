import type { PointLight } from './PointLight';
import type { SpotLight } from './SpotLight';

// The punctual lights selected for one object's forward-light budget. `point` and `spot` are mutable
// output arrays owned by the caller; selectSceneForwardLights overwrites their live lengths without
// allocating. Their combined length never exceeds MAX_FORWARD_LIGHTS. Directional, ambient, and
// hemisphere lights remain scene-global and therefore do not appear in this per-object selection.
export interface SceneForwardLightSelection {
  // Combined input indices (points first, then spots) in contribution-ranked order. This tuple is a
  // stable identity key callers can use to deduplicate identical selections without object hashing.
  indices: number[];
  point: Readonly<PointLight>[];
  spot: Readonly<SpotLight>[];
}
