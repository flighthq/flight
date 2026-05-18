import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface VideoData extends DisplayObjectData {
  smoothing: boolean;
}

export interface Video extends DisplayObject {
  data: VideoData;
}

export const VideoKind: unique symbol = Symbol('Video');
