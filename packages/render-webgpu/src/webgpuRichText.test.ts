import { createRichText } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import {
  createWebGPURichTextData,
  defaultWebGPURichTextRenderer,
  destroyWebGPURichTextData,
  drawWebGPURichText,
  drawWebGPURichTextMask,
  drawWebGPURichTextWithOverlay,
} from './webgpuRichText';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('createWebGPURichTextData', () => {
  it('allocates per-node data with no texture entry yet', () => {
    const data = createWebGPURichTextData({} as never, {} as never) as unknown as { entry: unknown };
    expect(data.entry).toBeNull();
  });
});

describe('defaultWebGPURichTextRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWebGPURichTextRenderer.createData).toBe('function');
    expect(typeof defaultWebGPURichTextRenderer.submit).toBe('function');
  });
});

describe('destroyWebGPURichTextData', () => {
  it('destroys the GPU texture the node owns', () => {
    const destroy = vi.fn();
    destroyWebGPURichTextData({} as never, { entry: { texture: { destroy } } } as never);
    expect(destroy).toHaveBeenCalled();
  });

  it('is a no-op when no texture entry was allocated', () => {
    expect(() => destroyWebGPURichTextData({} as never, { entry: null } as never)).not.toThrow();
  });
});

describe('drawWebGPURichText', () => {
  it('does not throw for empty rich text', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const richText = createRichText();
    prepareDisplayObjectRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);

    expect(() => drawWebGPURichText(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const richText = createRichText();
    prepareDisplayObjectRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);

    expect(() => drawWebGPURichText(state, renderProxy)).not.toThrow();
  });
});

describe('drawWebGPURichTextMask', () => {
  it('delegates to drawWebGPURichText', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const richText = createRichText();
    prepareDisplayObjectRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);
    expect(() => drawWebGPURichTextMask(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('drawWebGPURichTextWithOverlay', () => {
  it('does not throw for empty rich text', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const richText = createRichText();
    prepareDisplayObjectRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);
    expect(() => drawWebGPURichTextWithOverlay(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
