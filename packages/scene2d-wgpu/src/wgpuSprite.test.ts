import {
  createWgpuRenderStateForTest,
  installWgpuMock,
  renderWgpuBackground,
  submitWgpuRenderPass,
} from '@flighthq/render-wgpu/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { createSprite } from '@flighthq/scene2d/contract';

import { defaultWgpuSpriteRenderer, drawWgpuSprite } from './wgpuSprite';

beforeAll(() => installWgpuMock());

describe('defaultWgpuSpriteRenderer', () => {
  it('has createData and submit functions', () => {
    expect(typeof defaultWgpuSpriteRenderer.createData).toBe('function');
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
});
