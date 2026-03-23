import type { SpriteNode } from '../sprite/SpriteNode';
import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface SpriteContainerData extends DisplayObjectData {
  graph: SpriteNode | null;
  smoothing: boolean;
}

export interface SpriteContainer extends DisplayObject {
  data: SpriteContainerData;
}

export const SpriteContainerKind: unique symbol = Symbol('SpriteContainer');
