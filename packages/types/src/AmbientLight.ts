import type { Light } from './Light';
import type { LightUnit } from './LightUnit';

// Uniform omnidirectional fill. No position or direction; lights every surface equally. Does
// not cast shadows.
export interface AmbientLight extends Light {
  // Packed sRGB RGBA (`0xRRGGBBAA`). Radiance is unpackColorToLinear(color) x intensity,
  // so alpha plays no part in lighting — it is carried for uniformity with every other SDK color.
  color: number;
  enabled: boolean;
  intensity: number;
  intensityUnit: LightUnit;
  kind: 'AmbientLight';
}

export const AmbientLightKind = 'AmbientLight';
