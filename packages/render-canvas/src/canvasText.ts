import { computeTextFormatFontString, createNullRendererData, rgbaToHexString } from '@flighthq/render-core';
import { getTextRuntime } from '@flighthq/scene-display';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/text-layout';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  DisplayObjectRenderTreeNode,
  Text,
  TextFormat,
  TextRuntime,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasBlendMode } from './canvasMaterials';
import { setCanvasTransform } from './canvasTransform';

const LAYOUT_WIDTH = 10000;

export function drawCanvasText(state: CanvasRenderState, renderNode: DisplayObjectRenderTreeNode): void {
  drawCanvasDisplayObject(state, renderNode);

  const source = renderNode.source as Text;
  const { text, textFormat } = source.data;
  if (text.length === 0) return;

  const context = state.context;
  setCanvasBlendMode(state, renderNode.blendMode);
  context.globalAlpha = renderNode.alpha;
  setCanvasTransform(state, context, renderNode.transform2D);

  const measure = (t: string, format: TextFormat): number => {
    context.font = computeTextFormatFontString(format);
    return context.measureText(t).width;
  };

  const result = getTextLayoutResult(getTextRuntime(source) as TextRuntime);
  computeTextLayout(result, {
    text,
    formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
    width: LAYOUT_WIDTH,
    height: LAYOUT_WIDTH,
    measure,
  });

  context.textBaseline = 'alphabetic';
  context.textAlign = 'start';

  for (const group of result.groups) {
    context.font = computeTextFormatFontString(group.format);
    context.fillStyle = rgbaToHexString(group.format.color ?? 0);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX;
    // group.ascent = font-size; CSS places the alphabetic baseline at ~80% of the em-size.
    // Subtract 20% so the canvas baseline aligns with the DOM renderer's natural baseline.
    const y = group.offsetY + group.ascent * 0.815;
    context.fillText(slice, x, y);

    if (group.format.underline) {
      const lineY = y + group.descent;
      context.strokeStyle = rgbaToHexString(group.format.color ?? 0);
      context.lineWidth = Math.max(1, (group.format.size ?? 12) / 16);
      context.beginPath();
      context.moveTo(x, lineY);
      context.lineTo(x + group.width, lineY);
      context.stroke();
    }
  }
}

export function drawCanvasTextMask(state: CanvasRenderState, data: DisplayObjectRenderTreeNode): void {
  drawCanvasDisplayObject(state, data);
}

export const defaultCanvasTextRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasText,
  drawMask: drawCanvasTextMask,
};
