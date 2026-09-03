import type { LightUnit } from './LightUnit';
import type { Vector3Like } from './Vector3';

// Shadow options are retained as future point-shadow intent only. Current scene3d-gl/scene3d-wgpu
// point lights do not consume them.
export interface PointLightOptions {
  castsShadow?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding PointLight.color. Default 0xffffffff.
  color?: number;
  // Distance falloff exponent. Defaults to the inverse-square value 2.
  decay?: number;
  enabled?: boolean;
  intensity?: number;
  // Unit tag for the stored intensity scalar. Defaults to Unitless.
  intensityUnit?: LightUnit;
  normalBias?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  shadowBias?: number;
  shadowFar?: number;
  shadowMapSize?: number;
  shadowNear?: number;
  shadowStrength?: number;
}
