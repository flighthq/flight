import { applySsaoEffectToGl, defaultGlSsaoEffectRunner } from './glSsaoEffect';

describe('applySsaoEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySsaoEffectToGl).toBe('function');
  });
});

describe('defaultGlSsaoEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSsaoEffectRunner).toBe('function');
  });
});
