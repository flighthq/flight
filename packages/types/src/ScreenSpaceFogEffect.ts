import type { RenderEffect } from './RenderEffect';

export interface ScreenSpaceFogEffect extends RenderEffect {
  kind: 'ScreenSpaceFogEffect'; // [DEPTH]
  // Packed sRGB RGBA (`0xRRGGBBAA`). Default 0xc8d2dcff.
  color?: number;
  near?: number;
  far?: number;
  density?: number;
}
