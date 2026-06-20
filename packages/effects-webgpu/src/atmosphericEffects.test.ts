import {
  applyGodRaysEffectToWebGPU,
  applyScreenSpaceFogEffectToWebGPU,
  applySSAOEffectToWebGPU,
  applySSREffectToWebGPU,
  defaultWebGPUGodRaysEffectRunner,
  defaultWebGPUScreenSpaceFogEffectRunner,
  defaultWebGPUSSAOEffectRunner,
  defaultWebGPUSSREffectRunner,
} from './atmosphericEffects';

describe('applyGodRaysEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applyGodRaysEffectToWebGPU).toBe('function');
  });
});

describe('applyScreenSpaceFogEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToWebGPU).toBe('function');
  });
});

describe('applySSAOEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applySSAOEffectToWebGPU).toBe('function');
  });
});

describe('applySSREffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applySSREffectToWebGPU).toBe('function');
  });
});

describe('defaultWebGPUGodRaysEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUGodRaysEffectRunner).toBe('function');
  });
});

describe('defaultWebGPUScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUScreenSpaceFogEffectRunner).toBe('function');
  });
});

describe('defaultWebGPUSSAOEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUSSAOEffectRunner).toBe('function');
  });
});

describe('defaultWebGPUSSREffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUSSREffectRunner).toBe('function');
  });
});
