import type { LightUnit } from './LightUnit';
import type { Vector3Like } from './Vector3';

// Shadow options are retained as future area-shadow intent only. Current scene3d-gl/scene3d-wgpu
// area lights do not consume them.
export interface AreaLightOptions {
  castsShadow?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding AreaLight.color. Default 0xffffffff.
  color?: number;
  // Distance falloff exponent. Defaults to the inverse-square value 2.
  decay?: number;
  direction?: Readonly<Vector3Like>;
  enabled?: boolean;
  intensity?: number;
  // Unit tag for the stored intensity scalar. Defaults to Unitless.
  intensityUnit?: LightUnit;
  normalBias?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  // Half-extent axis along the rectangle's width; its length encodes the half-width.
  right?: Readonly<Vector3Like>;
  shadowBias?: number;
  shadowFar?: number;
  shadowMapSize?: number;
  shadowNear?: number;
  shadowStrength?: number;
  // Half-extent axis along the rectangle's height; its length encodes the half-height.
  up?: Readonly<Vector3Like>;
}
