import { computeRGBHexString } from '@flighthq/materials';
import { getRichTextRuntime } from '@flighthq/text';
import {
  getTextInputCaretRectangle,
  getTextInputSelectionBeginIndex,
  getTextInputSelectionEndIndex,
  getTextInputSelectionRectangles,
  getTextInputState,
} from '@flighthq/text-input';
import { getRichTextScrollYOffset } from '@flighthq/text-layout';
import type { DOMRenderState, RendererData, RenderProxy2D, RichText, TextSelectionRectangle } from '@flighthq/types';

import { registerDOMTextInputOverlay } from './domRichText';

let _keyframesInjected = false;

interface DOMTextInputData extends RendererData {
  div: HTMLDivElement | null;
}

// Appends the editable-field overlay (selection highlight + blinking caret) into the field div of a
// RichText whose input slot is present. Invoked by the DOM RichText renderer after the field.
export function drawDOMTextInputOverlay(_state: DOMRenderState, renderProxy: RenderProxy2D): void {
  if (!_keyframesInjected) {
    injectCaretBlinkKeyframes();
    _keyframesInjected = true;
  }
  const source = renderProxy.source as RichText;
  const input = getTextInputState(source);
  if (input === null) return;
  const layout = getRichTextRuntime(source).textLayout;
  const data = renderProxy.rendererData as DOMTextInputData | null;
  if ((!input.focused && !input.alwaysShowSelection) || layout === null || data?.div == null) return;

  const firstVisibleLine = source.data.scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? getRichTextScrollYOffset(layout.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = source.data.scrollH;
  const selColor = computeRGBHexString(input.selectionColor);
  const selAlpha = input.selectionAlpha;
  let html = '';

  getTextInputSelectionRectangles(selectionRectangles, source, layout);
  for (const rect of selectionRectangles) {
    html += `<div data-input-overlay style="position:absolute;left:${rect.x - scrollXOffset}px;top:${rect.y - scrollYOffset}px;width:${rect.width}px;height:${rect.height}px;background:${selColor};opacity:${selAlpha};pointer-events:none;"></div>`;
  }

  if (input.focused && getTextInputSelectionBeginIndex(source) === getTextInputSelectionEndIndex(source)) {
    getTextInputCaretRectangle(caretRectangle, source, layout);
    html += `<div data-input-overlay style="position:absolute;left:${caretRectangle.x - scrollXOffset}px;top:${caretRectangle.y - scrollYOffset}px;width:${CARET_WIDTH}px;height:${caretRectangle.height}px;background:${CARET_COLOR};animation:flight-caret-blink 1s step-end infinite;pointer-events:none;"></div>`;
  }

  for (const el of data.div.querySelectorAll('[data-input-overlay]')) el.remove();
  if (html.length > 0) {
    data.div.insertAdjacentHTML('beforeend', html);
  }
}

// Installs the caret/selection overlay onto the DOM RichText renderer. Importing this opts an app into
// text-input rendering; a static RichText leaves the slot null and pulls none of this module.
export function enableDOMTextInput(): void {
  registerDOMTextInputOverlay(drawDOMTextInputOverlay);
}

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
const selectionRectangles: TextSelectionRectangle[] = [];
