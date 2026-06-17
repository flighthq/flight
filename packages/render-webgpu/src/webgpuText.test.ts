import { createText } from '@flighthq/displayobject';
import { getOrCreateRenderNode2D, prepareDisplayObjectRender } from '@flighthq/render';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';
import { defaultWebGPUTextRenderer, drawWebGPUText, drawWebGPUTextMask } from './webgpuText';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUTextRenderer', () => {
  it('has createData and submit functions', () => {
    expect(typeof defaultWebGPUTextRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUTextRenderer.submit).toBe('function');
  });
});

describe('drawWebGPUText', () => {
  it('does not throw for empty text', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const text = createText();
    prepareDisplayObjectRender(state, text);
    const renderNode = getOrCreateRenderNode2D(state, text);

    expect(() => drawWebGPUText(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('drawWebGPUTextMask', () => {
  it('delegates to drawWebGPUText', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const text = createText();
    prepareDisplayObjectRender(state, text);
    const renderNode = getOrCreateRenderNode2D(state, text);
    expect(() => drawWebGPUTextMask(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
