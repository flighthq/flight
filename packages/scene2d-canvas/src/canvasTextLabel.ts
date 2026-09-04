import { computeRgbaCssString } from '@flighthq/color/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { getNodeLocalContentRevision } from '@flighthq/node/contract';
import { computeTextFormatFontString, getTextLabelRuntime } from '@flighthq/text/contract';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/textlayout/contract';
import type {
  CanvasRenderState,
  EntityConstruction,
  RenderProxy2D,
  Renderable,
  RendererData,
  Scene2DRenderer,
  TextFormat,
  TextLabel,
  TextLabelRuntime,
} from '@flighthq/types/contract';

import { drawCanvasScene2D } from './canvasNode2D';
import { setCanvasTransform } from './canvasTransform';

interface CanvasTextLabelData extends RendererData {
  lastContentId: number;
}

function createCanvasTextLabelData(_state: CanvasRenderState, _source: Renderable): RendererData {
  const out = allocateEntity<CanvasTextLabelData>();
  out.lastContentId = -1;
  return finishEntity(out);
}

export function drawCanvasTextLabel(state: CanvasRenderState, renderProxy: RenderProxy2D): void {
  drawCanvasScene2D(state, renderProxy);

  const source = renderProxy.source as TextLabel;
  const { text, textFormat } = source.data;
  if (text.length === 0) return;

  const context = state.context;
  state.applyBlendMode?.(state, renderProxy.blendMode);
  context.globalAlpha = renderProxy.alpha;
  setCanvasTransform(state, context, renderProxy.transform2D);

  const version = getNodeLocalContentRevision(source);
  const textData = renderProxy.rendererData as CanvasTextLabelData | null;
  const needsLayout = textData === null || version !== textData.lastContentId;

  const result = getTextLayoutResult(getTextLabelRuntime(source) as TextLabelRuntime);
  if (needsLayout) {
    const measure = (t: string, format: TextFormat): number => {
      context.font = computeTextFormatFontString(format);
      return context.measureText(t).width;
    };

    computeTextLayout(result, {
      text,
      formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
      width: source.data.width,
      height: source.data.height,
      measure,
      verticalAlign: source.data.autoSize === 'none' ? source.data.verticalAlign : 'top',
    });

    if (textData !== null) textData.lastContentId = version;
  }

  context.textBaseline = 'alphabetic';
  context.textAlign = 'start';

  for (const group of result.groups) {
    context.font = computeTextFormatFontString(group.format);
    context.fillStyle = computeRgbaCssString(group.format.color ?? 0x000000ff);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX;
    const y = group.offsetY + group.ascent * 0.815;
    context.fillText(slice, x, y);

    if (group.format.underline) {
      const lineY = y + group.descent;
      context.strokeStyle = computeRgbaCssString(group.format.color ?? 0x000000ff);
      context.lineWidth = Math.max(1, (group.format.size ?? 12) / 16);
      context.beginPath();
      context.moveTo(x, lineY);
      context.lineTo(x + group.width, lineY);
      context.stroke();
    }
  }
}

export const defaultCanvasTextLabelRenderer: Scene2DRenderer = {
  createData: createCanvasTextLabelData,
  submit: drawCanvasTextLabel,
};
