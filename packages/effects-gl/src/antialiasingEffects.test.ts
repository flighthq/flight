import {
  applyFxaaEffectToGl,
  applySmaaEffectToGl,
  applyTaaEffectToGl,
  defaultGlFxaaEffectRunner,
  defaultGlSmaaEffectRunner,
  defaultGlTaaEffectRunner,
} from './antialiasingEffects';

describe('applyFxaaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyFxaaEffectToGl).toBe('function');
  });
});

describe('applySmaaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySmaaEffectToGl).toBe('function');
  });
});

describe('applyTaaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyTaaEffectToGl).toBe('function');
  });
});

describe('defaultGlFxaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlFxaaEffectRunner).toBe('function');
  });
});

describe('defaultGlSmaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSmaaEffectRunner).toBe('function');
  });
});

describe('defaultGlTaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlTaaEffectRunner).toBe('function');
  });
});
