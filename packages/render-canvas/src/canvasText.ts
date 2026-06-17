import { getTextRuntime } from '@flighthq/displayobject';
import { computeRGBHexString } from '@flighthq/materials';
import { computeTextFormatFontString, noopRendererData } from '@flighthq/render';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/text-layout';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  RenderNode2D,
  Text,
  TextFormat,
  TextRuntime,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasText(state: CanvasRenderState, renderNode: RenderNode2D): void {
  drawCanvasDisplayObject(state, renderNode);

  const source = renderNode.source as Text;
  const { text, textFormat } = source.data;
  if (text.length === 0) return;

  const context = state.context;
  state.applyBlendMode?.(state, renderNode.blendMode);
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
    width: source.data.width,
    height: source.data.height,
    measure,
  });

  context.textBaseline = 'alphabetic';
  context.textAlign = 'start';

  for (const group of result.groups) {
    context.font = computeTextFormatFontString(group.format);
    context.fillStyle = computeRGBHexString(group.format.color ?? 0);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX;
    // group.ascent = font-size; CSS places the alphabetic baseline at ~80% of the em-size.
    // Subtract 20% so the canvas baseline aligns with the DOM renderer's natural baseline.
    const y = group.offsetY + group.ascent * 0.815;
    context.fillText(slice, x, y);

    if (group.format.underline) {
      const lineY = y + group.descent;
      context.strokeStyle = computeRGBHexString(group.format.color ?? 0);
      context.lineWidth = Math.max(1, (group.format.size ?? 12) / 16);
      context.beginPath();
      context.moveTo(x, lineY);
      context.lineTo(x + group.width, lineY);
      context.stroke();
    }
  }
}

export function drawCanvasTextMask(state: CanvasRenderState, data: RenderNode2D): void {
  drawCanvasDisplayObject(state, data);
}

export const defaultCanvasTextRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawCanvasText,
};
