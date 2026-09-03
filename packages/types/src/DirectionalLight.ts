import type { Light } from './Light';
import type { LightUnit } from './LightUnit';
import type { Vector3 } from './Vector3';

// Infinitely distant directional light (sun). `direction` is the world-space travel direction
// of the light (normalized); surfaces are lit from -direction.
//
// One exception, and it is the document stage only: inside a `Scene3DDocumentLight` this vector is the
// canonical LOCAL -Z axis and the document light's `transform` carries the aim, per that type's placement
// convention. Anything a renderer consumes — `Scene3DLights`, `packScene3DLightBlock` — is world-space.
export interface DirectionalLight extends Light {
  // One cascade preserves the historical single directional shadow-map behavior.
  cascadeCount: number;
  // Normalized far split for each cascade; the default single cascade ends at 1.
  cascadeSplits: number[];
  // Enables the explicit directional shadow-map pass when this light is passed to it.
  castsShadow: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`); radiance is unpackColorToLinear(color) x intensity.
  color: number;
  direction: Vector3;
  enabled: boolean;
  intensity: number;
  intensityUnit: LightUnit;
  kind: 'DirectionalLight';
  // Receiver offset along the geometric normal, measured in shadow-map texels. The renderer converts
  // it through the orthographic shadow projection, so a fitted map keeps the same relative bias as the
  // scene scale changes.
  normalBias: number;
  // Integer PCF kernel radius in shadow-map texels; see MAX_DIRECTIONAL_SHADOW_PCF_RADIUS.
  pcfRadius: number;
  // Receiver depth-compare offset in normalized shadow depth.
  shadowBias: number;
  // Far clip distance, in world units, for a renderer-authored shadow camera.
  shadowFar: number;
  // Requested square shadow-map resolution.
  shadowMapSize: number;
  // Near clip distance, in world units, for a renderer-authored shadow camera.
  shadowNear: number;
  // Shadow opacity in [0, 1].
  shadowStrength: number;
}

export const DirectionalLightKind = 'DirectionalLight';

// Both GPU backends allocate directional shadow maps at this square resolution. Keeping the resource
// dimension in the shared contract makes the depth pass, receiver-bias conversion, and cross-backend
// raster witnesses agree from one source of truth.
export const DIRECTIONAL_SHADOW_MAP_SIZE = 1024;

// Directional PCF uses a square (2r+1)^2 comparison kernel. Renderers truncate authored radii to an
// integer and clamp them to this cap, keeping the worst case at 25 comparisons on both GL and WGPU.
// Radius 0 is one comparison tap; radius 1 is a 3x3 kernel; radius 2 is a 5x5 kernel.
export const MAX_DIRECTIONAL_SHADOW_PCF_RADIUS = 2;
