import type { MovieClip, MovieClipData, MovieClipRuntime, PartialNode } from '@flighthq/types';
import { MovieClipKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function createMovieClip(obj?: Readonly<PartialNode<MovieClip>>): MovieClip {
  return createDisplayObjectGeneric(MovieClipKind, obj, createMovieClipData, createMovieClipRuntime) as MovieClip;
}

export function createMovieClipData(data?: Readonly<Partial<MovieClipData>>): MovieClipData {
  return {
    timeline: data?.timeline ?? null,
  };
}

export function createMovieClipRuntime(): MovieClipRuntime {
  const out = createDisplayObjectRuntime() as MovieClipRuntime;
  out.movieClipSignals = null;
  return out;
}

export function getMovieClipRuntime(source: Readonly<MovieClip>): Readonly<MovieClipRuntime> {
  return getDisplayObjectRuntime(source) as MovieClipRuntime;
}
