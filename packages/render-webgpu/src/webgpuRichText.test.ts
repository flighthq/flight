import { createRichText } from '@flighthq/displayobject';
import { getOrCreateDisplayObjectRenderNode, prepareDisplayObjectRender } from '@flighthq/render';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import {
  defaultWebGPURichTextRenderer,
  drawWebGPURichText,
  drawWebGPURichTextMask,
  drawWebGPURichTextWithOverlay,
} from './webgpuRichText';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPURichTextRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWebGPURichTextRenderer.createData).toBe('function');
    expect(typeof defaultWebGPURichTextRenderer.submit).toBe('function');
  });
});

describe('drawWebGPURichText', () => {
  it('does not throw for empty rich text', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const richText = createRichText();
    prepareDisplayObjectRender(state, richText);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, richText);

    expect(() => drawWebGPURichText(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const richText = createRichText();
    prepareDisplayObjectRender(state, richText);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, richText);

    expect(() => drawWebGPURichText(state, renderNode)).not.toThrow();
  });
});

describe('drawWebGPURichTextMask', () => {
  it('delegates to drawWebGPURichText', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const richText = createRichText();
    prepareDisplayObjectRender(state, richText);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, richText);
    expect(() => drawWebGPURichTextMask(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('drawWebGPURichTextWithOverlay', () => {
  it('does not throw for empty rich text', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const richText = createRichText();
    prepareDisplayObjectRender(state, richText);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, richText);
    expect(() => drawWebGPURichTextWithOverlay(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
