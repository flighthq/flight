import type { MovieClip, MovieClipData, PartialWithData } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createMovieClip(obj: PartialWithData<MovieClip> = {}): MovieClip {
  if (obj.data === undefined) obj.data = {} as MovieClipData;
  if (obj.data.timeline === undefined) obj.data.timeline = null;
  if (obj.type === undefined) obj.type = 'movieclip';
  return createDisplayObject(obj) as MovieClip;
}
