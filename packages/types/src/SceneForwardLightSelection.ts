import type { PointLight } from './PointLight';
import type { SpotLight } from './SpotLight';

// The punctual lights selected for one object's forward-light budget. `point` and `spot` are mutable
// output arrays owned by the caller; selectSceneForwardLights overwrites their live lengths without
// allocating. Each array independently contains at most MAX_FORWARD_LIGHTS, matching the shader's
// separate point/spot budgets. Directional, ambient, and hemisphere lights remain scene-global and
// therefore do not appear in this per-object selection.
export interface SceneForwardLightSelection {
  // Contribution-ranked family-local input indices used as a stable deduplication key. Point indices
  // are non-negative; spot indices use their bitwise complement (negative), preventing cross-family
  // collisions without object hashing.
  indices: number[];
  point: Readonly<PointLight>[];
  spot: Readonly<SpotLight>[];
}
