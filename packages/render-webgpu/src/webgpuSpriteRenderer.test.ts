import { getRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { createSprite } from '@flighthq/sprite';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';
import { defaultWebGPUSpriteRenderer } from './webgpuSpriteRenderer';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUSpriteRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGPUSpriteRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWebGPUSpriteRenderer.submit).toBe('function');
  });
});

describe('defaultWebGPUSpriteRenderer.submit', () => {
  it('does not throw when atlas is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const sprite = createSprite();
    prepareDisplayObjectRender(state, sprite);
    const renderProxy = getRenderProxy2D(state, sprite)!;

    expect(() => {
      defaultWebGPUSpriteRenderer.submit(state, renderProxy);
      flushWebGPUSpriteBatch(state as any);
    }).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
