import { getDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { createInputText, getInputTextRuntime } from '@flighthq/scenegraph-display';
import { setInputTextSelection } from '@flighthq/text-input';
import { InputTextKind } from '@flighthq/types';

import { defaultDOMInputTextRenderer, drawDOMInputText } from './domInputText';
import { createDOMRenderState } from './domRenderState';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, InputTextKind, defaultDOMInputTextRenderer);
  return state;
}

describe('defaultDOMInputTextRenderer', () => {
  it('uses the InputText draw function', () => {
    expect(defaultDOMInputTextRenderer.draw).toBe(drawDOMInputText);
  });
});

describe('drawDOMInputText', () => {
  it('appends a caret for the focused collapsed selection', () => {
    const state = makeState();
    const node = createInputText({ data: { text: 'hello', width: 100, height: 40 } });
    (getInputTextRuntime(node) as ReturnType<typeof getInputTextRuntime> & { focused: boolean }).focused = true;
    setInputTextSelection(node, 2, 2);
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMInputText(state, renderNode);

    const div = state.element.children[0] as HTMLElement;
    expect(div.innerHTML).toContain('background:#000000');
  });

  it('appends selection rectangles for the focused expanded selection', () => {
    const state = makeState();
    const node = createInputText({ data: { text: 'hello', width: 100, height: 40 } });
    (getInputTextRuntime(node) as ReturnType<typeof getInputTextRuntime> & { focused: boolean }).focused = true;
    setInputTextSelection(node, 1, 4);
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMInputText(state, renderNode);

    const div = state.element.children[0] as HTMLElement;
    expect(div.innerHTML).toContain('background:#0078d7');
  });
});
