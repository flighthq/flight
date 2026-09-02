import * as renderWgpuContract from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { BitmapDisplacementEffect, Texture2D, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';
import { ImageChannel } from '@flighthq/types/contract';

import {
  applyBitmapDisplacementEffectToWgpu,
  BITMAP_DISPLACEMENT_FRAGMENT_WGSL,
  defaultWgpuBitmapDisplacementEffectRunner,
  isWgpuBitmapDisplacementEffectResolvable,
  registerWgpuBitmapDisplacementEffect,
} from './wgpuBitmapDisplacementEffect';
import * as wgpuEffectPass from './wgpuEffectPass';
import * as wgpuEffectProgramCache from './wgpuEffectProgramCache';
import { getWgpuRenderEffectRunner, isWgpuRenderEffectResolvable } from './wgpuRenderEffectRegistry';

const sourceView = {} as GPUTextureView;
const mapView = {} as GPUTextureView;
const source = {
  colorSpace: 'srgb',
  format: 'rgba8unorm',
  height: 64,
  view: sourceView,
  width: 128,
} as WgpuRenderTarget;
const dest = { ...source, view: {} as GPUTextureView } as WgpuRenderTarget;
const map = {
  colorSpace: 'linear',
  dimension: '2d',
  sampler: {
    anisotropy: 1,
    magFilter: 'linear',
    minFilter: 'linear',
    mipmaps: false,
    wrapU: 'clamp-to-edge',
    wrapV: 'clamp-to-edge',
  },
  source: {},
} as unknown as Texture2D;
const mapSampler = {} as GPUSampler;
const sourceBindGroup = { id: 'source' } as unknown as GPUBindGroup;
const mapBindGroup = { id: 'map' } as unknown as GPUBindGroup;
const pass = {
  draw: vi.fn(),
  end: vi.fn(),
  setBindGroup: vi.fn(),
  setPipeline: vi.fn(),
};
const fs = {
  acquireSlot: vi.fn(() => 256),
  beginPass: vi.fn(() => pass),
  sampler: {} as GPUSampler,
  textureBGLayout: {} as GPUBindGroupLayout,
  uniformBG: {} as GPUBindGroup,
  uniformBGLayout: {} as GPUBindGroupLayout,
  writeSlot: vi.fn((_offset: number, callback: (f32: Float32Array, i32: Int32Array) => void) => {
    const f32 = new Float32Array(16);
    callback(f32, new Int32Array(f32.buffer));
    writtenUniforms = f32;
  }),
};
const device = {
  createBindGroup: vi.fn(({ entries }: GPUBindGroupDescriptor) =>
    Array.from(entries)[0]?.resource === sourceView ? sourceBindGroup : mapBindGroup,
  ),
  createPipelineLayout: vi.fn(() => ({})),
  createRenderPipeline: vi.fn(() => ({ id: 'pipeline' })),
  createShaderModule: vi.fn(() => ({})),
};
const state = { device, format: 'rgba8unorm' } as unknown as WgpuRenderState;
let writtenUniforms = new Float32Array();

beforeAll(() => installWgpuMock());

beforeEach(() => {
  writtenUniforms = new Float32Array();
  vi.clearAllMocks();
  vi.spyOn(renderWgpuContract, 'resolveWgpuTexture').mockReturnValue({ view: mapView } as never);
  vi.spyOn(renderWgpuContract, 'getWgpuSampler').mockReturnValue(mapSampler);
  vi.spyOn(wgpuEffectPass, 'getWgpuEffectPassState').mockReturnValue(fs as never);
  vi.spyOn(wgpuEffectPass, 'drawWgpuEffectPass').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectProgramCache, 'getWgpuEffectPipeline').mockReturnValue({ pipeline: {} } as never);
});

afterEach(() => vi.restoreAllMocks());

function effect(overrides: Readonly<Partial<BitmapDisplacementEffect>> = {}): BitmapDisplacementEffect {
  return { kind: 'BitmapDisplacementEffect', map, ...overrides } as BitmapDisplacementEffect;
}

