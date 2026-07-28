import { createBitmapText, updateBitmapText } from '@flighthq/bitmaptext/contract';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';

import { defaultWgpuBitmapTextRenderer } from './wgpuBitmapText';
import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter';

beforeAll(() => {
  installWgpuMock();
});

describe('defaultWgpuBitmapTextRenderer', () => {
  it('has createData and submit functions', () => {
    expect(typeof defaultWgpuBitmapTextRenderer.createData).toBe('function');
    expect(typeof defaultWgpuBitmapTextRenderer.submit).toBe('function');
  });
});

describe('defaultWgpuBitmapTextRenderer.submit', () => {
  it('does not throw for a text node with no bound glyph pages', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const text = createBitmapText(null, { text: 'AB' });
    updateBitmapText(text);
    prepareScene2DRender(state, text);
    const renderProxy = getRenderProxy2D(state, text)!;

    expect(() => {
      defaultWgpuBitmapTextRenderer.submit(state, renderProxy);
      flushWgpuQuadBatchWriter(state as never);
    }).not.toThrow();
    submitWgpuRenderPass(state);
  });
});
