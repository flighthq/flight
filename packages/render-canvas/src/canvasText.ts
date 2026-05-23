import { createNullRendererData } from '@flighthq/render-core';
import { createTextFormatRange, layoutText } from '@flighthq/text-layout';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  Text,
  TextFormat,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasBlendMode } from './canvasMaterials';
import { setCanvasTransform } from './canvasTransform';

const LAYOUT_WIDTH = 10000;

function formatToCanvasFont(format: TextFormat): string {
  const style = format.italic ? 'italic' : 'normal';
  const weight = format.bold ? 'bold' : 'normal';
  const size = format.size ?? 12;
  const family = format.font ?? 'serif';
  return `${style} ${weight} ${size}px ${family}`;
}

function colorToHex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function drawCanvasText(state: CanvasRenderState, renderNode: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, renderNode);

  const source = renderNode.source as Text;
  const { text, textFormat } = source.data;
  if (text.length === 0) return;

  const context = state.context;
  setCanvasBlendMode(state, renderNode.blendMode);
  context.globalAlpha = renderNode.alpha;
  setCanvasTransform(state, context, renderNode.transform2D);

  const measure = (t: string, format: TextFormat): number => {
    context.font = formatToCanvasFont(format);
    return context.measureText(t).width;
  };

  const result = layoutText({
    text,
    formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
    width: LAYOUT_WIDTH,
    height: LAYOUT_WIDTH,
    measure,
  });

  context.textBaseline = 'alphabetic';
  context.textAlign = 'start';

  for (const group of result.groups) {
    context.font = formatToCanvasFont(group.format);
    context.fillStyle = colorToHex(group.format.color ?? 0);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX;
    const y = group.offsetY + group.ascent;
    context.fillText(slice, x, y);

    if (group.format.underline) {
      const lineY = y + group.descent;
      context.strokeStyle = colorToHex(group.format.color ?? 0);
      context.lineWidth = Math.max(1, (group.format.size ?? 12) / 16);
      context.beginPath();
      context.moveTo(x, lineY);
      context.lineTo(x + group.width, lineY);
      context.stroke();
    }
  }
}

export function drawCanvasTextMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, data);
}

export const defaultCanvasTextRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasText,
  drawMask: drawCanvasTextMask,
};
