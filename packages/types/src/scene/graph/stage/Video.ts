import type { DisplayObject, PrimitiveData } from './DisplayObject';

export interface VideoData extends PrimitiveData {
  smoothing: boolean;
}

export interface Video extends DisplayObject {
  data: VideoData;
}
