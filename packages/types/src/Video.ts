import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { VideoResource } from './VideoResource';

export interface VideoData extends DisplayObjectData {
  smoothing: boolean;
  source: VideoResource | null;
}

export interface VideoRuntime extends DisplayObjectRuntime {}

export interface Video extends DisplayObject {
  data: VideoData;
}

export const VideoKind: unique symbol = Symbol('Video');
