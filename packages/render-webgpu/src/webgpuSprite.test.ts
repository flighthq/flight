import { createSprite } from '@flighthq/sprite';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { renderWebGPUSprite } from './webgpuSprite';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('renderWebGPUSprite', () => {
  it('traverses a sprite node without error', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const root = createSprite();
    expect(() => renderWebGPUSprite(state, root)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
