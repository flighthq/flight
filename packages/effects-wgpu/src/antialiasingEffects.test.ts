import {
  applyFxaaEffectToWgpu,
  applySmaaEffectToWgpu,
  applyTaaEffectToWgpu,
  defaultWgpuFxaaEffectRunner,
  defaultWgpuSmaaEffectRunner,
  defaultWgpuTaaEffectRunner,
} from './antialiasingEffects';

describe('applyFxaaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyFxaaEffectToWgpu).toBe('function');
  });
});

describe('applySmaaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySmaaEffectToWgpu).toBe('function');
  });
});

describe('applyTaaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyTaaEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuFxaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuFxaaEffectRunner).toBe('function');
  });
});

describe('defaultWgpuSmaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSmaaEffectRunner).toBe('function');
  });
});

describe('defaultWgpuTaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuTaaEffectRunner).toBe('function');
  });
});
