import { createHalftoneEffect } from './halftoneEffect';

describe('createHalftoneEffect', () => {
  it('tags the intent type', () => {
    expect(createHalftoneEffect().kind).toBe('HalftoneEffect');
  });

  it('carries options', () => {
    expect(createHalftoneEffect({ scale: 6, angle: 0.5 })).toMatchObject({ scale: 6, angle: 0.5 });
  });
});
