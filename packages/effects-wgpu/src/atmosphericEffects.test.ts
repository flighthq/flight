import {
  applyGodRaysEffectToWgpu,
  applyScreenSpaceFogEffectToWgpu,
  applySsaoEffectToWgpu,
  applySsrEffectToWgpu,
  defaultWgpuGodRaysEffectRunner,
  defaultWgpuScreenSpaceFogEffectRunner,
  defaultWgpuSsaoEffectRunner,
  defaultWgpuSsrEffectRunner,
} from './atmosphericEffects';

describe('applyGodRaysEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyGodRaysEffectToWgpu).toBe('function');
  });
});

describe('applyScreenSpaceFogEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToWgpu).toBe('function');
  });
});

describe('applySsaoEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySsaoEffectToWgpu).toBe('function');
  });
});

describe('applySsrEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySsrEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuGodRaysEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuGodRaysEffectRunner).toBe('function');
  });
});

describe('defaultWgpuScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuScreenSpaceFogEffectRunner).toBe('function');
  });
});

describe('defaultWgpuSsaoEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSsaoEffectRunner).toBe('function');
  });
});

describe('defaultWgpuSsrEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSsrEffectRunner).toBe('function');
  });
});
