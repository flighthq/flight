import { getDisplayObjectRenderNode } from '@flighthq/render-core';
import { createRichText } from '@flighthq/scenegraph-display';

import { createCanvasRenderState } from './canvasRenderState';
import { defaultCanvasRichTextRenderer, drawCanvasRichText, drawCanvasRichTextMask } from './canvasRichText';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

describe('drawCanvasRichText', () => {
  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = '';
    const renderNode = getDisplayObjectRenderNode(state, node);
    expect(() => drawCanvasRichText(state, renderNode)).not.toThrow();
  });

  it('calls fillText when the text field is non-empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hello';
    const renderNode = getDisplayObjectRenderNode(state, node);
    const spy = vi.spyOn(state.context, 'fillText');
    drawCanvasRichText(state, renderNode);
    expect(spy).toHaveBeenCalled();
  });

  it('renders resolved htmlText spans', () => {
    const state = makeState();
    const node = createRichText();
    node.data.htmlText = '<font color="#ff0000">red</font><b>bold</b>';
    const renderNode = getDisplayObjectRenderNode(state, node);
    const spy = vi.spyOn(state.context, 'fillText');

    drawCanvasRichText(state, renderNode);

    expect(spy).toHaveBeenCalledWith('red', expect.any(Number), expect.any(Number));
    expect(spy).toHaveBeenCalledWith('bold', expect.any(Number), expect.any(Number));
  });
});

describe('drawCanvasRichTextMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const node = createRichText();
    const renderNode = getDisplayObjectRenderNode(state, node);
    expect(() => drawCanvasRichTextMask(state, renderNode)).not.toThrow();
  });
});
