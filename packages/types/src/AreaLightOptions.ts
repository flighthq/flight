import type { Vector3Like } from './Vector3';

// Shadow options are retained as future area-shadow intent only. Current scene3d-gl/scene3d-wgpu
// area lights do not consume castsShadow, normalBias, pcfRadius, or shadowBias.
export interface AreaLightOptions {
  castsShadow?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding AreaLight.color. Default 0xffffffff.
  color?: number;
  direction?: Readonly<Vector3Like>;
  intensity?: number;
  normalBias?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  // Half-extent axis along the rectangle's width; its length encodes the half-width.
  right?: Readonly<Vector3Like>;
  shadowBias?: number;
  // Half-extent axis along the rectangle's height; its length encodes the half-height.
  up?: Readonly<Vector3Like>;
}
