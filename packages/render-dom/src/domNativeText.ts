import { getNativeTextRuntime } from '@flighthq/displayobject';
import { computeRGBHexString } from '@flighthq/materials';
import type {
  DisplayObjectRenderer,
  DOMRenderState,
  NativeText,
  NativeTextRuntime,
  NativeTextStyle,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
} from '@flighthq/types';

import { applyDOMStyle, prepareDOMElement, setDOMRendererElement } from './domStyle';

// DOM is the backend for which a native text element makes sense; other backends either no-op or
// composite this element over their canvas (decide later). Register app-side with
// registerRenderer(state, NativeTextKind, defaultDOMNativeTextRenderer).

// createData returns null: the backing element is held on the runtime (a renderer-owned slot), not on
// per-node RendererData, because the measured size must be visible to displayobject's DOM-free bounds.
function createDOMNativeTextData(_state: RenderState, _source: Renderable): RendererData | null {
  return null;
}

export function drawDOMNativeText(state: DOMRenderState, renderProxy: RenderProxy2D): void {
  const source = renderProxy.source as NativeText;
  // Cast away the read-only view to write the renderer-owned slots (element + measured size), the same
  // mutable-runtime cast domTextLabel uses for its layout cache.
  const runtime = getNativeTextRuntime(source) as NativeTextRuntime;
  const data = source.data;

  let element = runtime.element;
  if (element === null) {
    element = document.createElement('div');
    prepareDOMElement(element);
    runtime.element = element;
  }

  applyNativeTextStyle(element, data.style);
  if (data.autoSize === 'none') {
    element.style.whiteSpace = 'normal';
    element.style.width = `${data.width}px`;
    element.style.height = `${data.height}px`;
    element.style.overflow = 'hidden';
  } else {
    element.style.whiteSpace = 'nowrap';
    element.style.width = '';
    element.style.height = '';
    element.style.overflow = '';
  }
  element.textContent = data.text;

  // Write the platform measurement back so DOM-free bounds (computeNativeTextLocalBoundsRectangle) can
  // read it without the DOM. Under autoSize the field box tracks the element's measured size.
  const rect = element.getBoundingClientRect();
  runtime.measuredWidth = rect.width;
  runtime.measuredHeight = rect.height;

  applyDOMStyle(state, element, renderProxy);
  setDOMRendererElement(state, element);
}

export function drawDOMNativeTextMask(state: DOMRenderState, renderProxy: RenderProxy2D): void {
  drawDOMNativeText(state, renderProxy);
}

export const defaultDOMNativeTextRenderer: DisplayObjectRenderer = {
  createData: createDOMNativeTextData,
  submit: drawDOMNativeText,
};

function applyNativeTextStyle(element: HTMLElement, style: Readonly<NativeTextStyle>): void {
  const size = style.size ?? 12;
  const family = style.font ?? 'sans-serif';
  const weight = style.bold ? 'bold ' : '';
  const slant = style.italic ? 'italic ' : '';
  element.style.font = `${slant}${weight}${size}px ${family}`;
  element.style.color = computeRGBHexString(style.color ?? 0);
  if (style.align !== undefined) element.style.textAlign = style.align;
  if (style.leading !== undefined) element.style.lineHeight = `${size + style.leading}px`;
}
