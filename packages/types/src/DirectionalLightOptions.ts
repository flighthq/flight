import type { Vector3Like } from './Vector3';

export interface DirectionalLightOptions {
  castsShadow?: boolean;
  color?: number;
  direction?: Readonly<Vector3Like>;
  intensity?: number;
  normalBias?: number;
  pcfRadius?: number;
  shadowBias?: number;
}
