import type { Vector3Like } from './Vector3';

export interface DirectionalLightOptions {
  // Enables the explicit directional shadow-map pass when this light is passed to it.
  castsShadow?: boolean;
  color?: number;
  direction?: Readonly<Vector3Like>;
  intensity?: number;
  normalBias?: number;
  // Integer PCF kernel radius in shadow-map texels: 0 = one tap, 1 = 3x3. Renderers truncate and clamp
  // to MAX_DIRECTIONAL_SHADOW_PCF_RADIUS.
  pcfRadius?: number;
  shadowBias?: number;
}
