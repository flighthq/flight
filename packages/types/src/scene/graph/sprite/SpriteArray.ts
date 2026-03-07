import type { Sprite } from './Sprite';

export interface SpriteArray extends Sprite {
  data: Float32Array;
}
