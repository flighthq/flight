import { getTextRuntime } from '@flighthq/displayobject';
import { createEntity } from '@flighthq/entity';
import { computeRGBHexString } from '@flighthq/materials';
import { computeTextFormatFontString } from '@flighthq/render';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  DOMRenderState,
  Renderable,
  RendererData,
  RenderState,
  Text,
  TextFormat,
  TextRuntime,
} from '@flighthq/types';

import { applyDOMStyle, prepareDOMElement, setDOMRendererElement } from './domStyle';
import { escapeHTMLString } from './domTextHelpers';

interface DOMTextData extends RendererData {
  div: HTMLDivElement | null;
}

function createDOMTextData(_state: RenderState, _source: Renderable): DOMTextData {
  return createEntity({ div: null });
}

let _measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx === null) {
    _measureCtx = document.createElement('canvas').getContext('2d');
  }
  return _measureCtx;
}

export function drawDOMText(state: DOMRenderState, renderNode: DisplayObjectRenderNode): void {
  const data = renderNode.rendererData as DOMTextData | null;
  if (data === null) return;

  const source = renderNode.source as Text;
  const { text, textFormat } = source.data;
  if (text.length === 0) return;

  const ctx = getMeasureCtx();
  if (ctx === null) return;

  if (data.div === null) {
    data.div = document.createElement('div');
    prepareDOMElement(data.div);
    data.div.style.overflow = 'hidden';
  }

  const measure = (t: string, format: TextFormat): number => {
    ctx.font = computeTextFormatFontString(format);
    return ctx.measureText(t).width;
  };

  const result = getTextLayoutResult(getTextRuntime(source) as TextRuntime);
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
    const slice = escapeHTMLString(text.substring(group.startIndex, group.endIndex));
    const x = group.offsetX;
    const y = group.offsetY;

    let style = `position:absolute;left:${x}px;top:${y}px;font:${computeTextFormatFontString(fmt)};`;
    style += `color:${computeRGBHexString(fmt.color ?? 0)};white-space:nowrap;`;
    if (fmt.underline) style += 'text-decoration:underline;';

    html += `<div style="${style}">${slice}</div>`;
  }

  data.div.innerHTML = html;

  applyDOMStyle(state, data.div, renderNode);
  setDOMRendererElement(state, data.div);
}

export function drawDOMTextMask(state: DOMRenderState, renderNode: DisplayObjectRenderNode): void {
  drawDOMText(state, renderNode);
}

export const defaultDOMTextRenderer: DisplayObjectRenderer = {
  createData: createDOMTextData,
  submit: drawDOMText,
};
