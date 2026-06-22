import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { createSprite } from '@flighthq/sprite';

import { renderWgpuSprite } from './webgpuSprite';

beforeAll(() => {
  installWgpuMock();
});

describe('renderWgpuSprite', () => {
  it('traverses a sprite node without error', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const root = createSprite();
    expect(() => renderWgpuSprite(state, root)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});
