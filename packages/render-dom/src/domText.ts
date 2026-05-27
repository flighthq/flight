import { createEntity } from '@flighthq/foundation';
import { createTextFormatRange, createTextLayoutResult, layoutText } from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  DOMRenderState,
  Renderable,
  RendererData,
  RenderState,
  Text,
  TextFormat,
} from '@flighthq/types';

import { applyDOMStyle, initDOMElement } from './domStyle';
import { colorToCSS, formatToFont, htmlEscape } from './domTextHelpers';

interface DOMTextData extends RendererData {
  div: HTMLDivElement | null;
}

function createDOMTextData(_state: RenderState, _source: Renderable): DOMTextData {
  return createEntity({ div: null });
}

const _textLayout = createTextLayoutResult();

let _measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx === null) {
    _measureCtx = document.createElement('canvas').getContext('2d');
  }
  return _measureCtx;
}

const LAYOUT_WIDTH = 10000;

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
    initDOMElement(data.div);
  }

  const measure = (t: string, format: TextFormat): number => {
    ctx.font = formatToFont(format);
    return ctx.measureText(t).width;
  };

  layoutText(_textLayout, {
    text,
    formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
    width: LAYOUT_WIDTH,
    height: LAYOUT_WIDTH,
    measure,
  });

  let html = '';
  for (const group of _textLayout.groups) {
    const fmt = group.format;
    const slice = htmlEscape(text.substring(group.startIndex, group.endIndex));
    const x = group.offsetX;
    const y = group.offsetY;

    let style = `position:absolute;left:${x}px;top:${y}px;font:${formatToFont(fmt)};`;
    style += `color:${colorToCSS(fmt.color ?? 0)};white-space:nowrap;`;
    if (fmt.underline) style += 'text-decoration:underline;';

    html += `<div style="${style}">${slice}</div>`;
  }

  data.div.innerHTML = html;

  applyDOMStyle(state, data.div, renderNode);
  state.element.appendChild(data.div);
}

export function drawDOMTextMask(_state: DOMRenderState, _renderNode: DisplayObjectRenderNode): void {
  // Masking not yet supported in DOM renderer
}

export const defaultDOMTextRenderer: DisplayObjectRenderer = {
  createData: createDOMTextData,
  draw: drawDOMText,
  drawMask: drawDOMTextMask,
};
