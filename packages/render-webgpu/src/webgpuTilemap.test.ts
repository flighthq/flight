import { getSpriteRenderNode, prepareSpriteRender } from '@flighthq/render';
import { createTilemap } from '@flighthq/sprite';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';
import { defaultWebGPUTilemapRenderer } from './webgpuTilemap';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUTilemapRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGPUTilemapRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWebGPUTilemapRenderer.submit).toBe('function');
  });
});

describe('defaultWebGPUTilemapRenderer.submit', () => {
  it('does not throw when tileset is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const tilemap = createTilemap();
    prepareSpriteRender(state, tilemap);
    const renderNode = getSpriteRenderNode(state, tilemap)!;

    expect(() => {
      defaultWebGPUTilemapRenderer.submit(state, renderNode);
      flushWebGPUSpriteBatch(state as any);
    }).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const tilemap = createTilemap();
    prepareSpriteRender(state, tilemap);
    const renderNode = getSpriteRenderNode(state, tilemap)!;

    expect(() => defaultWebGPUTilemapRenderer.submit(state, renderNode)).not.toThrow();
  });
});
