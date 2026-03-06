import { type MovieClip, MovieClipKind, type Timeline } from '@flighthq/types';

import { createMovieClip } from './createMovieClip';

describe('createMovieClip', () => {
  let movieClip: MovieClip;

  beforeEach(() => {
    movieClip = createMovieClip();
  });

  it('initializes default values', () => {
    expect(movieClip.data.timeline).toBeNull();
    expect(movieClip.kind).toBe(MovieClipKind);
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
