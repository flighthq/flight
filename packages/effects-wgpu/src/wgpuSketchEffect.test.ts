import { applySketchEffectToWgpu, defaultWgpuSketchEffectRunner, registerWgpuSketchEffect } from './wgpuSketchEffect';

describe('applySketchEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySketchEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuSketchEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSketchEffectRunner).toBe('function');
  });
});

describe('registerWgpuSketchEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuSketchEffect).toBeTypeOf('function');
  });
});
