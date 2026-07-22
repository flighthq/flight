import type { AmbientLight } from './AmbientLight';
import type { DirectionalLight } from './DirectionalLight';
import type { Entity, EntityWithoutRuntime } from './Entity';
import type { HemisphereLight } from './HemisphereLight';
import type { PointLight } from './PointLight';
import type { SpotLight } from './SpotLight';

// The set of light DATA descriptors passed to one drawScene call as a draw-argument (lights are
// not scene members: `scene` = what exists, `camera`/`lights` = what we render now). It carries at
// most one directional + one ambient term (either null when absent) plus arrays of point, spot, and
// hemisphere lights. prepareSceneRender resolves this into the packed SceneLightBlock (sRgb->linear
// at pack time), packing at most MAX_FORWARD_LIGHTS of each punctual type and dropping any excess.
//
// The punctual arrays are optional: an omitted array reads as none, so a caller with only a sun +
// ambient writes just those two fields. (The single directional/ambient stay required-nullable —
// "one or none"; the arrays are "zero or more", hence optional-empty rather than nullable.)
export interface SceneLights extends Entity {
  ambient: Readonly<AmbientLight> | null;
  directional: Readonly<DirectionalLight> | null;
  hemisphere?: readonly Readonly<HemisphereLight>[];
  point?: readonly Readonly<PointLight>[];
  spot?: readonly Readonly<SpotLight>[];
}

// Structural input accepted by light packing/draw operations. The createSceneLights product itself is
// Entity-backed; callers that already own a plain descriptor can still pass it as input without
// manufacturing identity solely for one draw.
export type SceneLightsLike = EntityWithoutRuntime<SceneLights>;
