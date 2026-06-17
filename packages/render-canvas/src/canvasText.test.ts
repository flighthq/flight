import { createText } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D } from '@flighthq/render';

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
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawCanvasText(state, renderProxy)).not.toThrow();
  });

  it('calls fillText when the text field is non-empty', () => {
    const state = makeState();
    const node = createText();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    const spy = vi.spyOn(state.context, 'fillText');
    drawCanvasText(state, renderProxy);
    expect(spy).toHaveBeenCalled();
  });
});

describe('drawCanvasTextMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const node = createText();
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawCanvasTextMask(state, renderProxy)).not.toThrow();
  });
});
