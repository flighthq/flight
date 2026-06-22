import { applyGodRaysEffectToGl, defaultGlGodRaysEffectRunner } from './glGodRaysEffect';

describe('applyGodRaysEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGodRaysEffectToGl).toBe('function');
  });
});

describe('defaultGlGodRaysEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlGodRaysEffectRunner).toBe('function');
  });
});
