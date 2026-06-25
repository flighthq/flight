import { applyBloomEffectToGl, defaultGlBloomEffectRunner } from './glBloomEffect';

describe('applyBloomEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBloomEffectToGl).toBe('function');
  });
});

describe('defaultGlBloomEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlBloomEffectRunner).toBe('function');
  });
});
