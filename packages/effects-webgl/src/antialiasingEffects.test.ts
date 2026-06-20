import {
  applyFXAAEffectToWebGL,
  applySMAAEffectToWebGL,
  applyTAAEffectToWebGL,
  defaultWebGLFXAAEffectRunner,
  defaultWebGLSMAAEffectRunner,
  defaultWebGLTAAEffectRunner,
} from './antialiasingEffects';

describe('applyFXAAEffectToWebGL', () => {
  it('is a function', () => {
    expect(typeof applyFXAAEffectToWebGL).toBe('function');
  });
});

describe('applySMAAEffectToWebGL', () => {
  it('is a function', () => {
    expect(typeof applySMAAEffectToWebGL).toBe('function');
  });
});

describe('applyTAAEffectToWebGL', () => {
  it('is a function', () => {
    expect(typeof applyTAAEffectToWebGL).toBe('function');
  });
});

describe('defaultWebGLFXAAEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGLFXAAEffectRunner).toBe('function');
  });
});

describe('defaultWebGLSMAAEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGLSMAAEffectRunner).toBe('function');
  });
});

describe('defaultWebGLTAAEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGLTAAEffectRunner).toBe('function');
  });
});
