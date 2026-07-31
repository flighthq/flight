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

import { defaultWgpuSpriteRenderer, drawWgpuSprite } from './wgpuSprite';
import { registerStandardWgpuMaterial } from './wgpuStandardMaterial';

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

  it('uses the physical slab once and preserves a top-origin render-target sub-view', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuRenderTextureResolver(state);
    registerStandardWgpuMaterial(state);
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
