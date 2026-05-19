import type { SpriteNode } from '../scenegraph-sprite/SpriteNode';
import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface SpriteBatchData extends DisplayObjectData {
  graph: SpriteNode | null;
  smoothing: boolean;
}

export interface SpriteBatch extends DisplayObject {
  data: SpriteBatchData;
}

export const SpriteBatchKind: unique symbol = Symbol('SpriteBatch');
