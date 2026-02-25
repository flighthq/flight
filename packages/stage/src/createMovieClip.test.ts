import type { MovieClip, Timeline } from '@flighthq/types';

import { createMovieClip } from './createMovieClip';

describe('createMovieClip', () => {
  let movieClip: MovieClip;

  beforeEach(() => {
    movieClip = createMovieClip();
  });

  it('initializes default values', () => {
    expect(movieClip.data.timeline).toBeNull();
    expect(movieClip.type).toBe('movieclip');
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
});
