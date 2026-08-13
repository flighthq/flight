import type { EmissiveModifierFacing } from './EmissiveModifier';
import type { Texture } from './Texture';

export interface EmissiveModifierOptions {
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding EmissiveModifier.color.
  color: number;
  strength?: number;
  mask?: Texture;
  facing?: EmissiveModifierFacing;
  facingSoftness?: number;
}
