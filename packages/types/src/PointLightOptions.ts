import type { Vector3Like } from './Vector3';

export interface PointLightOptions {
  castsShadow?: boolean;
  color?: number;
  intensity?: number;
  normalBias?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  shadowBias?: number;
}
