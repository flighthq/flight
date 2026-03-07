import { DisplayObjectType, type MovieClip, type MovieClipData, type PartialWithData } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createMovieClip(obj?: PartialWithData<MovieClip>): MovieClip {
  return createPrimitive(DisplayObjectType.MovieClip, obj, createMovieClipData) as MovieClip;
}

export function createMovieClipData(data?: Partial<MovieClipData>): MovieClipData {
  return {
    timeline: data?.timeline ?? null,
  };
}
