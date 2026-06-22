import { applyOutlineEffectToGl, defaultGlOutlineEffectRunner } from './glOutlineEffect';

describe('applyOutlineEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyOutlineEffectToGl).toBe('function');
  });
});

describe('defaultGlOutlineEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlOutlineEffectRunner).toBe('function');
  });
});
