import type { Vector3Like } from './Vector3';

export interface AreaLightOptions {
  castsShadow?: boolean;
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
