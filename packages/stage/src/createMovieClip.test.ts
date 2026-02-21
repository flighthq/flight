import type { MovieClip } from '@flighthq/types';

import { createMovieClip } from './createMovieClip';

describe('createMovieClip', () => {
  let movieClip: MovieClip;

  beforeEach(() => {
    movieClip = createMovieClip();
  });

  it('initializes default values', () => {
    expect(movieClip.data).toBeNull();
  });
});
