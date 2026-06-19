import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { Rectangle } from './Rectangle';
import type { TextureAtlas } from './TextureAtlas';

export interface SpriteData extends DisplayObjectData {
  atlas: TextureAtlas | null;
  id: number;
  rect: Rectangle | null;
}

export interface SpriteRuntime extends DisplayObjectRuntime {}

export interface Sprite extends DisplayObject {
  data: SpriteData;
}

export const SpriteKind: unique symbol = Symbol('Sprite');
