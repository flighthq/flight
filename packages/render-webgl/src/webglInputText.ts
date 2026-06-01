import { createNullRendererData } from '@flighthq/render-core';
import { getInputTextRuntime } from '@flighthq/scenegraph-display';
import {
  getInputTextCaretRectangle,
  getInputTextSelectionBeginIndex,
  getInputTextSelectionEndIndex,
  getInputTextSelectionRectangles,
} from '@flighthq/text-input';
import { getRichTextScrollYOffset } from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  InputText,
  InputTextRuntime,
  InputTextSelectionRectangle,
  RenderState,
  RichText,
  TextLayoutResult,
} from '@flighthq/types';

import { drawWebGLRichTextMask, drawWebGLRichTextWithOverlay } from './webglRichText';

export function drawWebGLInputText(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  drawWebGLRichTextWithOverlay(state, renderNode, drawWebGLInputTextOverlay);
}

export const defaultWebGLInputTextRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLInputText,
  drawMask: drawWebGLRichTextMask,
};

function drawWebGLInputTextOverlay(
  context: CanvasRenderingContext2D,
  source: RichText,
  result: TextLayoutResult,
  fieldW: number,
  fieldH: number,
  _text: string,
): void {
  const input = source as InputText;
  const runtime = getInputTextRuntime(input) as InputTextRuntime;
  if (!runtime.focused) return;

  const firstVisibleLine = input.data.scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? getRichTextScrollYOffset(result.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = input.data.scrollH;

  context.save();
  context.beginPath();
  context.rect(0, 0, fieldW, fieldH);
  context.clip();

  getInputTextSelectionRectangles(selectionRectangles, input, result);
  if (selectionRectangles.length > 0) {
    context.fillStyle = SELECTION_COLOR;
    context.globalAlpha = SELECTION_ALPHA;
    for (const rect of selectionRectangles) {
      context.fillRect(rect.x - scrollXOffset, rect.y - scrollYOffset, rect.width, rect.height);
    }
  }

  if (getInputTextSelectionBeginIndex(input) === getInputTextSelectionEndIndex(input)) {
    getInputTextCaretRectangle(caretRectangle, input, result);
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

const CARET_COLOR = '#000000';
const CARET_WIDTH = 1;
const SELECTION_ALPHA = 0.35;
const SELECTION_COLOR = '#0078d7';
const caretRectangle = { height: 0, lineIndex: 0, width: 0, x: 0, y: 0 };
const selectionRectangles: InputTextSelectionRectangle[] = [];
