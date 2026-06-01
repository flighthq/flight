import { getOrCreateDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { createInputText, getInputTextRuntime } from '@flighthq/scenegraph-display';
import { setInputTextSelection } from '@flighthq/text-input';
import { InputTextKind } from '@flighthq/types';

import { defaultDOMInputTextRenderer, drawDOMInputText } from './domInputText';
import { createDOMRenderState } from './domRenderState';
import type { DOMRenderStateInternal } from './internal';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, InputTextKind, defaultDOMInputTextRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  (state as unknown as DOMRenderStateInternal).domCurrentElement = null;
  drawFn();
  return (state as unknown as DOMRenderStateInternal).domCurrentElement;
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
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);

    const div = drawGetEl(state, () => drawDOMInputText(state, renderNode));
    expect(div!.innerHTML).toContain('background:#000000');
  });

  it('appends selection rectangles for the focused expanded selection', () => {
    const state = makeState();
    const node = createInputText({ data: { text: 'hello', width: 100, height: 40 } });
    (getInputTextRuntime(node) as ReturnType<typeof getInputTextRuntime> & { focused: boolean }).focused = true;
    setInputTextSelection(node, 1, 4);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);

    const div = drawGetEl(state, () => drawDOMInputText(state, renderNode));
    expect(div!.innerHTML).toContain('background:#0078d7');
  });
});
