import type { MovieClip, Timeline } from '@flighthq/types';
import { MovieClipKind } from '@flighthq/types';

import { createMovieClip } from './movieClip';

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
