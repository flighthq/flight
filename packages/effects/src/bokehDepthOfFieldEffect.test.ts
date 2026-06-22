import { createBokehDepthOfFieldEffect } from './bokehDepthOfFieldEffect';

describe('createBokehDepthOfFieldEffect', () => {
  it('tags the intent type', () => {
    expect(createBokehDepthOfFieldEffect().kind).toBe('BokehDepthOfFieldEffect');
  });

  it('carries options', () => {
    expect(createBokehDepthOfFieldEffect({ focusDistance: 0.5, focusRange: 0.2, maxBlur: 4 })).toMatchObject({
      focusDistance: 0.5,
      focusRange: 0.2,
      maxBlur: 4,
    });
  });
});
