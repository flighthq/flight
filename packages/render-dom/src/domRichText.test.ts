import { getDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { createRichText } from '@flighthq/scenegraph-display';
import { RichTextKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMRichTextRenderer, drawDOMRichText, drawDOMRichTextMask } from './domRichText';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, RichTextKind, defaultDOMRichTextRenderer);
  return state;
}

describe('defaultDOMRichTextRenderer', () => {
  it('has draw, drawMask, and createData', () => {
    expect(typeof defaultDOMRichTextRenderer.draw).toBe('function');
    expect(typeof defaultDOMRichTextRenderer.drawMask).toBe('function');
    expect(typeof defaultDOMRichTextRenderer.createData).toBe('function');
  });
});

describe('drawDOMRichText', () => {
  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = '';
    const renderNode = getDisplayObjectRenderNode(state, node);
    expect(() => drawDOMRichText(state, renderNode)).not.toThrow();
  });

  it('appends the div even when text is empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = '';
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMRichText(state, renderNode);

    expect(state.element.children.length).toBe(1);
  });

  it('clears innerHTML when text is empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hello';
    const renderNode = getDisplayObjectRenderNode(state, node);
    drawDOMRichText(state, renderNode);

    while (state.element.firstChild) state.element.removeChild(state.element.firstChild);
    node.data.text = '';
    drawDOMRichText(state, renderNode);

    const div = state.element.children[0] as HTMLElement;
    expect(div.innerHTML).toBe('');
  });

  it('appends a div when text is non-empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hello';
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMRichText(state, renderNode);

    expect(state.element.children.length).toBe(1);
    expect(state.element.children[0].tagName).toBe('DIV');
  });

  it('sets div width and height from source data', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hello';
    node.data.width = 200;
    node.data.height = 100;
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMRichText(state, renderNode);

    const div = state.element.children[0] as HTMLElement;
    expect(div.style.width).toBe('200px');
    expect(div.style.height).toBe('100px');
  });

  it('includes the text content in innerHTML', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'world';
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMRichText(state, renderNode);

    const div = state.element.children[0] as HTMLElement;
    expect(div.innerHTML).toContain('world');
  });

  it('renders resolved htmlText spans', () => {
    const state = makeState();
    const node = createRichText();
    node.data.htmlText = '<b>Bold</b><font color="#00ff00">Green</font>';
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMRichText(state, renderNode);

    const div = state.element.children[0] as HTMLElement;
    expect(div.innerHTML).toContain('Bold');
    expect(div.innerHTML).toContain('Green');
    expect(div.innerHTML).toContain('bold');
    expect(div.innerHTML).toContain('#00ff00');
  });

  it('sets backgroundColor when background is enabled', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hi';
    node.data.background = true;
    node.data.backgroundColor = 0xff0000;
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMRichText(state, renderNode);

    const div = state.element.children[0] as HTMLElement;
    expect(div.style.backgroundColor).not.toBe('');
  });

  it('clears backgroundColor when background is disabled', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hi';
    node.data.background = false;
    const renderNode = getDisplayObjectRenderNode(state, node);

    drawDOMRichText(state, renderNode);

    const div = state.element.children[0] as HTMLElement;
    expect(div.style.backgroundColor).toBe('');
  });
});

describe('drawDOMRichTextMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const node = createRichText();
    const renderNode = getDisplayObjectRenderNode(state, node);
    expect(() => drawDOMRichTextMask(state, renderNode)).not.toThrow();
  });
});
