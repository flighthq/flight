import type { EmissiveModifierFacing } from './EmissiveModifier.ts';
import type { Texture } from './Texture.ts';

export interface EmissiveModifierOptions {
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding EmissiveModifier.color.
  color: number;
  strength?: number;
  mask?: Texture;
  facing?: EmissiveModifierFacing;
  facingSoftness?: number;
}
