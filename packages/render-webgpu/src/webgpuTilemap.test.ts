import { getSpriteRenderNode, prepareSpriteRender } from '@flighthq/render';
import { createTilemap } from '@flighthq/sprite';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';
import { defaultWebGPUTilemapRenderer, drawWebGPUTilemap } from './webgpuTilemap';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUTilemapRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWebGPUTilemapRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUTilemapRenderer.draw).toBe('function');
  });
});

describe('drawWebGPUTilemap', () => {
  it('does not throw when tileset is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const tilemap = createTilemap();
    prepareSpriteRender(state, tilemap);
    const renderNode = getSpriteRenderNode(state, tilemap)!;

    expect(() => drawWebGPUTilemap(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const tilemap = createTilemap();
    prepareSpriteRender(state, tilemap);
    const renderNode = getSpriteRenderNode(state, tilemap)!;

    expect(() => drawWebGPUTilemap(state, renderNode)).not.toThrow();
  });
});
