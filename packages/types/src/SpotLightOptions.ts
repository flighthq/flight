import type { Vector3Like } from './Vector3';

export interface SpotLightOptions {
  castsShadow?: boolean;
  color?: number;
  direction?: Readonly<Vector3Like>;
  // Inner cone half-angle in degrees; full intensity inside it. Defaults to 0 (a sharp center).
  innerConeDegrees?: number;
  intensity?: number;
  normalBias?: number;
  // Outer cone half-angle in degrees; intensity reaches zero at it. Defaults to 45.
  outerConeDegrees?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  shadowBias?: number;
}
