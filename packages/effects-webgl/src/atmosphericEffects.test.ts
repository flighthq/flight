import {
  applyGodRaysEffectToWebGL,
  applyScreenSpaceFogEffectToWebGL,
  applySSAOEffectToWebGL,
  applySSREffectToWebGL,
  defaultWebGLGodRaysEffectRunner,
  defaultWebGLScreenSpaceFogEffectRunner,
  defaultWebGLSSAOEffectRunner,
  defaultWebGLSSREffectRunner,
} from './atmosphericEffects';

describe('applyGodRaysEffectToWebGL', () => {
  it('is a function', () => {
    expect(typeof applyGodRaysEffectToWebGL).toBe('function');
  });
});

describe('applyScreenSpaceFogEffectToWebGL', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToWebGL).toBe('function');
  });
});

describe('applySSAOEffectToWebGL', () => {
  it('is a function', () => {
    expect(typeof applySSAOEffectToWebGL).toBe('function');
  });
});

describe('applySSREffectToWebGL', () => {
  it('is a function', () => {
    expect(typeof applySSREffectToWebGL).toBe('function');
  });
});

describe('defaultWebGLGodRaysEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGLGodRaysEffectRunner).toBe('function');
  });
});

describe('defaultWebGLScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGLScreenSpaceFogEffectRunner).toBe('function');
  });
});

describe('defaultWebGLSSAOEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGLSSAOEffectRunner).toBe('function');
  });
});

describe('defaultWebGLSSREffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGLSSREffectRunner).toBe('function');
  });
});
