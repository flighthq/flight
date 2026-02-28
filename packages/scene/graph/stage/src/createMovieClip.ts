import type { MovieClip, MovieClipData, PartialWithData } from '@flighthq/types';

import { createPrimitive } from './internal/createPrimitive';

export function createMovieClip(obj?: PartialWithData<MovieClip>): MovieClip {
  return createPrimitive<MovieClip, MovieClipData>('movieclip', obj, createMovieClipData);
}

export function createMovieClipData(data?: Partial<MovieClipData>): MovieClipData {
  return {
    timeline: data?.timeline ?? null,
  };
}
