import type { Spritesheet } from '../../../animation/spritesheet';
import type { Rectangle } from '../../../geometry';
import type { SpriteNode, SpriteNodeData } from './SpriteNode';

export interface SpriteData extends SpriteNodeData {
  id: number;
  rect: Rectangle | null;
  spritesheet: Spritesheet | null;
}

export interface Sprite extends SpriteNode {
  data: SpriteData;
}

export const SpriteKind: unique symbol = Symbol('Sprite');
