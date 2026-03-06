import type { DisplayObject } from './DisplayObject';
import type { VideoData } from './VideoData';

export interface Video extends DisplayObject {
  data: VideoData;
}
