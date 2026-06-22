import { applySketchEffectToWgpu, defaultWgpuSketchEffectRunner } from './wgpuSketchEffect';

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
