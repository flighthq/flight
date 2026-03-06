import type { DisplayObject } from './DisplayObject';
import type { MovieClipData } from './MovieClipData';

export interface MovieClip extends DisplayObject {
  data: MovieClipData;
}
