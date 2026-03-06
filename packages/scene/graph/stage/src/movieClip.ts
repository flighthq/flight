import { type MovieClip, type MovieClipData, MovieClipKind, type PartialWithData } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createMovieClip(obj?: PartialWithData<MovieClip>): MovieClip {
  return createPrimitive<MovieClip, MovieClipData>(MovieClipKind, obj, createMovieClipData);
}

export function createMovieClipData(data?: Partial<MovieClipData>): MovieClipData {
  return {
    timeline: data?.timeline ?? null,
  };
}
