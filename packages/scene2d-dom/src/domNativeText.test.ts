import { getOrCreateRenderProxy2D, registerRenderer } from '@flighthq/render/contract';
import { createNativeText, getNativeTextRuntime } from '@flighthq/text/contract';
import { NativeTextKind } from '@flighthq/types/contract';

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

  it('publishes the dimensions laid out by the DOM element', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'measured', width: 137, height: 41 } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    const measure = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement): DOMRect {
        const width = Number.parseFloat(this.style.width) || 0;
        const height = Number.parseFloat(this.style.height) || 0;
        return new DOMRect(0, 0, width, height);
      });

    try {
      drawDomNativeText(state, renderProxy);

      const runtime = getNativeTextRuntime(node);
      expect(runtime.measuredWidth).toBe(node.data.width);
      expect(runtime.measuredHeight).toBe(node.data.height);
    } finally {
      measure.mockRestore();
    }
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

  // The channel order is the whole assertion. Under the 24-bit reading this file used to carry, the
  // packed value below keeps its low three bytes and comes out `#44ffee` — a plausible-looking cyan that
  // is wrong in every channel. The named case is the one that failed in the field: a cyan authored as
  // `0x44ffee` under an RGBA field means r=0x00, and nothing draws where the scene expects ink.
  it('converts the packed RGBA style color channel-correctly, alpha included', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hi', style: { color: 0x44ffee80 } } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    // The expected strings are what the CSS engine serializes back, not what the renderer wrote: alpha
    // is rounded and a fully opaque color drops to `rgb()`. The channel triple is the load-bearing part.
    const div = drawGetEl(state, () => drawDomNativeText(state, renderProxy))!;
    expect(div.style.color).toBe('rgba(68, 255, 238, 0.502)');
  });

  it('defaults an unset style color to opaque black rather than transparent', () => {
    const state = makeState();
    const node = createNativeText({ data: { text: 'hi' } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomNativeText(state, renderProxy))!;
    // A bare 0 default would be alpha 0 under RGBA — `rgba(0, 0, 0, 0)`, a field that renders nothing.
    // Opaque black serializes back without the alpha component.
    expect(div.style.color).toBe('rgb(0, 0, 0)');
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
