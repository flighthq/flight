import type { WgpuRenderState } from '@flighthq/types';

import { generateWgpuMipmaps, getWgpuMipLevelCount } from './wgpuMipmap';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

function makeTextureSpy(): GPUTexture {
  return { createView: vi.fn(() => ({}) as GPUTextureView), destroy: () => {} } as unknown as GPUTexture;
}

// Replaces the mock device's command encoder with one whose render passes are spies, so a test can
// count how many downsample passes generateWgpuMipmaps opens. Returns the beginRenderPass spy.
function spyEncoderPasses(state: WgpuRenderState): ReturnType<typeof vi.fn> {
  const beginRenderPass = vi.fn(
    () =>
      ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        draw: vi.fn(),
        end: vi.fn(),
      }) as unknown as GPURenderPassEncoder,
  );
  const encoder = { beginRenderPass, finish: () => ({}) as GPUCommandBuffer } as unknown as GPUCommandEncoder;
  vi.spyOn(state.device, 'createCommandEncoder').mockReturnValue(encoder);
  return beginRenderPass;
}

describe('generateWgpuMipmaps', () => {
  it('renders one downsample pass per generated mip level for a multi-level texture', async () => {
    const state = await createWgpuRenderStateForTest();
    const beginRenderPass = spyEncoderPasses(state);
    const submit = vi.spyOn(state.device.queue, 'submit');
    generateWgpuMipmaps(state, makeTextureSpy(), 4, 4, 'rgba8unorm');
    // 4x4 → 3 levels → 2 downsample passes into levels 1 and 2.
    expect(beginRenderPass).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for a single-level (1x1) texture', async () => {
    const state = await createWgpuRenderStateForTest();
    const beginRenderPass = spyEncoderPasses(state);
    const submit = vi.spyOn(state.device.queue, 'submit');
    generateWgpuMipmaps(state, makeTextureSpy(), 1, 1, 'rgba8unorm');
    expect(beginRenderPass).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('builds the downsample pipeline once and reuses it across textures', async () => {
    const state = await createWgpuRenderStateForTest();
    spyEncoderPasses(state);
    generateWgpuMipmaps(state, makeTextureSpy(), 4, 4, 'rgba8unorm');
    const pipeline = getWgpuRenderStateRuntime(state).mipmapPipeline;
    expect(pipeline).toBeDefined();
    generateWgpuMipmaps(state, makeTextureSpy(), 8, 8, 'rgba8unorm');
    expect(getWgpuRenderStateRuntime(state).mipmapPipeline).toBe(pipeline);
  });
});

describe('getWgpuMipLevelCount', () => {
  it('returns 1 for a 1x1 base', () => {
    expect(getWgpuMipLevelCount(1, 1)).toBe(1);
  });

  it('counts the full chain down to 1x1 using the larger dimension', () => {
    expect(getWgpuMipLevelCount(8, 8)).toBe(4);
    expect(getWgpuMipLevelCount(256, 1)).toBe(9);
    expect(getWgpuMipLevelCount(5, 3)).toBe(3);
  });
});
