import type { EmissiveModifierFacing } from './EmissiveModifier';
import type { Texture } from './Texture';

export interface EmissiveModifierOptions {
  color: number;
  strength?: number;
  mask?: Texture;
  facing?: EmissiveModifierFacing;
  facingSoftness?: number;
}
