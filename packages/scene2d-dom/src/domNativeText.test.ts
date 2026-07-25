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

  it('positions the block vertically via the flexbox on a fixed box', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hi', verticalAlign: 'middle' } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomNativeText(state, renderProxy))!;
    expect(div.style.display).toBe('flex');
    expect(div.style.flexDirection).toBe('column');
    expect(div.style.justifyContent).toBe('center');
  });

  it('maps top and bottom to the box ends', () => {
    const state = makeState();
    const top = createNativeText({ data: { text: 'hi', verticalAlign: 'top' } });
    const bottom = createNativeText({ data: { text: 'hi', verticalAlign: 'bottom' } });
    const topDiv = drawGetEl(state, () => drawDomNativeText(state, getOrCreateRenderProxy2D(state, top)))!;
    const bottomDiv = drawGetEl(state, () => drawDomNativeText(state, getOrCreateRenderProxy2D(state, bottom)))!;
    expect(topDiv.style.justifyContent).toBe('flex-start');
    expect(bottomDiv.style.justifyContent).toBe('flex-end');
  });

  it('drops the flexbox framing under autoSize (no slack to align within)', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hi', autoSize: 'left', verticalAlign: 'middle' } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomNativeText(state, renderProxy))!;
    expect(div.style.display).toBe('');
    expect(div.style.justifyContent).toBe('');
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
