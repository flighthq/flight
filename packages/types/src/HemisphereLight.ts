import type { Light } from './Light';
import type { LightUnit } from './LightUnit';

// Gradient ambient: `skyColor` from above, `groundColor` from below, blended by the surface
// normal's vertical component. Does not cast shadows.
export interface HemisphereLight extends Light {
  enabled: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), the lower hemisphere's radiance before intensity.
  groundColor: number;
  intensity: number;
  intensityUnit: LightUnit;
  kind: 'HemisphereLight';
  // Packed sRGB RGBA (`0xRRGGBBAA`), the upper hemisphere's radiance before intensity.
  skyColor: number;
}

export const HemisphereLightKind = 'HemisphereLight';
