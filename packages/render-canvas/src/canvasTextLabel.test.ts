import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { createTextLabel } from '@flighthq/text';

import { createCanvasRenderState } from './canvasRenderState';
import { drawCanvasTextLabel } from './canvasTextLabel';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

describe('drawCanvasTextLabel', () => {
  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawCanvasTextLabel(state, renderProxy)).not.toThrow();
  });

  it('calls fillText when the text field is non-empty', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    const spy = vi.spyOn(state.context, 'fillText');
    drawCanvasTextLabel(state, renderProxy);
    expect(spy).toHaveBeenCalled();
  });
});
