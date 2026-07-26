import { CompositeOperator } from '@flighthq/types/contract';

import {
  applyCompositeEffectToWgpu,
  defaultWgpuCompositeEffectRunner,
  getWgpuCompositeEffectOperatorIndex,
  WGPU_COMPOSITE_FRAGMENT_WGSL,
} from './wgpuCompositeEffect';

describe('applyCompositeEffectToWgpu', () => {
  it('is the public WebGPU composite entry point', () => {
    expect(typeof applyCompositeEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuCompositeEffectRunner', () => {
  it('is a render-effect runner', () => {
    expect(typeof defaultWgpuCompositeEffectRunner).toBe('function');
  });
});

describe('getWgpuCompositeEffectOperatorIndex', () => {
  it('assigns every canonical operator a unique branch and unknown values SourceOver', () => {
    const indices = Object.values(CompositeOperator).map(getWgpuCompositeEffectOperatorIndex);
    expect(new Set(indices).size).toBe(indices.length);
    expect(getWgpuCompositeEffectOperatorIndex(CompositeOperator.SourceOver)).toBe(0);
    expect(getWgpuCompositeEffectOperatorIndex(CompositeOperator.DestinationOut)).toBe(5);
    expect(getWgpuCompositeEffectOperatorIndex(CompositeOperator.Clear)).toBe(10);
    expect(getWgpuCompositeEffectOperatorIndex('acme.Custom')).toBe(0);
  });
});

describe('WGPU_COMPOSITE_FRAGMENT_WGSL', () => {
  it('binds both premultiplied inputs and implements all Porter-Duff branches', () => {
    expect(WGPU_COMPOSITE_FRAGMENT_WGSL).toContain('@group(1) @binding(0) var layerTexture');
    expect(WGPU_COMPOSITE_FRAGMENT_WGSL).toContain('@group(2) @binding(0) var backdropTexture');
    expect(WGPU_COMPOSITE_FRAGMENT_WGSL).toContain('uni.operatorIndex == 10');
    expect(WGPU_COMPOSITE_FRAGMENT_WGSL).toContain('sourceFactor * layer + backdropFactor * back');
  });
});
