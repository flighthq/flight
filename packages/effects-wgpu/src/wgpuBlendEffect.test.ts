import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';
import { AdvancedBlendMode } from '@flighthq/types/contract';

import {
  applyBlendEffectToWgpu,
  defaultWgpuBlendEffectRunner,
  getWgpuBlendEffectBackdrop,
  getWgpuBlendEffectModeIndex,
  registerWgpuBlendEffectBackdrop,
  unregisterWgpuBlendEffectBackdrop,
  WGPU_BLEND_FRAGMENT_WGSL,
} from './wgpuBlendEffect';

function makeState(): WgpuRenderState {
  return {} as WgpuRenderState;
}

function makeTarget(): WgpuRenderTarget {
  return {} as WgpuRenderTarget;
}

describe('applyBlendEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyBlendEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuBlendEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuBlendEffectRunner).toBe('function');
  });
});

describe('getWgpuBlendEffectBackdrop', () => {
  it('returns null for null and missing keys', () => {
    const state = makeState();
    expect(getWgpuBlendEffectBackdrop(state, null)).toBeNull();
    expect(getWgpuBlendEffectBackdrop(state, 'missing')).toBeNull();
  });

  it('isolates registered targets per state', () => {
    const first = makeState();
    const second = makeState();
    const target = makeTarget();
    registerWgpuBlendEffectBackdrop(first, 'scene', target);
    expect(getWgpuBlendEffectBackdrop(first, 'scene')).toBe(target);
    expect(getWgpuBlendEffectBackdrop(second, 'scene')).toBeNull();
  });
});

describe('getWgpuBlendEffectModeIndex', () => {
  it('assigns the seven separable modes indices 0 through 6', () => {
    expect(getWgpuBlendEffectModeIndex(AdvancedBlendMode.Overlay)).toBe(0);
    expect(getWgpuBlendEffectModeIndex(AdvancedBlendMode.HardLight)).toBe(1);
    expect(getWgpuBlendEffectModeIndex(AdvancedBlendMode.SoftLight)).toBe(2);
    expect(getWgpuBlendEffectModeIndex(AdvancedBlendMode.Difference)).toBe(3);
    expect(getWgpuBlendEffectModeIndex(AdvancedBlendMode.Exclusion)).toBe(4);
    expect(getWgpuBlendEffectModeIndex(AdvancedBlendMode.ColorDodge)).toBe(5);
    expect(getWgpuBlendEffectModeIndex(AdvancedBlendMode.ColorBurn)).toBe(6);
  });

  it('assigns the HSL modes indices 7 through 10', () => {
    expect(getWgpuBlendEffectModeIndex(AdvancedBlendMode.Hue)).toBe(7);
    expect(getWgpuBlendEffectModeIndex(AdvancedBlendMode.Saturation)).toBe(8);
    expect(getWgpuBlendEffectModeIndex(AdvancedBlendMode.Color)).toBe(9);
    expect(getWgpuBlendEffectModeIndex(AdvancedBlendMode.Luminosity)).toBe(10);
  });

  it('maps every canonical mode uniquely and unknown values to passthrough', () => {
    const indices = Object.values(AdvancedBlendMode).map(getWgpuBlendEffectModeIndex);
    expect(new Set(indices).size).toBe(indices.length);
    expect(indices).not.toContain(-1);
    expect(getWgpuBlendEffectModeIndex('acme.Unknown')).toBe(-1);
  });
});

describe('registerWgpuBlendEffectBackdrop', () => {
  it('is last-write-wins', () => {
    const state = makeState();
    const first = makeTarget();
    const second = makeTarget();
    registerWgpuBlendEffectBackdrop(state, 'scene', first);
    registerWgpuBlendEffectBackdrop(state, 'scene', second);
    expect(getWgpuBlendEffectBackdrop(state, 'scene')).toBe(second);
  });
});

describe('unregisterWgpuBlendEffectBackdrop', () => {
  it('removes present targets and reports absent keys', () => {
    const state = makeState();
    registerWgpuBlendEffectBackdrop(state, 'scene', makeTarget());
    expect(unregisterWgpuBlendEffectBackdrop(state, 'scene')).toBe(true);
    expect(unregisterWgpuBlendEffectBackdrop(state, 'scene')).toBe(false);
    expect(getWgpuBlendEffectBackdrop(state, 'scene')).toBeNull();
  });
});

describe('WGPU_BLEND_FRAGMENT_WGSL', () => {
  it('binds both layer and backdrop textures and emits the separable and HSL blend helpers', () => {
    expect(WGPU_BLEND_FRAGMENT_WGSL).toContain('@group(1) @binding(0) var layerTexture');
    expect(WGPU_BLEND_FRAGMENT_WGSL).toContain('@group(2) @binding(0) var backdropTexture');
    expect(WGPU_BLEND_FRAGMENT_WGSL).toContain('fn sepChannel');
    expect(WGPU_BLEND_FRAGMENT_WGSL).toContain('fn setLum');
    expect(WGPU_BLEND_FRAGMENT_WGSL).toContain('fn setSat');
    expect(WGPU_BLEND_FRAGMENT_WGSL).toContain('if (mode == 10)');
  });

  it('un-premultiplies inputs and writes premultiplied source-over output', () => {
    expect(WGPU_BLEND_FRAGMENT_WGSL).toContain('layer.rgb / layer.a');
    expect(WGPU_BLEND_FRAGMENT_WGSL).toContain('back.rgb / back.a');
    expect(WGPU_BLEND_FRAGMENT_WGSL).toContain('sourceAlpha + backdropAlpha * (1.0 - sourceAlpha)');
    expect(WGPU_BLEND_FRAGMENT_WGSL).toContain('mixed * sourceAlpha + cb * backdropAlpha * (1.0 - sourceAlpha)');
  });
});
