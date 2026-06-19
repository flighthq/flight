import { createRichText } from '@flighthq/displayobject';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { RichTextKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMRichTextRenderer, drawDOMRichText } from './domRichText';
import type { DOMRenderStateInternal } from './internal';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, RichTextKind, defaultDOMRichTextRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  (state as unknown as DOMRenderStateInternal).domCurrentElement = null;
  drawFn();
  return (state as unknown as DOMRenderStateInternal).domCurrentElement;
}

describe('defaultDOMRichTextRenderer', () => {
  it('has submit, and createData', () => {
    expect(typeof defaultDOMRichTextRenderer.submit).toBe('function');
    expect(typeof defaultDOMRichTextRenderer.createData).toBe('function');
  });
});

describe('drawDOMRichText', () => {
  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawDOMRichText(state, renderProxy)).not.toThrow();
  });

  it('produces a div even when text is empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDOMRichText(state, renderProxy));

    expect(el).not.toBeNull();
  });

  it('clears innerHTML when text is empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    drawDOMRichText(state, renderProxy);

    node.data.text = '';
    const div = drawGetEl(state, () => drawDOMRichText(state, renderProxy));

    expect(div!.innerHTML).toBe('');
  });

  it('produces a div when text is non-empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDOMRichText(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('DIV');
  });

  it('sets div width and height from source data', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hello';
    node.data.width = 200;
    node.data.height = 100;
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMRichText(state, renderProxy))!;
    expect(div.style.width).toBe('200px');
    expect(div.style.height).toBe('100px');
  });

  it('includes the text content in innerHTML', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'world';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMRichText(state, renderProxy))!;
    expect(div.innerHTML).toContain('world');
  });

  it('renders resolved htmlText spans', () => {
    const state = makeState();
    const node = createRichText();
    node.data.htmlText = '<b>Bold</b><font color="#00ff00">Green</font>';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMRichText(state, renderProxy))!;
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
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMRichText(state, renderProxy))!;
    expect(div.style.backgroundColor).not.toBe('');
  });

  it('clears backgroundColor when background is disabled', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hi';
    node.data.background = false;
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMRichText(state, renderProxy))!;
    expect(div.style.backgroundColor).toBe('');
  });
});
