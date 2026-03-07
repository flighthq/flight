import type { Sprite } from '../sprite';
import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface SpriteBatchData extends DisplayObjectData {
  batch: Sprite | null;
  smoothing: boolean;
}

export interface SpriteBatch extends DisplayObject {
  data: SpriteBatchData;
}
