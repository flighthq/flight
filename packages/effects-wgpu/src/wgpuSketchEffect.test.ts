import { applySketchEffectToWgpu, wgpuSketchEffectRunner, registerWgpuSketchEffect } from './wgpuSketchEffect';

describe('applySketchEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySketchEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuSketchEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuSketchEffect).toBeTypeOf('function');
  });
});

describe('wgpuSketchEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuSketchEffectRunner).toBe('function');
  });
});
