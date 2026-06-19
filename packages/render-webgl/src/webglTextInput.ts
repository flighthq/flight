import { computeRGBHexString } from '@flighthq/materials';
import {
  getTextInputCaretRectangle,
  getTextInputSelectionBeginIndex,
  getTextInputSelectionEndIndex,
  getTextInputSelectionRectangles,
  getTextInputState,
} from '@flighthq/text-input';
import { getRichTextScrollYOffset } from '@flighthq/text-layout';
import type { RichText, TextLayoutResult, TextSelectionRectangle } from '@flighthq/types';

import { registerWebGLTextInputOverlay } from './webglRichText';

// Rasterizes the editable-field overlay (selection highlight + caret) onto the offscreen field canvas of
// a RichText whose input slot is present. Passed into the WebGL RichText rasterization pass.
export function drawWebGLTextInputOverlay(
  context: CanvasRenderingContext2D,
  source: RichText,
  result: TextLayoutResult,
  fieldW: number,
  fieldH: number,
  _text: string,
): void {
  const input = getTextInputState(source);
  if (input === null || (!input.focused && !input.alwaysShowSelection)) return;

  const firstVisibleLine = source.data.scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? getRichTextScrollYOffset(result.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = source.data.scrollH;

  context.save();
  context.beginPath();
  context.rect(0, 0, fieldW, fieldH);
  context.clip();

  getTextInputSelectionRectangles(selectionRectangles, source, result);
  if (selectionRectangles.length > 0) {
    context.fillStyle = computeRGBHexString(input.selectionColor);
    context.globalAlpha = input.selectionAlpha;
    for (const rect of selectionRectangles) {
      context.fillRect(rect.x - scrollXOffset, rect.y - scrollYOffset, rect.width, rect.height);
    }
  }

  if (input.focused && getTextInputSelectionBeginIndex(source) === getTextInputSelectionEndIndex(source)) {
    getTextInputCaretRectangle(caretRectangle, source, result);
    context.fillStyle = CARET_COLOR;
    context.globalAlpha = 1;
    context.fillRect(
      caretRectangle.x - scrollXOffset,
      caretRectangle.y - scrollYOffset,
      CARET_WIDTH,
      caretRectangle.height,
    );
  }

  context.restore();
}

// Installs the caret/selection overlay onto the WebGL RichText renderer. Importing this opts an app into
// text-input rendering; a static RichText leaves the slot null and pulls none of this module.
export function enableWebGLTextInput(): void {
  registerWebGLTextInputOverlay(drawWebGLTextInputOverlay);
}

const CARET_COLOR = '#000000';
const CARET_WIDTH = 1;
const caretRectangle = { height: 0, lineIndex: 0, width: 0, x: 0, y: 0 };
const selectionRectangles: TextSelectionRectangle[] = [];
