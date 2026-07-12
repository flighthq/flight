import { computeRgbHexString } from '@flighthq/materials';
import { noopRendererData } from '@flighthq/render';
import { computeTextFormatFontString, getTextLabelRuntime } from '@flighthq/text';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/textlayout';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  RenderProxy2D,
  TextFormat,
  TextLabel,
  TextLabelRuntime,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasTextLabel(state: CanvasRenderState, renderProxy: RenderProxy2D): void {
  drawCanvasDisplayObject(state, renderProxy);

  const source = renderProxy.source as TextLabel;
  const { text, textFormat } = source.data;
  if (text.length === 0) return;

  const context = state.context;
  state.applyBlendMode?.(state, renderProxy.blendMode);
  context.globalAlpha = renderProxy.alpha;
  setCanvasTransform(state, context, renderProxy.transform2D);

  const measure = (t: string, format: TextFormat): number => {
    context.font = computeTextFormatFontString(format);
    return context.measureText(t).width;
  };

  const result = getTextLayoutResult(getTextLabelRuntime(source) as TextLabelRuntime);
  computeTextLayout(result, {
    text,
    formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
    width: source.data.width,
    height: source.data.height,
    measure,
    verticalAlign: source.data.autoSize === 'none' ? source.data.verticalAlign : 'top',
  });

  context.textBaseline = 'alphabetic';
  context.textAlign = 'start';

  for (const group of result.groups) {
    context.font = computeTextFormatFontString(group.format);
    context.fillStyle = computeRgbHexString(group.format.color ?? 0);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX;
    // group.ascent = font-size; CSS places the alphabetic baseline at ~80% of the em-size.
    // Subtract 20% so the canvas baseline aligns with the DOM renderer's natural baseline.
    const y = group.offsetY + group.ascent * 0.815;
    context.fillText(slice, x, y);

    if (group.format.underline) {
      const lineY = y + group.descent;
      context.strokeStyle = computeRgbHexString(group.format.color ?? 0);
      context.lineWidth = Math.max(1, (group.format.size ?? 12) / 16);
      context.beginPath();
      context.moveTo(x, lineY);
      context.lineTo(x + group.width, lineY);
      context.stroke();
    }
  }
}

export const defaultCanvasTextLabelRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawCanvasTextLabel,
};
