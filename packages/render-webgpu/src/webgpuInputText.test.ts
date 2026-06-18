import { createInputText } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { defaultWebGPUInputTextRenderer, drawWebGPUInputText, drawWebGPUInputTextMask } from './webgpuInputText';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUInputTextRenderer', () => {
  it('has createData, destroyData, and submit functions', () => {
    expect(typeof defaultWebGPUInputTextRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUInputTextRenderer.destroyData).toBe('function');
    expect(defaultWebGPUInputTextRenderer.submit).toBe(drawWebGPUInputText);
  });
});

describe('drawWebGPUInputText', () => {
  it('does not throw for an empty input field', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const input = createInputText();
    prepareDisplayObjectRender(state, input);
    const renderProxy = getOrCreateRenderProxy2D(state, input);

    expect(() => drawWebGPUInputText(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const input = createInputText();
    prepareDisplayObjectRender(state, input);
    const renderProxy = getOrCreateRenderProxy2D(state, input);

    expect(() => drawWebGPUInputText(state, renderProxy)).not.toThrow();
  });
});

describe('drawWebGPUInputTextMask', () => {
  it('delegates to the rich text mask path', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const input = createInputText();
    prepareDisplayObjectRender(state, input);
    const renderProxy = getOrCreateRenderProxy2D(state, input);

    expect(() => drawWebGPUInputTextMask(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
