import { createEntity } from '@flighthq/entity';
import { createTextFormatRange, createTextLayoutResult, layoutText, mergeTextFormat } from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  DOMRenderState,
  Renderable,
  RendererData,
  RenderState,
  RichText,
  TextFormat,
} from '@flighthq/types';

import { applyDOMStyle, initDOMElement } from './domStyle';
import { colorToCSS, formatToFont, htmlEscape } from './domTextHelpers';

interface DOMRichTextData extends RendererData {
  div: HTMLDivElement | null;
}

function createDOMRichTextData(_state: RenderState, _source: Renderable): DOMRichTextData {
  return createEntity({ div: null });
}

const _richTextLayout = createTextLayoutResult();

let _measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx === null) {
    _measureCtx = document.createElement('canvas').getContext('2d');
  }
  return _measureCtx;
}

export function drawDOMRichText(state: DOMRenderState, renderNode: DisplayObjectRenderNode): void {
  const data = renderNode.rendererData as DOMRichTextData | null;
  if (data === null) return;

  const source = renderNode.source as RichText;
  const {
    text,
    defaultTextFormat,
    textFormat,
    background,
    backgroundColor,
    border,
    borderColor,
    width,
    height,
    wordWrap,
    multiline,
    scrollH,
    scrollV,
    textColor,
  } = source.data;

  if (data.div === null) {
    data.div = document.createElement('div');
    initDOMElement(data.div);
    data.div.style.overflow = 'hidden';
  }

  const div = data.div;
  div.style.width = `${width}px`;
  div.style.height = `${height}px`;
  div.style.backgroundColor = background ? colorToCSS(backgroundColor) : '';
  div.style.border = border ? `1px solid ${colorToCSS(borderColor)}` : '';

  if (text.length === 0) {
    div.innerHTML = '';
    applyDOMStyle(state, div, renderNode);
    state.element.appendChild(div);
    return;
  }

  const ctx = getMeasureCtx();
  if (ctx === null) return;

  const format: TextFormat = mergeTextFormat(defaultTextFormat, textFormat);
  if (format.color === undefined) format.color = textColor;

  const measure = (t: string, fmt: TextFormat): number => {
    ctx.font = formatToFont(fmt);
    return ctx.measureText(t).width;
  };

  layoutText(_richTextLayout, {
    text,
    formatRanges: [createTextFormatRange(format, 0, text.length)],
    width: wordWrap ? width : 10000,
    height,
    measure,
    multiline,
    wordWrap,
  });

  const firstVisibleLine = scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? computeScrollYOffset(_richTextLayout.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = scrollH;

  let html = '';
  for (const group of _richTextLayout.groups) {
    if (group.lineIndex < firstVisibleLine) continue;

    const fmt = group.format;
    const slice = htmlEscape(text.substring(group.startIndex, group.endIndex));
    const x = group.offsetX - scrollXOffset;
    const y = group.offsetY - scrollYOffset;

    let style = `position:absolute;left:${x}px;top:${y}px;font:${formatToFont(fmt)};`;
    style += `color:${colorToCSS(fmt.color ?? textColor)};white-space:nowrap;`;
    if (fmt.underline) style += 'text-decoration:underline;';

    switch (fmt.align) {
      case 'center':
        style += 'text-align:center;';
        break;
      case 'right':
        style += 'text-align:right;';
        break;
      case 'justify':
        style += 'text-align:justify;';
        break;
    }

    if (fmt.leftMargin != null) style += `padding-left:${fmt.leftMargin}px;`;
    if (fmt.rightMargin != null) style += `padding-right:${fmt.rightMargin}px;`;
    if (fmt.indent != null) style += `text-indent:${fmt.indent}px;`;

    html += `<div style="${style}">${slice}</div>`;
  }

  div.innerHTML = html;

  applyDOMStyle(state, div, renderNode);
  state.element.appendChild(div);
}

function computeScrollYOffset(lineHeights: readonly number[], firstVisibleLine: number): number {
  let offset = 0;
  const limit = Math.min(firstVisibleLine, lineHeights.length);
  for (let i = 0; i < limit; i++) offset += lineHeights[i];
  return offset;
}

export function drawDOMRichTextMask(_state: DOMRenderState, _renderNode: DisplayObjectRenderNode): void {
  // Masking not yet supported in DOM renderer
}

export const defaultDOMRichTextRenderer: DisplayObjectRenderer = {
  createData: createDOMRichTextData,
  draw: drawDOMRichText,
  drawMask: drawDOMRichTextMask,
};
