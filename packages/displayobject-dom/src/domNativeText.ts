import { computeRgbHexString } from '@flighthq/color';
import { getNativeTextRuntime } from '@flighthq/text';
import type {
  DisplayObjectRenderer,
  DomRenderState,
  NativeText,
  NativeTextRuntime,
  NativeTextStyle,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  TextVerticalAlign,
} from '@flighthq/types';

import { applyDomStyle, prepareDomElement, setDomRendererElement } from './domStyle';

// DOM is the backend for which a native text element makes sense; other backends either no-op or
// composite this element over their canvas (decide later). Register app-side with
// registerRenderer(state, NativeTextKind, defaultDomNativeTextRenderer).

// createData returns null: the backing element is held on the runtime (a renderer-owned slot), not on
// per-node RendererData, because the measured size must be visible to displayobject's DOM-free bounds.
function createDomNativeTextData(_state: RenderState, _source: Renderable): RendererData | null {
  return null;
}

export function drawDomNativeText(state: DomRenderState, renderProxy: RenderProxy2D): void {
  const source = renderProxy.source as NativeText;
  // Cast away the read-only view to write the renderer-owned slots (element + measured size), the same
  // mutable-runtime cast domTextLabel uses for its layout cache.
  const runtime = getNativeTextRuntime(source) as NativeTextRuntime;
  const data = source.data;

  let element = runtime.element;
  if (element === null) {
    element = document.createElement('div');
    prepareDomElement(element);
    runtime.element = element;
  }

  applyNativeTextStyle(element, data.style);
  if (data.autoSize === 'none') {
    // A fixed-height box frames the text; a column flexbox positions the block vertically within the
    // leftover height (justify-content), leaving textAlign to handle the horizontal axis. Cross-axis
    // stretch is the flexbox default, so the text item keeps the full width and textAlign still applies.
    element.style.whiteSpace = 'normal';
    element.style.width = `${data.width}px`;
    element.style.height = `${data.height}px`;
    element.style.overflow = 'hidden';
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.justifyContent = _verticalAlignToJustifyContent(data.verticalAlign);
  } else {
    // The box hugs the content, so there is no slack to align within — drop the flexbox framing.
    element.style.whiteSpace = 'nowrap';
    element.style.width = '';
    element.style.height = '';
    element.style.overflow = '';
    element.style.display = '';
    element.style.flexDirection = '';
    element.style.justifyContent = '';
  }
  element.textContent = data.text;

  // Write the platform measurement back so DOM-free bounds (computeNativeTextLocalBoundsRectangle) can
  // read it without the DOM. Under autoSize the field box tracks the element's measured size.
  const rect = element.getBoundingClientRect();
  runtime.measuredWidth = rect.width;
  runtime.measuredHeight = rect.height;

  applyDomStyle(state, element, renderProxy);
  setDomRendererElement(state, element);
}

export function drawDomNativeTextMask(state: DomRenderState, renderProxy: RenderProxy2D): void {
  drawDomNativeText(state, renderProxy);
}

export const defaultDomNativeTextRenderer: DisplayObjectRenderer = {
  createData: createDomNativeTextData,
  submit: drawDomNativeText,
};

// Maps the field's vertical alignment onto the column flexbox's main-axis distribution. 'top' is the
// CSS default (flex-start); 'baseline'/'justify' are reserved TextVerticalAlign values with no faithful
// CSS block-frame mapping yet, so they fall back to the top of the box.
function _verticalAlignToJustifyContent(verticalAlign: TextVerticalAlign): string {
  switch (verticalAlign) {
    case 'bottom':
      return 'flex-end';
    case 'middle':
      return 'center';
    default:
      return 'flex-start';
  }
}

function applyNativeTextStyle(element: HTMLElement, style: Readonly<NativeTextStyle>): void {
  const size = style.size ?? 12;
  const family = style.font ?? 'sans-serif';
  const weight = style.bold ? 'bold ' : '';
  const slant = style.italic ? 'italic ' : '';
  element.style.font = `${slant}${weight}${size}px ${family}`;
  element.style.color = computeRgbHexString(style.color ?? 0);
  if (style.align !== undefined) element.style.textAlign = style.align;
  if (style.leading !== undefined) element.style.lineHeight = `${size + style.leading}px`;
}
