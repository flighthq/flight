import { getRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { createTilemap } from '@flighthq/sprite';

import { flushWgpuSpriteBatch } from './wgpuSpriteBatch';
import { defaultWgpuTilemapRenderer } from './wgpuTilemap';

beforeAll(() => {
  installWgpuMock();
});

describe('defaultWgpuTilemapRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWgpuTilemapRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWgpuTilemapRenderer.submit).toBe('function');
  });
});

describe('defaultWgpuTilemapRenderer.submit', () => {
  it('does not throw when tileset is null', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const tilemap = createTilemap();
    prepareDisplayObjectRender(state, tilemap);
    const renderProxy = getRenderProxy2D(state, tilemap)!;

    expect(() => {
      defaultWgpuTilemapRenderer.submit(state, renderProxy);
      flushWgpuSpriteBatch(state as any);
    }).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    const tilemap = createTilemap();
    prepareDisplayObjectRender(state, tilemap);
    const renderProxy = getRenderProxy2D(state, tilemap)!;

    expect(() => defaultWgpuTilemapRenderer.submit(state, renderProxy)).not.toThrow();
  });
});
