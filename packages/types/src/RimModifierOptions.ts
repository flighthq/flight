export interface RimModifierOptions {
  // Packed sRGB RGBA (`0xRRGGBBAA`), seeding RimModifier.color.
  color: number;
  power?: number;
  intensity?: number;
  bias?: number;
}
