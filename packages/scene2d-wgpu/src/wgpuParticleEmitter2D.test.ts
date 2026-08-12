import { createParticleEmitter2D } from '@flighthq/particleemitter/contract';
import {
  getWgpuRenderStateRuntime,
  registerWgpuCompressedImageTextureResolver,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { CompressedImage, RenderProxy2D } from '@flighthq/types/contract';
import { CompressedImageTextureSourceKind, RegistryEntryState } from '@flighthq/types/contract';

import { defaultWgpuParticleEmitter2DRenderer, drawWgpuParticleEmitter2D } from './wgpuParticleEmitter2D';

beforeAll(() => {
  installWgpuMock();
});

describe('defaultWgpuParticleEmitter2DRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWgpuParticleEmitter2DRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWgpuParticleEmitter2DRenderer.submit).toBe('function');
  });
});

describe('drawWgpuParticleEmitter2D', () => {
  it('does not throw when atlas is null', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const emitter = createParticleEmitter2D();
    prepareScene2DRender(state, emitter);
    const renderProxy = getRenderProxy2D(state, emitter)!;

    expect(() => drawWgpuParticleEmitter2D(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('threads a native compressed atlas straight-alpha flag through the particle uniform', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuCompressedImageTextureResolver(state);
    renderWgpuBackground(state);
    const before = runtime.uniformOffset;
    const image = {
      compressed: { container: {}, payload: new Uint8Array() },
      height: 4,
      kind: CompressedImageTextureSourceKind,
      version: 1,
      width: 4,
    } as unknown as CompressedImage;
    runtime.registries.compressedTextureUpload = {
      ...runtime.registries.compressedTextureUpload,
      entry: {
        state: RegistryEntryState.Bound,
        value: () => {
          const texture = state.device.createTexture({
            size: [4, 4],
            format: 'bc3-rgba-unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING,
          });
          const view = texture.createView();
          return {
            bindGroup: state.device.createBindGroup({ layout: runtime.textureBindGroupLayout, entries: [] }),
            straightAlpha: true,
            texture,
            view,
          };
        },
      },
    };
    const renderProxy = {
      alpha: 1,
      blendMode: null,
      source: {
        data: {
          alphas: new Float32Array([1]),
          atlas: {
            regions: [{ height: 4, width: 4, x: 0, y: 0 }],
            texture: createTexture({ dimension: '2d', source: image }),
          },
          colors: new Float32Array([1, 1, 1]),
          ids: new Uint16Array([0]),
          particleCount: 1,
          transforms: new Float32Array([0, 0, 0, 1]),
          worldSpace: false,
        },
      },
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    } as unknown as RenderProxy2D;

    drawWgpuParticleEmitter2D(state, renderProxy);

    expect(runtime.uniformDataU32[(before >> 2) + 14]).toBe(1);
  });
});
