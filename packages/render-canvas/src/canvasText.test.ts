import { createText } from '@flighthq/displayobject';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';

import { createCanvasRenderState } from './canvasRenderState';
import { drawCanvasText, drawCanvasTextMask } from './canvasText';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

describe('drawCanvasText', () => {
  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createText();
    node.data.text = '';
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    expect(() => drawCanvasText(state, renderNode)).not.toThrow();
  });

  it('calls fillText when the text field is non-empty', () => {
    const state = makeState();
    const node = createText();
    node.data.text = 'hello';
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    const spy = vi.spyOn(state.context, 'fillText');
    drawCanvasText(state, renderNode);
    expect(spy).toHaveBeenCalled();
  });
});

describe('drawCanvasTextMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const node = createText();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    expect(() => drawCanvasTextMask(state, renderNode)).not.toThrow();
  });
});
