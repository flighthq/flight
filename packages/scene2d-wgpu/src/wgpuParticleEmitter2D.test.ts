import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { createParticleEmitter2D } from '@flighthq/particleemitter/contract';
import {
  beginWgpuScreenRenderPassForTest,
  getWgpuRenderStateRuntime,
  registerWgpuCompressedImageTextureResolver,
  registerWgpuImageTextureResolver,
  submitWgpuFrame,
} from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { CompressedImageResource, RenderProxy2D } from '@flighthq/types/contract';
import {
  CompressedImageTextureSourceKind,
  EntityRuntimeKey,
  RegistryEntryState,
  TextureAtlasRotation,
} from '@flighthq/types/contract';

import { defaultWgpuParticleEmitter2DRenderer, drawWgpuParticleEmitter2D } from './wgpuParticleEmitter2D';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

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
    beginWgpuScreenRenderPassForTest(state);

    const emitter = createParticleEmitter2D();
    prepareScene2DRender(state, emitter);
    const renderProxy = getRenderProxy2D(state, emitter)!;

    expect(() => drawWgpuParticleEmitter2D(state, renderProxy)).not.toThrow();
    submitWgpuFrame(state);
  });

  it('threads a native compressed atlas straight-alpha flag through the particle uniform', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuCompressedImageTextureResolver(state);
    beginWgpuScreenRenderPassForTest(state);
    const before = runtime.uniformOffset;
    const image = {
      compressed: { container: {}, payload: new Uint8Array() },
      height: 4,
      kind: CompressedImageTextureSourceKind,
      version: 1,
      width: 4,
    } as unknown as CompressedImageResource;
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
            [EntityRuntimeKey]: undefined,
            bindings: new Map(),
            mipLevelCount: 1,
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

  it('packs a rotated region at its upright logical size without growing the instance record', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuImageTextureResolver(state);
    beginWgpuScreenRenderPassForTest(state);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const region: {
      height: number;
      id: number;
      rotation: TextureAtlasRotation;
      width: number;
      x: number;
      y: number;
    } = { height: 40, id: 0, rotation: TextureAtlasRotation.Clockwise90, width: 20, x: 0, y: 0 };
    const renderProxy = {
      alpha: 1,
      blendMode: null,
      source: {
        data: {
          alphas: new Float32Array([1]),
          atlas: {
            regions: [region],
            texture: createTexture({ dimension: '2d', source: createImageResource(canvas) }),
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

    expect(runtime.particleInstanceData![12]).toBe(-40);
    expect(runtime.particleInstanceData![13]).toBe(20);

    region.rotation = TextureAtlasRotation.Counterclockwise90;
    drawWgpuParticleEmitter2D(state, renderProxy);
    expect(runtime.particleInstanceData![12]).toBe(40);
    expect(runtime.particleInstanceData![13]).toBe(-20);
  });
});