describe('applyBitmapDisplacementEffectToWgpu', () => {
  it('binds source and resolved map views in one pass', () => {
    applyBitmapDisplacementEffectToWgpu(state, source, dest, effect());

    expect(renderWgpuContract.resolveWgpuTexture).toHaveBeenCalledWith(state, map, false, source.colorSpace);
    expect(pass.setBindGroup).toHaveBeenNthCalledWith(2, 1, sourceBindGroup);
    expect(pass.setBindGroup).toHaveBeenNthCalledWith(3, 2, mapBindGroup);
    expect(pass.draw).toHaveBeenCalledWith(6);
    expect(pass.end).toHaveBeenCalledOnce();
  });

  it('maps channels, signed scales, dimensions, and edge modes into uniforms', () => {
    applyBitmapDisplacementEffectToWgpu(
      state,
      source,
      dest,
      effect({
        componentX: ImageChannel.Alpha,
        componentY: ImageChannel.Blue,
        edgeMode: 'clamp',
        scaleX: -14,
        scaleY: 9,
      }),
    );
    const i32 = new Int32Array(writtenUniforms.buffer);

    expect([...writtenUniforms.slice(0, 4)]).toEqual([-14, 9, source.width, source.height]);
    expect([...i32.slice(4, 7)]).toEqual([ImageChannel.Alpha, ImageChannel.Blue, 0]);

    applyBitmapDisplacementEffectToWgpu(state, source, dest, effect({ edgeMode: 'wrap' }));
    expect(new Int32Array(writtenUniforms.buffer)[6]).toBe(1);
  });

  it('ships channel mapping, centred offset, wrap, clamp, and top-left vertical displacement', () => {
    applyBitmapDisplacementEffectToWgpu(state, source, dest, effect());

    expect(BITMAP_DISPLACEMENT_FRAGMENT_WGSL).toContain('sampleChannel(mapSample, uni.componentX)');
    expect(BITMAP_DISPLACEMENT_FRAGMENT_WGSL).toContain('sampleChannel(mapSample, uni.componentY)');
    expect(BITMAP_DISPLACEMENT_FRAGMENT_WGSL).toContain('(mapped - vec2f(0.5)) * uni.scale');
    expect(BITMAP_DISPLACEMENT_FRAGMENT_WGSL).toContain('fract(displaced)');
    expect(BITMAP_DISPLACEMENT_FRAGMENT_WGSL).toContain('clamp(displaced, vec2f(0.0), vec2f(1.0))');
    expect(BITMAP_DISPLACEMENT_FRAGMENT_WGSL).toContain('uv.y + displacement.y');
  });

  it('copies through when the map is absent or unresolved', () => {
    vi.mocked(renderWgpuContract.resolveWgpuTexture).mockReturnValue(null);
    applyBitmapDisplacementEffectToWgpu(state, source, dest, effect());
    applyBitmapDisplacementEffectToWgpu(state, source, dest, effect({ map: null }));

    expect(wgpuEffectPass.drawWgpuEffectPass).toHaveBeenCalledTimes(2);
  });
});

describe('defaultWgpuBitmapDisplacementEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    defaultWgpuBitmapDisplacementEffectRunner(
      { dest, pool: { free: [] }, source, state } as never,
      effect({ scaleX: 3, scaleY: 4 }),
    );
    expect([...writtenUniforms.slice(0, 2)]).toEqual([3, 4]);
  });
});

describe('isWgpuBitmapDisplacementEffectResolvable', () => {
  it('exposes the missing-map sentinel', () => {
    expect(isWgpuBitmapDisplacementEffectResolvable(state, effect())).toBe(true);
    expect(isWgpuBitmapDisplacementEffectResolvable(state, effect({ map: null }))).toBe(false);
    vi.mocked(renderWgpuContract.resolveWgpuTexture).mockReturnValue(null);
    expect(isWgpuBitmapDisplacementEffectResolvable(state, effect())).toBe(false);
  });
});

describe('registerWgpuBitmapDisplacementEffect', () => {
  it('registers both the runner and per-instance map resolver', async () => {
    const registeredState = await createWgpuRenderStateForTest();

    registerWgpuBitmapDisplacementEffect(registeredState);
    expect(getWgpuRenderEffectRunner(registeredState, 'BitmapDisplacementEffect')).toBe(
      defaultWgpuBitmapDisplacementEffectRunner,
    );
    expect(isWgpuRenderEffectResolvable(registeredState, effect({ map: null }))).toBe(false);
  });
});
