import { getSpriteRenderNode, prepareSpriteRender } from '@flighthq/render';
import { createSprite } from '@flighthq/sprite';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { defaultWebGPUSpriteRenderer, drawWebGPUSpriteNode } from './webgpuSpriteRenderer';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUSpriteRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWebGPUSpriteRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUSpriteRenderer.draw).toBe('function');
  });
});

describe('drawWebGPUSpriteNode', () => {
  it('does not throw when atlas is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const sprite = createSprite();
    prepareSpriteRender(state, sprite);
    const renderNode = getSpriteRenderNode(state, sprite)!;

    expect(() => drawWebGPUSpriteNode(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
