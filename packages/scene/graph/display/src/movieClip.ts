import type { MovieClip, MovieClipData, PartialWithData } from '@flighthq/types';
import { MovieClipKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createMovieClip(obj?: Readonly<PartialWithData<MovieClip>>): MovieClip {
  return createDisplayObjectGeneric(MovieClipKind, obj, createMovieClipData) as MovieClip;
}

export function createMovieClipData(data?: Readonly<Partial<MovieClipData>>): MovieClipData {
  return {
    timeline: data?.timeline ?? null,
  };
}
