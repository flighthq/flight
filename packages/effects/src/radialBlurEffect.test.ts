import { createRadialBlurEffect } from './radialBlurEffect';

describe('createRadialBlurEffect', () => {
  it('tags the intent type', () => {
    expect(createRadialBlurEffect().kind).toBe('RadialBlurEffect');
  });

  it('carries options', () => {
    expect(createRadialBlurEffect({ centerX: 0.5, centerY: 0.5, strength: 0.2 })).toMatchObject({
      centerX: 0.5,
      centerY: 0.5,
      strength: 0.2,
    });
  });
});
