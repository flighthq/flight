import type { FogModifierMode } from './FogModifier';

export interface FogModifierOptions {
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding FogModifier.color.
  color: number;
  mode?: FogModifierMode;
  near?: number;
  far?: number;
  density?: number;
}
