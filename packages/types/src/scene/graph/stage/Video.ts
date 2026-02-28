import type DisplayObject from './DisplayObject';
import type VideoData from './VideoData';

export default interface Video extends DisplayObject {
  data: VideoData;
}
