import { getRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { createSprite } from '@flighthq/sprite';

import { flushWgpuSpriteBatch } from './wgpuSpriteBatch';
import { defaultWgpuSpriteRenderer } from './wgpuSpriteRenderer';

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
    prepareDisplayObjectRender(state, sprite);
    const renderProxy = getRenderProxy2D(state, sprite)!;

    expect(() => {
      defaultWgpuSpriteRenderer.submit(state, renderProxy);
      flushWgpuSpriteBatch(state as any);
    }).not.toThrow();
    submitWgpuRenderPass(state);
  });
});
