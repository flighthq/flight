import type { SpriteBase } from '../sprite/SpriteBase';
import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface SpriteBatchData extends DisplayObjectData {
  batch: SpriteBase | null;
  smoothing: boolean;
}

export interface SpriteBatch extends DisplayObject {
  data: SpriteBatchData;
}
