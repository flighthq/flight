import { computeRgbHexString } from '@flighthq/materials';
import { getRichTextRuntime } from '@flighthq/text';
import {
  getTextInputCaretRectangle,
  getTextInputSelectionBeginIndex,
  getTextInputSelectionEndIndex,
  getTextInputSelectionRectangles,
  getTextInputState,
} from '@flighthq/text-input';
import { computeTextBoundsHeight, computeTextBoundsWidth, getRichTextScrollYOffset } from '@flighthq/text-layout';
import type { CanvasRenderState, RenderProxy2D, RichText, TextSelectionRectangle } from '@flighthq/types';

import { registerCanvasTextInputOverlay } from './canvasRichText';
import { setCanvasTransform } from './canvasTransform';

// Draws the editable-field overlay (selection highlight + blinking caret) over a RichText whose input
// slot is present. Invoked by the Canvas RichText renderer after the field, keyed off the input slot.
export function drawCanvasTextInputOverlay(state: CanvasRenderState, renderProxy: RenderProxy2D): void {
  const source = renderProxy.source as RichText;
  const input = getTextInputState(source);
  if (input === null) return;
  const layout = getRichTextRuntime(source).textLayout;
  if ((!input.focused && !input.alwaysShowSelection) || layout === null) return;

  const fieldW = computeTextBoundsWidth(source.data, layout);
  const fieldH = computeTextBoundsHeight(source.data, layout);
  const firstVisibleLine = source.data.scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? getRichTextScrollYOffset(layout.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = source.data.scrollH;
  const context = state.context;

  context.save();
  setCanvasTransform(state, context, renderProxy.transform2D);
  context.beginPath();
  context.rect(0, 0, fieldW, fieldH);
  context.clip();

  getTextInputSelectionRectangles(selectionRectangles, source, layout);
  if (selectionRectangles.length > 0) {
    context.fillStyle = computeRgbHexString(input.selectionColor);
    context.globalAlpha = Math.min(1, renderProxy.alpha * input.selectionAlpha);
    for (const rect of selectionRectangles) {
      context.fillRect(rect.x - scrollXOffset, rect.y - scrollYOffset, rect.width, rect.height);
    }
  }

  if (input.focused && getTextInputSelectionBeginIndex(source) === getTextInputSelectionEndIndex(source)) {
    if (getCaretVisible(source, input.focused)) {
      getTextInputCaretRectangle(caretRectangle, source, layout);
      context.fillStyle = CARET_COLOR;
      context.globalAlpha = renderProxy.alpha;
      context.fillRect(
        caretRectangle.x - scrollXOffset,
        caretRectangle.y - scrollYOffset,
        CARET_WIDTH,
        caretRectangle.height,
      );
    }
  }

  context.restore();
}

// Installs the caret/selection overlay onto the Canvas RichText renderer. Importing this is what opts an
// app into text-input rendering; a RichText that never enables input draws nothing extra and the
// renderer stays free of this module's text-input dependency.
export function enableCanvasTextInput(): void {
  registerCanvasTextInputOverlay(drawCanvasTextInputOverlay);
}

const CARET_BLINK_MS = 530;
const CARET_COLOR = '#000000';
const _blinkStart = new WeakMap<object, number>();
const _prevFocused = new WeakMap<object, boolean>();

function getCaretVisible(source: object, focused: boolean): boolean {
  const wasFocused = _prevFocused.get(source) ?? false;
  if (!wasFocused && focused) _blinkStart.set(source, performance.now());
  _prevFocused.set(source, focused);
  const elapsed = performance.now() - (_blinkStart.get(source) ?? performance.now());
  return elapsed % (CARET_BLINK_MS * 2) < CARET_BLINK_MS;
}
const CARET_WIDTH = 1;
const caretRectangle = { height: 0, lineIndex: 0, width: 0, x: 0, y: 0 };
const selectionRectangles: TextSelectionRectangle[] = [];
