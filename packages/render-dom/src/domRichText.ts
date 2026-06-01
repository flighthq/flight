import { createEntity } from '@flighthq/entity';
import { getRichTextRuntime } from '@flighthq/scenegraph-display';
import {
  getRichTextContent,
  getRichTextFieldHeight,
  getRichTextFieldWidth,
  getRichTextScrollYOffset,
  getRichTextSelectionRectangles,
  getTextLayoutResult,
  layoutText,
  resolveRichTextContent,
} from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  DOMRenderState,
  Renderable,
  RendererData,
  RenderState,
  RichText,
  RichTextRuntime,
  TextFormat,
  TextRuntime,
} from '@flighthq/types';

import { applyDOMStyle, initDOMElement } from './domStyle';
import { colorToCSS, formatToFont, htmlEscape } from './domTextHelpers';

interface DOMRichTextData extends RendererData {
  div: HTMLDivElement | null;
}

function createDOMRichTextData(_state: RenderState, _source: Renderable): DOMRichTextData {
  return createEntity({ div: null });
}

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
  const { background, backgroundColor, border, borderColor, wordWrap, multiline, scrollH, scrollV } = source.data;

  if (data.div === null) {
    data.div = document.createElement('div');
    initDOMElement(data.div);
    data.div.style.overflow = 'hidden';
  }

  const richTextRuntime = getRichTextRuntime(source) as RichTextRuntime;
  const content = getRichTextContent(richTextRuntime);
  resolveRichTextContent(content, source.data);
  const { text } = content;

  const ctx = getMeasureCtx();
  if (ctx === null) return;

  const measure = (t: string, fmt: TextFormat): number => {
    ctx.font = formatToFont(fmt);
    return ctx.measureText(t).width;
  };

  const result = getTextLayoutResult(richTextRuntime as TextRuntime);
  layoutText(result, {
    text,
    formatRanges: content.formatRanges,
    width: wordWrap ? source.data.width : 10000,
    height: source.data.height,
    measure,
    multiline,
    wordWrap,
  });
  const fieldW = getRichTextFieldWidth(source.data, result);
  const fieldH = getRichTextFieldHeight(source.data, result);
  const div = data.div;
  div.style.width = `${fieldW}px`;
  div.style.height = `${fieldH}px`;
  div.style.backgroundColor = background ? colorToCSS(backgroundColor) : '';
  div.style.border = border ? `1px solid ${colorToCSS(borderColor)}` : '';

  if (text.length === 0) {
    div.innerHTML = '';
    applyDOMStyle(state, div, renderNode);
    state.element.appendChild(div);
    return;
  }

  const firstVisibleLine = scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? getRichTextScrollYOffset(result.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = scrollH;

  let html = '';

  if (source.data.selectable && richTextRuntime.selectionBeginIndex !== richTextRuntime.selectionEndIndex) {
    getRichTextSelectionRectangles(_richTextSelectionRects, richTextRuntime.selectionBeginIndex, richTextRuntime.selectionEndIndex, result);
    for (const rect of _richTextSelectionRects) {
      html += `<div style="position:absolute;left:${rect.x - scrollXOffset}px;top:${rect.y - scrollYOffset}px;width:${rect.width}px;height:${rect.height}px;background:${DOM_SELECTION_COLOR};opacity:${DOM_SELECTION_ALPHA};pointer-events:none;"></div>`;
    }
  }

  const bulletLines = new Set<number>();
  for (const group of result.groups) {
    if (group.lineIndex < firstVisibleLine) continue;

    const fmt = group.format;
    const slice = htmlEscape(text.substring(group.startIndex, group.endIndex));
    const x = group.offsetX - scrollXOffset;
    const fontStr = formatToFont(fmt);
    // Align the CSS alphabetic baseline with canvas: canvas draws at offsetY + group.ascent
    // (alphabetic baseline). CSS places the baseline at top + fontBoundingBoxAscent, so we
    // shift the div top so the two positions coincide.
    const fontAscent = getDomFontAscent(ctx, fontStr);
    const y = group.offsetY + group.ascent - fontAscent - scrollYOffset;

    if (fmt.bullet && !bulletLines.has(group.lineIndex)) {
      bulletLines.add(group.lineIndex);
      const bulletSize = fmt.size ?? 12;
      const bulletX = x - bulletSize * 0.7 - DOM_BULLET_GAP;
      const bulletStyle = `position:absolute;left:${bulletX}px;top:${y}px;font:${fontStr};color:${colorToCSS(fmt.color ?? source.data.textColor)};white-space:nowrap;`;
      html += `<div style="${bulletStyle}">•</div>`;
    }

    let style = `position:absolute;left:${x}px;top:${y}px;font:${fontStr};`;
    style += `color:${colorToCSS(fmt.color ?? source.data.textColor)};white-space:nowrap;`;
    if (fmt.underline || fmt.strikethrough) {
      const decorations = [];
      if (fmt.underline) decorations.push('underline');
      if (fmt.strikethrough) decorations.push('line-through');
      style += `text-decoration:${decorations.join(' ')};`;
    }

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

const DOM_BULLET_GAP = 4;
const _domFontAscentCache = new Map<string, number>();

function getDomFontAscent(ctx: CanvasRenderingContext2D, font: string): number {
  const cached = _domFontAscentCache.get(font);
  if (cached !== undefined) return cached;
  ctx.font = font;
  const metrics = ctx.measureText('Hg') as TextMetrics & { fontBoundingBoxAscent?: number };
  // fontBoundingBoxAscent is the CSS line-box ascent — exactly what the browser uses
  // to position the alphabetic baseline within an element. Fall back to actualBoundingBoxAscent
  // of a tall character, which is a reasonable approximation.
  const ascent = metrics.fontBoundingBoxAscent ?? ctx.measureText('H').actualBoundingBoxAscent;
  _domFontAscentCache.set(font, ascent);
  return ascent;
}
const DOM_SELECTION_ALPHA = 0.35;
const DOM_SELECTION_COLOR = '#0078d7';
const _richTextSelectionRects: { height: number; lineIndex: number; width: number; x: number; y: number }[] = [];

export function drawDOMRichTextMask(_state: DOMRenderState, _renderNode: DisplayObjectRenderNode): void {
  // Masking not yet supported in DOM renderer
}

export const defaultDOMRichTextRenderer: DisplayObjectRenderer = {
  createData: createDOMRichTextData,
  draw: drawDOMRichText,
  drawMask: drawDOMRichTextMask,
};
