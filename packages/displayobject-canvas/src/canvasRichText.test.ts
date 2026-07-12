import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { createRichText } from '@flighthq/text';
import { enableTextInput } from '@flighthq/textinput';

import { createCanvasRenderState } from './canvasRenderState';
import {
  defaultCanvasRichTextRenderer,
  drawCanvasRichText,
  drawCanvasRichTextMask,
  registerCanvasTextInputOverlay,
} from './canvasRichText';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

describe('defaultCanvasRichTextRenderer', () => {
  it('has noopRendererData as createData', () => {
    expect(typeof defaultCanvasRichTextRenderer.createData).toBe('function');
  });

  it('has drawCanvasRichText as submit', () => {
    expect(defaultCanvasRichTextRenderer.submit).toBe(drawCanvasRichText);
  });
});

describe('drawCanvasRichText', () => {
  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawCanvasRichText(state, renderProxy)).not.toThrow();
  });

  it('calls fillText when the text field is non-empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    const spy = vi.spyOn(state.context, 'fillText');
    drawCanvasRichText(state, renderProxy);
    expect(spy).toHaveBeenCalled();
  });

  it('renders resolved multi-format spans', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'redbold';
    node.data.textFormatRanges = [
      { start: 0, end: 3, format: { color: 0xff0000 } },
      { start: 3, end: 7, format: { bold: true } },
    ];
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    const spy = vi.spyOn(state.context, 'fillText');

    drawCanvasRichText(state, renderProxy);

    expect(spy).toHaveBeenCalledWith('red', expect.any(Number), expect.any(Number));
    expect(spy).toHaveBeenCalledWith('bold', expect.any(Number), expect.any(Number));
  });
});

describe('drawCanvasRichTextMask', () => {
  // The mask path is a no-op stub on the Canvas backend — masking is handled uniformly
  // through pushCanvasClipContours (the clip hooks), not through per-kind draw-mask functions.
  it('does not throw', () => {
    const state = makeState();
    const node = createRichText({ data: { text: 'hello' } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawCanvasRichTextMask(state, renderProxy)).not.toThrow();
  });
});

describe('registerCanvasTextInputOverlay', () => {
  it('invokes the registered overlay only for a RichText with an input slot', () => {
    const overlay = vi.fn();
    registerCanvasTextInputOverlay(overlay);
    const state = makeState();

    const plain = createRichText({ data: { text: 'x' } });
    drawCanvasRichText(state, getOrCreateRenderProxy2D(state, plain));
    expect(overlay).not.toHaveBeenCalled();

    const editable = createRichText({ data: { text: 'x' } });
    enableTextInput(editable);
    drawCanvasRichText(state, getOrCreateRenderProxy2D(state, editable));
    expect(overlay).toHaveBeenCalled();
  });
});
