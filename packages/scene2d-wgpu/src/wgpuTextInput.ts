import { computeRgbHexString } from '@flighthq/color';
import {
  getTextInputCaretRectangle,
  getTextInputSelectionBeginIndex,
  getTextInputSelectionEndIndex,
  getTextInputSelectionRectangles,
  getTextInputState,
} from '@flighthq/textinput';
import { getRichTextScrollYOffset } from '@flighthq/textlayout';
import type { RichText, TextLayoutResult, TextSelectionRectangle } from '@flighthq/types';

import { registerWgpuTextInputOverlay } from './wgpuRichText';

// Renderer-agnostic caret/selection overlay drawn onto the rich text offscreen canvas of a RichText whose
// input slot is present. Identical to the Gl TextInput overlay — both backends rasterize the field to
// a 2D canvas before uploading, so the chrome is plain Canvas2D drawing with no backend-specific calls.
export function drawWgpuTextInputOverlay(
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
    context.fillStyle = computeRgbHexString(input.selectionColor);
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

// Installs the caret/selection overlay onto the Wgpu RichText renderer. Importing this opts an app into
// text-input rendering; a static RichText leaves the slot null and pulls none of this module.
export function enableWgpuTextInput(): void {
  registerWgpuTextInputOverlay(drawWgpuTextInputOverlay);
}

const CARET_COLOR = '#000000';
const CARET_WIDTH = 1;
const caretRectangle = { height: 0, lineIndex: 0, width: 0, x: 0, y: 0 };
const selectionRectangles: TextSelectionRectangle[] = [];
