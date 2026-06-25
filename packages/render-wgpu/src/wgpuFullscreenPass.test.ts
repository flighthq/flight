import { renderWgpuBackground, submitWgpuRenderPass } from './wgpuBackground';
import {
  createWgpuFullscreenPipeline,
  destroyWgpuFullscreenPipeline,
  drawWgpuFullscreenPass,
} from './wgpuFullscreenPass';
import { createWgpuRenderTarget } from './wgpuRenderTarget';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

const SIMPLE_FRAGMENT_WGSL = /* wgsl */ `
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;
@fragment
fn fs_main(@builtin(position) pos : vec4f) -> @location(0) vec4f {
  return textureSample(tex, smp, pos.xy);
}
`;

describe('createWgpuFullscreenPipeline', () => {
  it('returns a pipeline with a layout and bind group layouts', async () => {
    const state = await createWgpuRenderStateForTest();
    const result = createWgpuFullscreenPipeline(state, SIMPLE_FRAGMENT_WGSL, 1);
    expect(result.pipeline).toBeDefined();
    expect(result.pipelineLayout).toBeDefined();
    expect(result.uniformBindGroupLayout).toBeDefined();
    expect(result.textureBindGroupLayouts.length).toBe(1);
  });

  it('builds multiple texture bind group layouts when textureInputCount > 1', async () => {
    const state = await createWgpuRenderStateForTest();
    const result = createWgpuFullscreenPipeline(state, SIMPLE_FRAGMENT_WGSL, 3);
    expect(result.textureBindGroupLayouts.length).toBe(3);
  });
});

describe('destroyWgpuFullscreenPipeline', () => {
  it('does not throw', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuFullscreenPipeline(state, SIMPLE_FRAGMENT_WGSL, 1);
    expect(() => destroyWgpuFullscreenPipeline(state, pipeline)).not.toThrow();
  });
});

describe('drawWgpuFullscreenPass', () => {
  it('does not throw when render pass is open and no uniforms', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const pipeline = createWgpuFullscreenPipeline(state, SIMPLE_FRAGMENT_WGSL, 1);
    const target = createWgpuRenderTarget(state, 64, 64);
    expect(() => drawWgpuFullscreenPass(state, pipeline, [target], null, null)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('is a no-op when render pass is not open', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuFullscreenPipeline(state, SIMPLE_FRAGMENT_WGSL, 1);
    const target = createWgpuRenderTarget(state, 64, 64);
    expect(() => drawWgpuFullscreenPass(state, pipeline, [target], null, null)).not.toThrow();
  });
});
