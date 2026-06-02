import { createNullRendererData, rgbaToHexString } from '@flighthq/render-core';
import { getInputTextRuntime } from '@flighthq/scene-display';
import {
  getInputTextCaretRectangle,
  getInputTextSelectionBeginIndex,
  getInputTextSelectionEndIndex,
  getInputTextSelectionRectangles,
} from '@flighthq/text-input';
import { getRichTextFieldHeight, getRichTextFieldWidth, getRichTextScrollYOffset } from '@flighthq/text-layout';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  DisplayObjectRenderTreeNode,
  InputText,
  InputTextRuntime,
  InputTextSelectionRectangle,
} from '@flighthq/types';

import { drawCanvasRichText, drawCanvasRichTextMask } from './canvasRichText';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasInputText(state: CanvasRenderState, renderNode: DisplayObjectRenderTreeNode): void {
  drawCanvasRichText(state, renderNode);

  const source = renderNode.source as InputText;
  const runtime = getInputTextRuntime(source) as InputTextRuntime;
  if ((!runtime.focused && !source.data.alwaysShowSelection) || runtime.textLayout === null) return;

  const fieldW = getRichTextFieldWidth(source.data, runtime.textLayout);
  const fieldH = getRichTextFieldHeight(source.data, runtime.textLayout);
  const firstVisibleLine = source.data.scrollV - 1;
  const scrollYOffset =
    firstVisibleLine > 0 ? getRichTextScrollYOffset(runtime.textLayout.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = source.data.scrollH;
  const context = state.context;

  context.save();
  setCanvasTransform(state, context, renderNode.transform2D);
  context.beginPath();
  context.rect(0, 0, fieldW, fieldH);
  context.clip();

  getInputTextSelectionRectangles(selectionRectangles, source, runtime.textLayout);
  if (selectionRectangles.length > 0) {
    context.fillStyle = rgbaToHexString(source.data.selectionColor);
    context.globalAlpha = Math.min(1, renderNode.alpha * source.data.selectionAlpha);
    for (const rect of selectionRectangles) {
      context.fillRect(rect.x - scrollXOffset, rect.y - scrollYOffset, rect.width, rect.height);
    }
  }

  if (runtime.focused && getInputTextSelectionBeginIndex(source) === getInputTextSelectionEndIndex(source)) {
    if (getCaretVisible(source, runtime.focused)) {
      getInputTextCaretRectangle(caretRectangle, source, runtime.textLayout);
      context.fillStyle = CARET_COLOR;
      context.globalAlpha = renderNode.alpha;
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

export const defaultCanvasInputTextRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasInputText,
  drawMask: drawCanvasRichTextMask,
};

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
const selectionRectangles: InputTextSelectionRectangle[] = [];
