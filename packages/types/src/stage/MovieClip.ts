import type DisplayObject from './DisplayObject';
import type MovieClipData from './MovieClipData';

export default interface MovieClip extends DisplayObject {
  data: MovieClipData;
}
