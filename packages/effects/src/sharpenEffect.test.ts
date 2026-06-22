import { createSharpenEffect } from './sharpenEffect';

describe('createSharpenEffect', () => {
  it('tags the intent type', () => {
    expect(createSharpenEffect().kind).toBe('SharpenEffect');
  });

  it('carries options', () => {
    expect(createSharpenEffect({ amount: 0.6 })).toMatchObject({ amount: 0.6 });
  });
});
