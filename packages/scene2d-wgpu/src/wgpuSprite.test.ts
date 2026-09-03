import {
  createWgpuRenderStateForTest,
  getWgpuRenderStateRuntime,
  installWgpuMock,
  registerWgpuRenderTextureResolver,
  renderIntoWgpuRenderTexture,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { createSprite } from '@flighthq/scene2d/contract';
import { createRenderTexture, setTextureUvFromPixelRect } from '@flighthq/texture/contract';

import { registerWgpuColorAdjustmentMaterialFeature } from './wgpuColorAdjustmentMaterialFeature';
import { defaultWgpuSpriteRenderer, drawWgpuSprite } from './wgpuSprite';
import { registerWgpuStandardMaterial } from './wgpuStandardMaterial';

const CT_MODE_UNIFORM = 1;

function ct(scale: number): unknown {
  return {
    alphaBias: 0,
    alphaScale: 1,
    blueBias: 0,
    blueScale: scale,
    greenBias: 0,
    greenScale: scale,
    redBias: 0,
    redScale: scale,
  };
}

async function drawSpriteOverNewTexture(
  state: Awaited<ReturnType<typeof createWgpuRenderStateForTest>>,
  size: number,
  colorScaleBias: unknown,
): Promise<void> {
  const texture = createRenderTexture({ height: size, width: size });
  renderIntoWgpuRenderTexture(state, texture, () => {});
  const sprite = createSprite({ data: { texture } });
  prepareScene2DRender(state, sprite);
  const proxy = getOrCreateRenderProxy2D(state, sprite);
  (proxy as { colorScaleBias: unknown }).colorScaleBias = colorScaleBias;
  drawWgpuSprite(state, proxy);
}

beforeAll(() => installWgpuMock());

describe('defaultWgpuSpriteRenderer', () => {
  it('has createData and submit functions', () => {
    expect(typeof defaultWgpuSpriteRenderer.createData).toBe('function');
    expect(typeof defaultWgpuSpriteRenderer.isDirty).toBe('function');
    expect(defaultWgpuSpriteRenderer.submit).toBe(drawWgpuSprite);
  });
});

describe('drawWgpuSprite', () => {
  it('accepts an unbound sprite', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const sprite = createSprite();
    prepareScene2DRender(state, sprite);
    expect(() => drawWgpuSprite(state, getOrCreateRenderProxy2D(state, sprite))).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('records a tint against the instance the flush uploads when a new texture breaks the batch', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuRenderTextureResolver(state);
    registerWgpuStandardMaterial(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    const runtime = getWgpuRenderStateRuntime(state);

    await drawSpriteOverNewTexture(state, 32, null);
    expect(runtime.quadBatchWriterCount).toBe(1);

    await drawSpriteOverNewTexture(state, 16, ct(0.5));

    expect(runtime.quadBatchWriterCount).toBe(1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_UNIFORM);
    submitWgpuRenderPass(state);
  });

  it('uses the physical slab once and preserves a top-origin render-target sub-view', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuRenderTextureResolver(state);
    registerWgpuStandardMaterial(state);
    const renderTexture = createRenderTexture({ height: 480, width: 720 });
    setTextureUvFromPixelRect(renderTexture, 140, 160, 100, 80);
    renderIntoWgpuRenderTexture(state, renderTexture, () => {});
    const sprite = createSprite({ data: { texture: renderTexture } });
    prepareScene2DRender(state, sprite);

    drawWgpuSprite(state, getOrCreateRenderProxy2D(state, sprite));

    const data = getWgpuRenderStateRuntime(state).quadBatchWriterInstanceData;
    expect(data.slice(6, 12)).toEqual(new Float32Array([100, 80, 140 / 720, 160 / 480, 240 / 720, 240 / 480]));
    submitWgpuRenderPass(state);
  });
});
