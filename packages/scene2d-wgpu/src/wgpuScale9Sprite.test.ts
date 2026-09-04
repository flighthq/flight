import {
  createWgpuRenderStateForTest,
  getWgpuPipelineRegistries,
  getWgpuRenderStateRuntime,
  installWgpuMock,
  registerWgpuRenderTextureResolver,
  renderIntoWgpuRenderTexture,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu/contract';
import { createRenderTexture } from '@flighthq/texture/contract';
import type {
  ColorScaleBias,
  RenderProxy2D,
  Scale9Sprite,
  Texture2D,
  WgpuTextureEntry,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, RegistryEntryState, Scale9SpriteKind } from '@flighthq/types/contract';

import { scene2dWgpuPipeline } from './scene2dWgpuPipeline';
import { registerWgpuColorAdjustmentMaterialFeature } from './wgpuColorAdjustmentMaterialFeature';
import { prepareWgpuQuadBatchWrite, QUAD_BATCH_INSTANCE_FLOATS } from './wgpuQuadBatchWriter';
import { defaultWgpuScale9SpriteRenderer, drawWgpuScale9Sprite } from './wgpuScale9Sprite';
import { registerWgpuStandardMaterial, standardWgpuMaterialRenderer } from './wgpuStandardMaterial';

beforeAll(() => installWgpuMock());

describe('defaultWgpuScale9SpriteRenderer', () => {
  it('is registered separately under Scale9SpriteKind', () => {
    expect(typeof defaultWgpuScale9SpriteRenderer.createData).toBe('function');
    expect(typeof defaultWgpuScale9SpriteRenderer.isDirty).toBe('function');
    expect(defaultWgpuScale9SpriteRenderer.submit).toBe(drawWgpuScale9Sprite);
    expect(getWgpuPipelineRegistries(scene2dWgpuPipeline).renderers.entries.get(Scale9SpriteKind)).toEqual({
      state: RegistryEntryState.Bound,
      value: defaultWgpuScale9SpriteRenderer,
    });
  });
});

describe('drawWgpuScale9Sprite', () => {
  it('emits nine independently positioned quad instances', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuRenderTextureResolver(state);
    registerWgpuStandardMaterial(state);
    const texture = createResolvedRenderTexture(state);
    const renderProxy = createScale9RenderProxy(texture);

    drawWgpuScale9Sprite(state, renderProxy);

    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.quadBatchWriterCount).toBe(9);
    expect(readQuadGeometry(runtime.quadBatchWriterInstanceData)).toEqual([
      [5, 7, 10, 20],
      [15, 7, 120, 20],
      [135, 7, 50, 20],
      [5, 27, 10, 130],
      [15, 27, 120, 130],
      [135, 27, 50, 130],
      [5, 157, 10, 30],
      [15, 157, 120, 30],
      [135, 157, 50, 30],
    ]);
    const center = 4 * QUAD_BATCH_INSTANCE_FLOATS;
    expect(runtime.quadBatchWriterInstanceData[center + 8]).toBeCloseTo(10 / 90);
    expect(runtime.quadBatchWriterInstanceData[center + 9]).toBeCloseTo(20 / 60);
    expect(runtime.quadBatchWriterInstanceData[center + 10]).toBeCloseTo(40 / 90);
    expect(runtime.quadBatchWriterInstanceData[center + 11]).toBeCloseTo(30 / 60);
    submitWgpuRenderPass(state);
  });

  it('indexes parallel instance streams from the post-flush writer count', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuRenderTextureResolver(state);
    registerWgpuStandardMaterial(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    const runtime = getWgpuRenderStateRuntime(state);
    prepareWgpuQuadBatchWrite(state, createWgpuTextureEntry(), null, null, null, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    const tint = createTint();
    const renderProxy = createScale9RenderProxy(createResolvedRenderTexture(state));
    renderProxy.colorScaleBias = tint;

    drawWgpuScale9Sprite(state, renderProxy);

    expect(runtime.quadBatchWriterCount).toBe(9);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(1);
    expect(runtime.quadBatchWriterUniformColorScaleBias).toBe(tint);
    submitWgpuRenderPass(state);
  });
});

function createResolvedRenderTexture(state: Parameters<typeof renderIntoWgpuRenderTexture>[0]): Texture2D {
  const texture = createRenderTexture({ height: 60, width: 90 });
  renderIntoWgpuRenderTexture(state, texture, () => {});
  return texture;
}

function createScale9RenderProxy(texture: Texture2D): RenderProxy2D {
  return {
    alpha: 1,
    blendMode: null,
    colorScaleBias: null,
    material: null,
    materialData: null,
    source: {
      data: { scale9Grid: { height: 10, width: 30, x: 10, y: 20 }, texture },
      scaleX: 2,
      scaleY: 3,
    } as unknown as Scale9Sprite,
    transform2D: { a: 2, b: 0, c: 0, d: 3, tx: 5, ty: 7 },
  } as unknown as RenderProxy2D;
}

function readQuadGeometry(data: Float32Array): number[][] {
  return Array.from({ length: 9 }, (_, index) => {
    const offset = index * QUAD_BATCH_INSTANCE_FLOATS;
    return Array.from(data.slice(offset + 4, offset + 8));
  });
}

function createWgpuTextureEntry(): WgpuTextureEntry {
  return {
    [EntityRuntimeKey]: undefined,
    bindings: new Map(),
    mipLevelCount: 1,
    texture: {} as GPUTexture,
    view: {} as GPUTextureView,
  };
}

function createTint(): ColorScaleBias {
  return {
    alphaBias: 0,
    alphaScale: 1,
    blueBias: 0,
    blueScale: 1,
    greenBias: 0,
    greenScale: 1,
    redBias: 0,
    redScale: 0.5,
  } as ColorScaleBias;
}
