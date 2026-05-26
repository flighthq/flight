import { getDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { createText } from '@flighthq/scenegraph-display';
import { TextKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMTextRenderer, drawDOMText, drawDOMTextMask } from './domText';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, TextKind, defaultDOMTextRenderer);
  return state;
}

describe('drawDOMText', () => {
  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createText();
    node.data.text = '';
    const renderNode = getDisplayObjectRenderNode(state, node);
    expect(() => drawDOMText(state, renderNode)).not.toThrow();
  });

  it('does not append anything when text is empty', () => {
    const state = makeState();
    const node = createText();
    node.data.text = '';
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMText(state, renderNode);

    expect(state.element.children.length).toBe(0);
  });

  it('appends a div when text is non-empty', () => {
    const state = makeState();
    const node = createText();
    node.data.text = 'hello';
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMText(state, renderNode);

    expect(state.element.children.length).toBe(1);
    expect(state.element.children[0].tagName).toBe('DIV');
  });

  it('sets overflow:hidden on the div', () => {
    const state = makeState();
    const node = createText();
    node.data.text = 'hello';
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMText(state, renderNode);

    const div = state.element.children[0] as HTMLElement;
    expect(div.style.overflow).toBe('hidden');
  });

  it('includes the text content in innerHTML', () => {
    const state = makeState();
    const node = createText();
    node.data.text = 'world';
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMText(state, renderNode);

    const div = state.element.children[0] as HTMLElement;
    expect(div.innerHTML).toContain('world');
  });

  it('reuses the same div across multiple draws', () => {
    const state = makeState();
    const node = createText();
    node.data.text = 'hello';
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMText(state, renderNode);
    const firstDiv = state.element.children[0];

    while (state.element.firstChild) state.element.removeChild(state.element.firstChild);
    drawDOMText(state, renderNode);
    const secondDiv = state.element.children[0];

    expect(firstDiv).toBe(secondDiv);
  });
});

describe('drawDOMTextMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const node = createText();
    const renderNode = getDisplayObjectRenderNode(state, node);
    expect(() => drawDOMTextMask(state, renderNode)).not.toThrow();
  });
});

describe('defaultDOMTextRenderer', () => {
  it('has draw, drawMask, and createData', () => {
    expect(typeof defaultDOMTextRenderer.draw).toBe('function');
    expect(typeof defaultDOMTextRenderer.drawMask).toBe('function');
    expect(typeof defaultDOMTextRenderer.createData).toBe('function');
  });
});
