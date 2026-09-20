import {
  applyWhiteBalanceEffectToGl,
  glWhiteBalanceEffectRunner,
  registerGlWhiteBalanceEffect,
} from './glWhiteBalanceEffect';

describe('applyWhiteBalanceEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyWhiteBalanceEffectToGl).toBe('function');
  });
});

describe('glWhiteBalanceEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glWhiteBalanceEffectRunner).toBe('function');
  });
});

describe('registerGlWhiteBalanceEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlWhiteBalanceEffect).toBeTypeOf('function');
  });
});
