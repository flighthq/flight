import type { Effect } from './Effect';

export interface OutlineEffect extends Effect {
  kind: 'OutlineEffect';
  threshold?: number;
  thickness?: number;
  // Packed sRGB RGBA (`0xRRGGBBAA`); both backend runners read the alpha channel.
  color?: number;
}
