import { getOrCreateRenderProxy2D } from '@flighthq/render/contract';
import { createRichText } from '@flighthq/text/contract';
import { enableTextInput } from '@flighthq/textinput/contract';

import {
  defaultCanvasRichTextRenderer,
  drawCanvasRichText,
  drawCanvasRichTextMask,
  registerCanvasTextInputOverlay,
} from './canvasRichText';
import { createCanvasRenderState } from './canvasTestSupport';

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
      { start: 0, end: 3, format: { color: 0xff0000ff } },
      { start: 3, end: 7, format: { bold: true } },
    ];
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    const spy = vi.spyOn(state.context, 'fillText');

    drawCanvasRichText(state, renderProxy);

    expect(spy).toHaveBeenCalledWith('red', expect.any(Number), expect.any(Number));
    expect(spy).toHaveBeenCalledWith('bold', expect.any(Number), expect.any(Number));
  });

  it('keeps packed run alpha separate from resolved node alpha', () => {
    const state = makeState();
    const node = createRichText();
    node.alpha = 0.5;
    node.data.text = 'alpha';
    node.data.textFormatRanges = [{ start: 0, end: 5, format: { color: 0xff000080, underline: true } }];
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    renderProxy.alpha = node.alpha;
    const fills: Array<{ alpha: number; style: string | CanvasGradient | CanvasPattern }> = [];
    const strokes: Array<{ alpha: number; style: string | CanvasGradient | CanvasPattern }> = [];
    vi.spyOn(state.context, 'fillText').mockImplementation(() => {
      fills.push({ alpha: state.context.globalAlpha, style: state.context.fillStyle });
    });
    vi.spyOn(state.context, 'stroke').mockImplementation(() => {
      strokes.push({ alpha: state.context.globalAlpha, style: state.context.strokeStyle });
    });

    drawCanvasRichText(state, renderProxy);

    expect(fills).toEqual([{ alpha: 0.5, style: 'rgba(255, 0, 0, 0.5019607843137255)' }]);
    expect(strokes).toEqual([{ alpha: 0.5, style: 'rgba(255, 0, 0, 0.5019607843137255)' }]);
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
