import MovieClip from './MovieClip.js';

describe('MovieClip', () => {
  // Constructor

  it('can be instantiated', () => {
    const movieClip = new MovieClip();
    expect(movieClip).toBeInstanceOf(MovieClip);
  });
});
