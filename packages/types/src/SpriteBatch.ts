import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { SpriteNode } from './SpriteNode';

export interface SpriteBatchData extends DisplayObjectData {
  graph: SpriteNode | null;
  smoothing: boolean;
}

export interface SpriteBatchRuntime extends DisplayObjectRuntime {}

export interface SpriteBatch extends DisplayObject {
  data: SpriteBatchData;
}

export const SpriteBatchKind: unique symbol = Symbol('SpriteBatch');
