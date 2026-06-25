import { createEntity } from '@flighthq/entity';
import { computeRgbHexString } from '@flighthq/materials';
import { computeTextFormatFontString } from '@flighthq/render';
import { getTextLabelRuntime } from '@flighthq/text';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/textlayout';
import type {
  DisplayObjectRenderer,
  DomRenderState,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  TextFormat,
  TextLabel,
  TextLabelRuntime,
} from '@flighthq/types';

import { applyDomStyle, prepareDomElement, setDomRendererElement } from './domStyle';
import { escapeDomHtmlString } from './domTextHelpers';

interface DomTextData extends RendererData {
  div: HTMLDivElement | null;
}

function createDomTextData(_state: RenderState, _source: Renderable): DomTextData {
  return createEntity({ div: null });
}

let _measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx === null) {
    _measureCtx = document.createElement('canvas').getContext('2d');
  }
  return _measureCtx;
}

export function drawDomTextLabel(state: DomRenderState, renderProxy: RenderProxy2D): void {
  const data = renderProxy.rendererData as DomTextData | null;
  if (data === null) return;

  const source = renderProxy.source as TextLabel;
  const { text, textFormat } = source.data;
  if (text.length === 0) return;

  const ctx = getMeasureCtx();
  if (ctx === null) return;

  if (data.div === null) {
    data.div = document.createElement('div');
    prepareDomElement(data.div);
    data.div.style.overflow = 'hidden';
  }

  const measure = (t: string, format: TextFormat): number => {
    ctx.font = computeTextFormatFontString(format);
    return ctx.measureText(t).width;
  };

  const result = getTextLayoutResult(getTextLabelRuntime(source) as TextLabelRuntime);
  computeTextLayout(result, {
    text,
    formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
    width: source.data.width,
    height: source.data.height,
    measure,
  });

  let divWidth = 0;
  for (const group of result.groups) {
    const right = group.offsetX + group.width;
    if (right > divWidth) divWidth = right;
  }
  data.div.style.width = `${divWidth}px`;
  data.div.style.height = `${result.textHeight}px`;

  let html = '';
  for (const group of result.groups) {
    const fmt = group.format;
    const slice = escapeDomHtmlString(text.substring(group.startIndex, group.endIndex));
    const x = group.offsetX;
    const y = group.offsetY;

    let style = `position:absolute;left:${x}px;top:${y}px;font:${computeTextFormatFontString(fmt)};`;
    style += `color:${computeRgbHexString(fmt.color ?? 0)};white-space:nowrap;`;
    if (fmt.underline) style += 'text-decoration:underline;';

    html += `<div style="${style}">${slice}</div>`;
  }

  data.div.innerHTML = html;

  applyDomStyle(state, data.div, renderProxy);
  setDomRendererElement(state, data.div);
}

export const defaultDomTextLabelRenderer: DisplayObjectRenderer = {
  createData: createDomTextData,
  submit: drawDomTextLabel,
};
