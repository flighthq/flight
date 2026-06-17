import { createText } from '@flighthq/displayobject';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { TextKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMTextRenderer, drawDOMText, drawDOMTextMask } from './domText';
import type { DOMRenderStateInternal } from './internal';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, TextKind, defaultDOMTextRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  (state as unknown as DOMRenderStateInternal).domCurrentElement = null;
  drawFn();
  return (state as unknown as DOMRenderStateInternal).domCurrentElement;
}

describe('defaultDOMTextRenderer', () => {
  it('has submit, and createData', () => {
    expect(typeof defaultDOMTextRenderer.submit).toBe('function');
    expect(typeof defaultDOMTextRenderer.createData).toBe('function');
  });
});

describe('drawDOMText', () => {
  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createText();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawDOMText(state, renderProxy)).not.toThrow();
  });

  it('produces no element when text is empty', () => {
    const state = makeState();
    const node = createText();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDOMText(state, renderProxy));

    expect(el).toBeNull();
  });

  it('produces a div when text is non-empty', () => {
    const state = makeState();
    const node = createText();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDOMText(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('DIV');
  });

  it('sets overflow:hidden on the div', () => {
    const state = makeState();
    const node = createText();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMText(state, renderProxy))!;
    expect(div.style.overflow).toBe('hidden');
  });

  it('includes the text content in innerHTML', () => {
    const state = makeState();
    const node = createText();
    node.data.text = 'world';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMText(state, renderProxy))!;
    expect(div.innerHTML).toContain('world');
  });

  it('reuses the same div across multiple draws', () => {
    const state = makeState();
    const node = createText();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const firstDiv = drawGetEl(state, () => drawDOMText(state, renderProxy));
    const secondDiv = drawGetEl(state, () => drawDOMText(state, renderProxy));

    expect(firstDiv).toBe(secondDiv);
  });
});

describe('drawDOMTextMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const node = createText();
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawDOMTextMask(state, renderProxy)).not.toThrow();
  });
});
