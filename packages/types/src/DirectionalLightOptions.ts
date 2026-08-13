import type { Vector3Like } from './Vector3';

export interface DirectionalLightOptions {
  // Enables the explicit directional shadow-map pass when this light is passed to it.
  castsShadow?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding DirectionalLight.color. Default 0xffffffff.
  color?: number;
  direction?: Readonly<Vector3Like>;
  intensity?: number;
  // Receiver offset along the geometric normal in shadow-map texels. Renderers convert this through
  // the orthographic shadow projection so the relative offset follows a fitted map's scene scale.
  normalBias?: number;
  // Integer PCF kernel radius in shadow-map texels: 0 = one tap, 1 = 3x3. Renderers truncate and clamp
  // to MAX_DIRECTIONAL_SHADOW_PCF_RADIUS.
  pcfRadius?: number;
  // Receiver depth-compare offset in normalized shadow depth.
  shadowBias?: number;
}
