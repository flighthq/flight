import type { DisplayObject } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createMovieClip(obj: Partial<DisplayObject> = {}): DisplayObject {
  obj.type = 'movieclip';
  return createDisplayObject(obj);
}
