import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { createRichText } from '@flighthq/text';
import { enableTextInput } from '@flighthq/textinput';

import { drawWgpuRichText } from './wgpuRichText';
import { drawWgpuTextInputOverlay, enableWgpuTextInput } from './wgpuTextInput';

beforeAll(() => {
  installWgpuMock();
});

describe('drawWgpuTextInputOverlay', () => {
  it('is the installed overlay function', () => {
    expect(typeof drawWgpuTextInputOverlay).toBe('function');
  });

  it('rasterizes a focused editable field without throwing', async () => {
    enableWgpuTextInput();
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const input = createRichText({ data: { height: 40, text: 'hi', width: 100 } });
    enableTextInput(input).focused = true;
    prepareDisplayObjectRender(state, input);
    const renderProxy = getOrCreateRenderProxy2D(state, input);

    expect(() => drawWgpuRichText(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('enableWgpuTextInput', () => {
  it('installs the overlay without throwing', () => {
    expect(() => enableWgpuTextInput()).not.toThrow();
  });
});
