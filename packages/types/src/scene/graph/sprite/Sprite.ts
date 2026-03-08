import type { Spritesheet } from '../../../assets';
import type { Rectangle } from '../../../geometry';
import type { SpriteBase } from './SpriteBase';

export interface Sprite extends SpriteBase {
  id: number;
  rect: Rectangle | null;
  spritesheet: Spritesheet | null;
}
