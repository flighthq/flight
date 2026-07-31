import {
  applyWhiteBalanceEffectToGl,
  defaultGlWhiteBalanceEffectRunner,
  registerGlWhiteBalanceEffect,
} from './glWhiteBalanceEffect';

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

describe('registerGlWhiteBalanceEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlWhiteBalanceEffect).toBeTypeOf('function');
  });
});
