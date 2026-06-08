import { computeTextFormatFontString, createNullRendererData, rgbaToHexString } from '@flighthq/render';
import { getRichTextRuntime } from '@flighthq/scene-display';
import {
  computeRichTextContent,
  computeTextLayout,
  getRichTextContent,
  getRichTextFieldHeight,
  getRichTextFieldWidth,
  getRichTextScrollYOffset,
  getRichTextSelectionRectangles,
  getTextLayoutResult,
} from '@flighthq/text-layout';
import type { InputTextSelectionRectangle } from '@flighthq/types';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  RichText,
  RichTextRuntime,
  TextFormat,
  TextRuntime,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasBlendMode } from './canvasMaterials';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasRichText(state: CanvasRenderState, renderNode: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, renderNode);

  const source = renderNode.source as RichText;
  const data = source.data;
  const context = state.context;
  setCanvasBlendMode(state, renderNode.blendMode);
  context.globalAlpha = renderNode.alpha;
  setCanvasTransform(state, context, renderNode.transform2D);

  const richTextRuntime = getRichTextRuntime(source) as RichTextRuntime;
  const content = getRichTextContent(richTextRuntime);
  computeRichTextContent(content, data);
  const { text } = content;

  const measure = (t: string, fmt: TextFormat): number => {
    context.font = computeTextFormatFontString(fmt);
    return context.measureText(t).width;
  };

  const result = getTextLayoutResult(richTextRuntime as TextRuntime);
  computeTextLayout(result, {
    text,
    formatRanges: content.formatRanges,
    width: data.wordWrap ? data.width : 10000,
    height: data.height,
    measure,
    multiline: data.multiline,
    wordWrap: data.wordWrap,
  });
  const fieldW = getRichTextFieldWidth(data, result);
  const fieldH = getRichTextFieldHeight(data, result);

  if (data.background) {
    context.fillStyle = rgbaToHexString(data.backgroundColor);
    context.fillRect(0, 0, fieldW, fieldH);
  }

  if (data.border) {
    context.strokeStyle = rgbaToHexString(data.borderColor);
    context.lineWidth = 1;
    context.strokeRect(0, 0, fieldW, fieldH);
  }

  if (text.length === 0) return;

  // scrollV is 1-based: first visible line index = scrollV - 1
  const firstVisibleLine = data.scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? getRichTextScrollYOffset(result.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = data.scrollH;

  context.save();
  context.beginPath();
  context.rect(0, 0, fieldW, fieldH);
  context.clip();

  if (source.data.selectable && richTextRuntime.selectionBeginIndex !== richTextRuntime.selectionEndIndex) {
    getRichTextSelectionRectangles(
      _richTextSelectionRectangles,
      richTextRuntime.selectionBeginIndex,
      richTextRuntime.selectionEndIndex,
      result,
    );
    context.fillStyle = SELECTION_COLOR;
    context.globalAlpha = Math.min(1, renderNode.alpha * SELECTION_ALPHA);
    for (const rectangle of _richTextSelectionRectangles) {
      context.fillRect(rectangle.x - scrollXOffset, rectangle.y - scrollYOffset, rectangle.width, rectangle.height);
    }
    context.globalAlpha = renderNode.alpha;
  }

  context.textBaseline = 'alphabetic';
  context.textAlign = 'start';

  const bulletLines = new Set<number>();
  for (const group of result.groups) {
    if (group.lineIndex < firstVisibleLine) continue;

    context.font = computeTextFormatFontString(group.format);
    context.fillStyle = rgbaToHexString(group.format.color ?? data.textColor);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX - scrollXOffset;
    const y = group.offsetY + group.ascent - scrollYOffset;

    if (group.format.bullet && !bulletLines.has(group.lineIndex)) {
      bulletLines.add(group.lineIndex);
      const bulletW = context.measureText(BULLET_CHAR).width;
      context.fillText(BULLET_CHAR, x - bulletW - BULLET_GAP, y);
    }

    context.fillText(slice, x, y);

    const lineColor = rgbaToHexString(group.format.color ?? data.textColor);
    const lineWidth = Math.max(1, (group.format.size ?? 12) / 16);
    if (group.format.underline || group.format.strikethrough) {
      context.strokeStyle = lineColor;
      context.lineWidth = lineWidth;
      if (group.format.underline) {
        context.beginPath();
        context.moveTo(x, y + group.descent);
        context.lineTo(x + group.width, y + group.descent);
        context.stroke();
      }
      if (group.format.strikethrough) {
        context.beginPath();
        context.moveTo(x, y - group.ascent * 0.35);
        context.lineTo(x + group.width, y - group.ascent * 0.35);
        context.stroke();
      }
    }
  }

  context.restore();
}

export function drawCanvasRichTextMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, data);
}

const BULLET_CHAR = 'Ã¢â‚¬Â¢';
const BULLET_GAP = 4;
const SELECTION_ALPHA = 0.35;
const SELECTION_COLOR = '#0078d7';
const _richTextSelectionRectangles: InputTextSelectionRectangle[] = [];

export const defaultCanvasRichTextRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasRichText,
};
