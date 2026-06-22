import { createDitherEffect } from './ditherEffect';

describe('createDitherEffect', () => {
  it('tags the intent type', () => {
    expect(createDitherEffect().kind).toBe('DitherEffect');
  });

  it('carries options', () => {
    expect(createDitherEffect({ levels: 4 })).toMatchObject({ levels: 4 });
  });
});
