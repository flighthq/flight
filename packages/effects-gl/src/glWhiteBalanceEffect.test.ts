import { applyWhiteBalanceEffectToGl, defaultGlWhiteBalanceEffectRunner } from './glWhiteBalanceEffect';

describe('applyWhiteBalanceEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyWhiteBalanceEffectToGl).toBe('function');
  });
});

describe('defaultGlWhiteBalanceEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlWhiteBalanceEffectRunner).toBe('function');
  });
});
