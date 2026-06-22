import { getOrCreateRenderProxy2D, registerRenderer } from '@flighthq/render';
import { createNativeText } from '@flighthq/text';
import { NativeTextKind } from '@flighthq/types';

import { defaultDomNativeTextRenderer, drawDomNativeText, drawDomNativeTextMask } from './domNativeText';
import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';

function makeState() {
  const container = document.createElement('div');
  const state = createDomRenderState(container);
  registerRenderer(state, NativeTextKind, defaultDomNativeTextRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  getDomRenderStateRuntime(state).domCurrentElement = null;
  drawFn();
  return getDomRenderStateRuntime(state).domCurrentElement;
}

describe('defaultDomNativeTextRenderer', () => {
  it('has submit and createData', () => {
    expect(typeof defaultDomNativeTextRenderer.submit).toBe('function');
    expect(typeof defaultDomNativeTextRenderer.createData).toBe('function');
  });
});

describe('drawDomNativeText', () => {
  it('produces a div carrying the text content', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hello' } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDomNativeText(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('DIV');
    expect(el!.textContent).toBe('hello');
  });

  it('reuses the same element across multiple draws', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hello' } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const first = drawGetEl(state, () => drawDomNativeText(state, renderProxy));
    const second = drawGetEl(state, () => drawDomNativeText(state, renderProxy));

    expect(first).toBe(second);
  });

  it('sets a fixed box under autoSize none', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hi', width: 120, height: 40 } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomNativeText(state, renderProxy))!;
    expect(div.style.width).toBe('120px');
    expect(div.style.height).toBe('40px');
    expect(div.style.overflow).toBe('hidden');
  });
});

describe('drawDomNativeTextMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hi' } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawDomNativeTextMask(state, renderProxy)).not.toThrow();
  });
});
