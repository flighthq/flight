import {
  applyFXAAEffectToWebGPU,
  applySMAAEffectToWebGPU,
  applyTAAEffectToWebGPU,
  defaultWebGPUFXAAEffectRunner,
  defaultWebGPUSMAAEffectRunner,
  defaultWebGPUTAAEffectRunner,
} from './antialiasingEffects';

describe('applyFXAAEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applyFXAAEffectToWebGPU).toBe('function');
  });
});

describe('applySMAAEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applySMAAEffectToWebGPU).toBe('function');
  });
});

describe('applyTAAEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applyTAAEffectToWebGPU).toBe('function');
  });
});

describe('defaultWebGPUFXAAEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUFXAAEffectRunner).toBe('function');
  });
});

describe('defaultWebGPUSMAAEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUSMAAEffectRunner).toBe('function');
  });
});

describe('defaultWebGPUTAAEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUTAAEffectRunner).toBe('function');
  });
});
