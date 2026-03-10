import type { SpriteBase } from '../sprite/SpriteBase';
import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface SpriteGraphContainerData extends DisplayObjectData {
  graph: SpriteBase | null;
  smoothing: boolean;
}

export interface SpriteGraphContainer extends DisplayObject {
  data: SpriteGraphContainerData;
}

export const SpriteGraphContainerKind: unique symbol = Symbol('SpriteGraphContainer');
