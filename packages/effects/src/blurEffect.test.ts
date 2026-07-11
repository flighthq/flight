import { createBlurEffect } from './blurEffect';

describe('createBlurEffect', () => {
  it('sets the kind', () => {
    expect(createBlurEffect().kind).toBe('BlurEffect');
  });

  it('defaults to no options beyond kind', () => {
    expect(createBlurEffect()).toEqual({ kind: 'BlurEffect' });
  });

  it('carries through blurX and blurY', () => {
    const effect = createBlurEffect({ blurX: 6, blurY: 3 });
    expect(effect.blurX).toBe(6);
    expect(effect.blurY).toBe(3);
  });
});
