import type { Rectangle } from './Rectangle';
import type { SpriteNode, SpriteNodeData, SpriteNodeRuntime } from './SpriteNode';
import type { TextureAtlas } from './TextureAtlas';

export interface SpriteData extends SpriteNodeData {
  atlas: TextureAtlas | null;
  id: number;
  rect: Rectangle | null;
}

export interface SpriteRuntime extends SpriteNodeRuntime {}

export interface Sprite extends SpriteNode {
  data: SpriteData;
}

export const SpriteKind: unique symbol = Symbol('Sprite');
