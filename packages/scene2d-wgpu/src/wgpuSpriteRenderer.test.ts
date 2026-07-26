import { createImageResource } from '@flighthq/image';
import { getWgpuRenderStateRuntime, renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { getRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { createSprite } from '@flighthq/sprite';
import type { TextureAtlas } from '@flighthq/types/contract';

import { flushWgpuSpriteBatch } from './wgpuSpriteBatch';
import { defaultWgpuSpriteRenderer } from './wgpuSpriteRenderer';
import { registerStandardWgpuMaterial } from './wgpuStandardMaterial';

beforeAll(() => {
  installWgpuMock();
});

describe('defaultWgpuSpriteRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWgpuSpriteRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWgpuSpriteRenderer.submit).toBe('function');
  });
});

describe('defaultWgpuSpriteRenderer.submit', () => {
  it('does not throw when atlas is null', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const sprite = createSprite();
    prepareScene2DRender(state, sprite);
    const renderProxy = getRenderProxy2D(state, sprite)!;

    expect(() => {
      defaultWgpuSpriteRenderer.submit(state, renderProxy);
      flushWgpuSpriteBatch(state as any);
    }).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('folds the region pivot through the sprite transform into batch translation', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerStandardWgpuMaterial(state);
    const atlas = {
      image: createImageResource(document.createElement('img')),
      regions: [{ height: 32, id: 0, name: null, pivotX: 7, pivotY: 9, width: 32, x: 0, y: 0 }],
    };
    const sprite = createSprite();
    sprite.data.atlas = atlas as unknown as TextureAtlas;
    prepareScene2DRender(state, sprite);
    const renderProxy = getRenderProxy2D(state, sprite)!;
    Object.assign(renderProxy.transform2D, { a: 2, b: 3, c: 4, d: 5, tx: 100, ty: 200 });

    defaultWgpuSpriteRenderer.submit(state, renderProxy);

    const data = getWgpuRenderStateRuntime(state).spriteBatchInstanceData;
    expect(data[4]).toBe(50);
    expect(data[5]).toBe(134);
    submitWgpuRenderPass(state);
  });
});
