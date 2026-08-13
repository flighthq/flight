import type { Texture } from './Texture';

export interface DissolveModifierOptions {
  threshold: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding DissolveModifier.edgeColor.
  edgeColor?: number;
  edgeWidth?: number;
  map?: Texture;
  scale?: number;
}
