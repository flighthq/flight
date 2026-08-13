import type { RenderEffect } from './RenderEffect';

export interface OutlineEffect extends RenderEffect {
  kind: 'OutlineEffect';
  threshold?: number;
  thickness?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`); both backend runners read the alpha channel.
  color?: number;
}
