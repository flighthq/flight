import { createRichText } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { enableTextInput } from '@flighthq/text-input';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { drawWebGPURichText } from './webgpuRichText';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';
import { drawWebGPUTextInputOverlay, enableWebGPUTextInput } from './webgpuTextInput';

beforeAll(() => {
  installWebGPUMock();
});

describe('drawWebGPUTextInputOverlay', () => {
  it('is the installed overlay function', () => {
    expect(typeof drawWebGPUTextInputOverlay).toBe('function');
  });

  it('rasterizes a focused editable field without throwing', async () => {
    enableWebGPUTextInput();
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const input = createRichText({ data: { height: 40, text: 'hi', width: 100 } });
    enableTextInput(input).focused = true;
    prepareDisplayObjectRender(state, input);
    const renderProxy = getOrCreateRenderProxy2D(state, input);

    expect(() => drawWebGPURichText(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('enableWebGPUTextInput', () => {
  it('installs the overlay without throwing', () => {
    expect(() => enableWebGPUTextInput()).not.toThrow();
  });
});
