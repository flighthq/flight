import { createWhiteBalanceEffect } from './whiteBalanceEffect';

describe('createWhiteBalanceEffect', () => {
  it('tags the intent type', () => {
    expect(createWhiteBalanceEffect().kind).toBe('WhiteBalanceEffect');
  });

  it('carries options', () => {
    expect(createWhiteBalanceEffect({ temperature: 0.3, tint: -0.2 })).toMatchObject({ temperature: 0.3, tint: -0.2 });
  });
});
