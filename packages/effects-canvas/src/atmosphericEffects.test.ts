import {
  applyGodRaysEffectToCanvas,
  applyScreenSpaceFogEffectToCanvas,
  applySSAOEffectToCanvas,
  applySSREffectToCanvas,
  defaultCanvasGodRaysEffectRunner,
  defaultCanvasScreenSpaceFogEffectRunner,
  defaultCanvasSSAOEffectRunner,
  defaultCanvasSSREffectRunner,
} from './atmosphericEffects';

describe('applyGodRaysEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyGodRaysEffectToCanvas).toBe('function');
  });
});

describe('applyScreenSpaceFogEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToCanvas).toBe('function');
  });
});

describe('applySSAOEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySSAOEffectToCanvas).toBe('function');
  });
});

describe('applySSREffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySSREffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasGodRaysEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasGodRaysEffectRunner).toBe('function');
  });
});

describe('defaultCanvasScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasScreenSpaceFogEffectRunner).toBe('function');
  });
});

describe('defaultCanvasSSAOEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSSAOEffectRunner).toBe('function');
  });
});

describe('defaultCanvasSSREffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSSREffectRunner).toBe('function');
  });
});
