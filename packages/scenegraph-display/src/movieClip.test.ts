import type { MovieClip, Timeline } from '@flighthq/types';
import { MovieClipKind } from '@flighthq/types';

import { createMovieClip, createMovieClipData, createMovieClipRuntime, getMovieClipRuntime } from './movieClip';

describe('createMovieClip', () => {
  let movieClip: MovieClip;

  beforeEach(() => {
    movieClip = createMovieClip();
  });

  it('initializes default values', () => {
    expect(movieClip.data.timeline).toBeNull();
    expect(movieClip.kind).toStrictEqual(MovieClipKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        timeline: {} as Timeline,
      },
    };
    const obj = createMovieClip(base);
    expect(obj.data.timeline).toStrictEqual(base.data.timeline);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createMovieClip(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createMovieClipData', () => {
  it('returns default values', () => {
    const data = createMovieClipData();
    expect(data.timeline).toBeNull();
  });

  it('allows pre-defined values', () => {
    const timeline = {} as Timeline;
    const data = createMovieClipData({ timeline });
    expect(data.timeline).toBe(timeline);
  });
});

describe('createMovieClipRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createMovieClipRuntime();
    expect(runtime).not.toBeNull();
  });

  it('initializes movieClipSignals to null', () => {
    const runtime = createMovieClipRuntime();
    expect(runtime.movieClipSignals).toBeNull();
  });
});

describe('getMovieClipRuntime', () => {
  it('returns the runtime for a MovieClip', () => {
    const movieClip = createMovieClip();
    const runtime = getMovieClipRuntime(movieClip);
    expect(runtime).not.toBeNull();
  });
});
