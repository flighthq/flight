import type { LightUnit } from './LightUnit';

export interface AmbientLightOptions {
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding AmbientLight.color. Default 0xffffffff.
  color?: number;
  enabled?: boolean;
  intensity?: number;
  // Unit tag for the stored intensity scalar. Defaults to Unitless.
  intensityUnit?: LightUnit;
}
