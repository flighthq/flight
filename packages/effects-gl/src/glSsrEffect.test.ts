import { applySsrEffectToGl, defaultGlSsrEffectRunner } from './glSsrEffect';

describe('applySsrEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySsrEffectToGl).toBe('function');
  });
});

describe('defaultGlSsrEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSsrEffectRunner).toBe('function');
  });
});
