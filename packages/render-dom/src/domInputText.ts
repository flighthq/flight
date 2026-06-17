import { getInputTextRuntime } from '@flighthq/displayobject';
import { computeRGBHexString } from '@flighthq/materials';
import {
  getInputTextCaretRectangle,
  getInputTextSelectionBeginIndex,
  getInputTextSelectionEndIndex,
  getInputTextSelectionRectangles,
} from '@flighthq/text-input';
import { getRichTextScrollYOffset } from '@flighthq/text-layout';
import type {
  DisplayObjectMaskRenderer,
  DisplayObjectRenderer,
  DOMRenderState,
  InputText,
  InputTextRuntime,
  InputTextSelectionRectangle,
  RendererData,
  RenderProxy2D,
} from '@flighthq/types';

import { defaultDOMRichTextRenderer, drawDOMRichText, drawDOMRichTextMask } from './domRichText';

let _keyframesInjected = false;

interface DOMInputTextData extends RendererData {
  div: HTMLDivElement | null;
}

export function drawDOMInputText(state: DOMRenderState, renderProxy: RenderProxy2D): void {
  if (!_keyframesInjected) {
    injectCaretBlinkKeyframes();
    _keyframesInjected = true;
  }
  drawDOMRichText(state, renderProxy);

  const source = renderProxy.source as InputText;
  const runtime = getInputTextRuntime(source) as InputTextRuntime;
  const data = renderProxy.rendererData as DOMInputTextData | null;
  if ((!runtime.focused && !source.data.alwaysShowSelection) || runtime.textLayout === null || data?.div == null)
    return;

  const firstVisibleLine = source.data.scrollV - 1;
  const scrollYOffset =
    firstVisibleLine > 0 ? getRichTextScrollYOffset(runtime.textLayout.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = source.data.scrollH;
  const selColor = computeRGBHexString(source.data.selectionColor);
  const selAlpha = source.data.selectionAlpha;
  let html = '';

  getInputTextSelectionRectangles(selectionRectangles, source, runtime.textLayout);
  for (const rect of selectionRectangles) {
    html += `<div data-input-overlay style="position:absolute;left:${rect.x - scrollXOffset}px;top:${rect.y - scrollYOffset}px;width:${rect.width}px;height:${rect.height}px;background:${selColor};opacity:${selAlpha};pointer-events:none;"></div>`;
  }

  if (runtime.focused && getInputTextSelectionBeginIndex(source) === getInputTextSelectionEndIndex(source)) {
    getInputTextCaretRectangle(caretRectangle, source, runtime.textLayout);
    html += `<div data-input-overlay style="position:absolute;left:${caretRectangle.x - scrollXOffset}px;top:${caretRectangle.y - scrollYOffset}px;width:${CARET_WIDTH}px;height:${caretRectangle.height}px;background:${CARET_COLOR};animation:flight-caret-blink 1s step-end infinite;pointer-events:none;"></div>`;
  }

  for (const el of data.div.querySelectorAll('[data-input-overlay]')) el.remove();
  if (html.length > 0) {
    data.div.insertAdjacentHTML('beforeend', html);
  }
}

export const defaultDOMInputTextRenderer: DisplayObjectRenderer = {
  createData: defaultDOMRichTextRenderer.createData,
  submit: drawDOMInputText,
};

function drawDOMInputTextMask(state: DOMRenderState, renderProxy: RenderProxy2D): void {
  drawDOMRichTextMask(state, renderProxy);
}

export const defaultDOMInputTextMaskRenderer: DisplayObjectMaskRenderer = {
  drawMask: drawDOMInputTextMask,
};

function injectCaretBlinkKeyframes(): void {
  if (typeof document === 'undefined') return;
  const id = 'flight-caret-blink-style';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = '@keyframes flight-caret-blink{0%,100%{opacity:1}50%{opacity:0}}';
  document.head.appendChild(style);
}

const CARET_COLOR = '#000000';
const CARET_WIDTH = 1;
const caretRectangle = { height: 0, lineIndex: 0, width: 0, x: 0, y: 0 };
const selectionRectangles: InputTextSelectionRectangle[] = [];
