import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { createRichText } from '@flighthq/text';
import { enableTextInput } from '@flighthq/text-input';

import {
  createWgpuRichTextData,
  defaultWgpuRichTextRenderer,
  destroyWgpuRichTextData,
  drawWgpuRichText,
  drawWgpuRichTextWithOverlay,
  registerWgpuTextInputOverlay,
} from './wgpuRichText';

beforeAll(() => {
  installWgpuMock();
});

describe('createWgpuRichTextData', () => {
  it('allocates per-node data with no texture entry yet', () => {
    const data = createWgpuRichTextData({} as never, {} as never) as unknown as { entry: unknown };
    expect(data.entry).toBeNull();
  });
});

describe('defaultWgpuRichTextRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWgpuRichTextRenderer.createData).toBe('function');
    expect(typeof defaultWgpuRichTextRenderer.submit).toBe('function');
  });
});

describe('destroyWgpuRichTextData', () => {
  it('destroys the GPU texture the node owns', () => {
    const destroy = vi.fn();
    destroyWgpuRichTextData({} as never, { entry: { texture: { destroy } } } as never);
    expect(destroy).toHaveBeenCalled();
  });

  it('is a no-op when no texture entry was allocated', () => {
    expect(() => destroyWgpuRichTextData({} as never, { entry: null } as never)).not.toThrow();
  });
});

describe('drawWgpuRichText', () => {
  it('does not throw for empty rich text', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const richText = createRichText();
    prepareDisplayObjectRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);

    expect(() => drawWgpuRichText(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    const richText = createRichText();
    prepareDisplayObjectRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);

    expect(() => drawWgpuRichText(state, renderProxy)).not.toThrow();
  });
});

describe('drawWgpuRichTextWithOverlay', () => {
  it('does not throw for empty rich text', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const richText = createRichText();
    prepareDisplayObjectRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);
    expect(() => drawWgpuRichTextWithOverlay(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('registerWgpuTextInputOverlay', () => {
  it('invokes the registered overlay only for a RichText with an input slot', async () => {
    const overlay = vi.fn();
    registerWgpuTextInputOverlay(overlay);
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const plain = createRichText({ data: { height: 40, text: 'x', width: 100 } });
    prepareDisplayObjectRender(state, plain);
    drawWgpuRichText(state, getOrCreateRenderProxy2D(state, plain));
    expect(overlay).not.toHaveBeenCalled();

    const editable = createRichText({ data: { height: 40, text: 'x', width: 100 } });
    enableTextInput(editable);
    prepareDisplayObjectRender(state, editable);
    drawWgpuRichText(state, getOrCreateRenderProxy2D(state, editable));
    expect(overlay).toHaveBeenCalled();
    submitWgpuRenderPass(state);
  });
});
