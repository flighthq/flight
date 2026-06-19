import { getOrCreateRenderProxy2D, registerRenderer } from '@flighthq/render';
import { createNativeText } from '@flighthq/text';
import { NativeTextKind } from '@flighthq/types';

import { defaultDOMNativeTextRenderer, drawDOMNativeText, drawDOMNativeTextMask } from './domNativeText';
import { createDOMRenderState, getDOMRenderStateRuntime } from './domRenderState';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, NativeTextKind, defaultDOMNativeTextRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  getDOMRenderStateRuntime(state).domCurrentElement = null;
  drawFn();
  return getDOMRenderStateRuntime(state).domCurrentElement;
}

describe('defaultDOMNativeTextRenderer', () => {
  it('has submit and createData', () => {
    expect(typeof defaultDOMNativeTextRenderer.submit).toBe('function');
    expect(typeof defaultDOMNativeTextRenderer.createData).toBe('function');
  });
});

describe('drawDOMNativeText', () => {
  it('produces a div carrying the text content', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hello' } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDOMNativeText(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('DIV');
    expect(el!.textContent).toBe('hello');
  });

  it('reuses the same element across multiple draws', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hello' } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const first = drawGetEl(state, () => drawDOMNativeText(state, renderProxy));
    const second = drawGetEl(state, () => drawDOMNativeText(state, renderProxy));

    expect(first).toBe(second);
  });

  it('sets a fixed box under autoSize none', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hi', width: 120, height: 40 } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMNativeText(state, renderProxy))!;
    expect(div.style.width).toBe('120px');
    expect(div.style.height).toBe('40px');
    expect(div.style.overflow).toBe('hidden');
  });
});

describe('drawDOMNativeTextMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hi' } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawDOMNativeTextMask(state, renderProxy)).not.toThrow();
  });
});
