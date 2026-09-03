import type { LightUnit } from './LightUnit';
import type { Vector3Like } from './Vector3';

// Shadow options are retained as future spot-shadow intent only. Current scene3d-gl/scene3d-wgpu
// spot lights do not consume them.
export interface SpotLightOptions {
  castsShadow?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding SpotLight.color. Default 0xffffffff.
  color?: number;
  // Distance falloff exponent. Defaults to the inverse-square value 2.
  decay?: number;
  direction?: Readonly<Vector3Like>;
  enabled?: boolean;
  // Inner cone half-angle in degrees; full intensity inside it. Defaults to 0 (a sharp center).
  innerConeDegrees?: number;
  intensity?: number;
  // Unit tag for the stored intensity scalar. Defaults to Unitless.
  intensityUnit?: LightUnit;
  normalBias?: number;
  // Outer cone half-angle in degrees; intensity reaches zero at it. Defaults to 45.
  outerConeDegrees?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  shadowBias?: number;
  shadowFar?: number;
  shadowMapSize?: number;
  shadowNear?: number;
  shadowStrength?: number;
  // Normalized penumbra blend in [0, 1]. Defaults to 0.
  spotBlend?: number;
}
