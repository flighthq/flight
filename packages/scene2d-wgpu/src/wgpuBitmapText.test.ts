import { createBitmapText, updateBitmapText } from '@flighthq/bitmaptext/contract';
import { beginWgpuScreenRenderPassForTest, submitWgpuFrame } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';

import { wgpuBitmapTextRenderer } from './wgpuBitmapText';
import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter';

beforeAll(() => {
  installWgpuMock();
});

describe('wgpuBitmapTextRenderer', () => {
  it('has createData and submit functions', () => {
    expect(typeof wgpuBitmapTextRenderer.createData).toBe('function');
    expect(typeof wgpuBitmapTextRenderer.submit).toBe('function');
  });
});

describe('wgpuBitmapTextRenderer.submit', () => {
  it('does not throw for a text node with no bound glyph pages', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);

    const text = createBitmapText(null, { text: 'AB' });
    updateBitmapText(text);
    prepareScene2DRender(state, text);
    const renderProxy = getRenderProxy2D(state, text)!;

    expect(() => {
      wgpuBitmapTextRenderer.submit(state, renderProxy);
      flushWgpuQuadBatchWriter(state as never);
    }).not.toThrow();
    submitWgpuFrame(state);
  });
});
