import type { LightUnit } from './LightUnit';

export interface HemisphereLightOptions {
  enabled?: boolean;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding HemisphereLight.groundColor.
  groundColor?: number;
  intensity?: number;
  // Unit tag for the stored intensity scalar. Defaults to Unitless.
  intensityUnit?: LightUnit;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding HemisphereLight.skyColor.
  skyColor?: number;
}
