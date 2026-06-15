import { createInputText, getInputTextRuntime } from '@flighthq/displayobject';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
import { setInputTextSelection } from '@flighthq/text-input';

import { defaultCanvasInputTextRenderer, drawCanvasInputText } from './canvasInputText';
import { createCanvasRenderState } from './canvasRenderState';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

describe('defaultCanvasInputTextRenderer', () => {
  it('uses the InputText draw function', () => {
    expect(defaultCanvasInputTextRenderer.submit).toBe(drawCanvasInputText);
  });
});

describe('drawCanvasInputText', () => {
  it('draws a caret for the focused collapsed selection', () => {
    const state = makeState();
    const node = createInputText({ data: { text: 'hello', width: 100, height: 40 } });
    (getInputTextRuntime(node) as ReturnType<typeof getInputTextRuntime> & { focused: boolean }).focused = true;
    setInputTextSelection(node, 2, 2);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    const spy = vi.spyOn(state.context, 'fillRect');

    drawCanvasInputText(state, renderNode);

    expect(spy).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 1, expect.any(Number));
  });

  it('draws selection rectangles for the focused expanded selection', () => {
    const state = makeState();
    const node = createInputText({ data: { text: 'hello', width: 100, height: 40 } });
    (getInputTextRuntime(node) as ReturnType<typeof getInputTextRuntime> & { focused: boolean }).focused = true;
    setInputTextSelection(node, 1, 4);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    const spy = vi.spyOn(state.context, 'fillRect');

    drawCanvasInputText(state, renderNode);

    expect(spy).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
  });
});
