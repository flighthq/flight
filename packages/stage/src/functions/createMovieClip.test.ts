import { createMovieClip } from './createMovieClip';

describe('createMovieClip', () => {
  it('can be instantiated', () => {
    const movieClip = createMovieClip();
    expect(movieClip).not.toBeNull();
  });
});
