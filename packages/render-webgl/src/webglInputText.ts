import { getInputTextRuntime } from '@flighthq/displayobject';
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
  InputText,
  InputTextRuntime,
  InputTextSelectionRectangle,
  RenderProxy2D,
  RenderState,
  RichText,
  TextLayoutResult,
} from '@flighthq/types';

import {
  createWebGLRichTextData,
  destroyWebGLRichTextData,
  drawWebGLRichTextMask,
  drawWebGLRichTextWithOverlay,
} from './webglRichText';

export function drawWebGLInputText(state: RenderState, renderProxy: RenderProxy2D): void {
  drawWebGLRichTextWithOverlay(state, renderProxy, drawWebGLInputTextOverlay);
}

export const defaultWebGLInputTextRenderer: DisplayObjectRenderer = {
  createData: createWebGLRichTextData,
  destroyData: destroyWebGLRichTextData,
  submit: drawWebGLInputText,
};

function drawWebGLInputTextMask(state: RenderState, renderProxy: RenderProxy2D): void {
  drawWebGLRichTextMask(state, renderProxy);
}

export const defaultWebGLInputTextMaskRenderer: DisplayObjectMaskRenderer = {
  drawMask: drawWebGLInputTextMask,
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
