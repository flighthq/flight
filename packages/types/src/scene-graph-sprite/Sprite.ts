import type { TextureAtlas } from '../assets';
import type { Rectangle } from '../geometry';
import type { SpriteNode, SpriteNodeData } from './SpriteNode';

export interface SpriteData extends SpriteNodeData {
  atlas: TextureAtlas | null;
  id: number;
  rect: Rectangle | null;
}

export interface Sprite extends SpriteNode {
  data: SpriteData;
}

export const SpriteKind: unique symbol = Symbol('Sprite');
