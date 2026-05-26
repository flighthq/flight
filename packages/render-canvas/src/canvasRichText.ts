import { createNullRendererData } from '@flighthq/render-core';
import { createTextFormatRange, createTextLayoutResult, layoutText, mergeTextFormat } from '@flighthq/text-layout';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  RichText,
  TextFormat,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasBlendMode } from './canvasMaterials';
import { colorToHex, formatToCanvasFont } from './canvasTextHelpers';
import { setCanvasTransform } from './canvasTransform';

const _richTextLayout = createTextLayoutResult();

export function drawCanvasRichText(state: CanvasRenderState, renderNode: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, renderNode);

  const source = renderNode.source as RichText;
  const data = source.data;
  const { text } = data;

  const context = state.context;
  setCanvasBlendMode(state, renderNode.blendMode);
  context.globalAlpha = renderNode.alpha;
  setCanvasTransform(state, context, renderNode.transform2D);

  const fieldW = data.width;
  const fieldH = data.height;

  if (data.background) {
    context.fillStyle = colorToHex(data.backgroundColor);
    context.fillRect(0, 0, fieldW, fieldH);
  }

  if (data.border) {
    context.strokeStyle = colorToHex(data.borderColor);
    context.lineWidth = 1;
    context.strokeRect(0, 0, fieldW, fieldH);
  }

  if (text.length === 0) return;

  const format: TextFormat = mergeTextFormat(data.defaultTextFormat, data.textFormat);
  if (format.color === undefined) format.color = data.textColor;

  const measure = (t: string, fmt: TextFormat): number => {
    context.font = formatToCanvasFont(fmt);
    return context.measureText(t).width;
  };

  layoutText(_richTextLayout, {
    text,
    formatRanges: [createTextFormatRange(format, 0, text.length)],
    width: data.wordWrap ? fieldW : 10000,
    height: fieldH,
    measure,
    multiline: data.multiline,
    wordWrap: data.wordWrap,
  });
  const result = _richTextLayout;

  // scrollV is 1-based: first visible line index = scrollV - 1
  const firstVisibleLine = data.scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? computeScrollYOffset(result.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = data.scrollH;

  context.save();
  context.beginPath();
  context.rect(0, 0, fieldW, fieldH);
  context.clip();

  context.textBaseline = 'alphabetic';
  context.textAlign = 'start';

  for (const group of result.groups) {
    if (group.lineIndex < firstVisibleLine) continue;

    context.font = formatToCanvasFont(group.format);
    context.fillStyle = colorToHex(group.format.color ?? data.textColor);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX - scrollXOffset;
    const y = group.offsetY + group.ascent - scrollYOffset;
    context.fillText(slice, x, y);

    if (group.format.underline) {
      const lineY = y + group.descent;
      context.strokeStyle = colorToHex(group.format.color ?? data.textColor);
      context.lineWidth = Math.max(1, (group.format.size ?? 12) / 16);
      context.beginPath();
      context.moveTo(x, lineY);
      context.lineTo(x + group.width, lineY);
      context.stroke();
    }
  }

  context.restore();
}

function computeScrollYOffset(lineHeights: readonly number[], firstVisibleLine: number): number {
  let offset = 0;
  const limit = Math.min(firstVisibleLine, lineHeights.length);
  for (let i = 0; i < limit; i++) offset += lineHeights[i];
  return offset;
}

export function drawCanvasRichTextMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, data);
}

export const defaultCanvasRichTextRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasRichText,
  drawMask: drawCanvasRichTextMask,
};
