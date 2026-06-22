import type { AmbientLight, DirectionalLight } from './Light';

// The set of light DATA descriptors passed to one drawScene call as a draw-argument (lights are
// not scene members: `scene` = what exists, `camera`/`lights` = what we render now). This proving
// slice carries at most one directional + one ambient term; either may be null when absent.
// prepareSceneRender resolves this into the packed SceneLightBlock (sRgb->linear at pack time).
// The shape grows to MAX_FORWARD_LIGHTS punctual lights (point/spot arrays) in later passes.
export interface SceneLights {
  ambient: Readonly<AmbientLight> | null;
  directional: Readonly<DirectionalLight> | null;
}
