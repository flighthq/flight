import type { Spritesheet } from '../../../animation/spritesheet';
import type { Rectangle } from '../../../geometry';
import type { SpriteBase, SpriteBaseData } from './SpriteBase';

export interface SpriteData extends SpriteBaseData {
  id: number;
  rect: Rectangle | null;
  spritesheet: Spritesheet | null;
}

export interface Sprite extends SpriteBase {
  data: SpriteData;
}

export const SpriteKind: unique symbol = Symbol('Sprite');
