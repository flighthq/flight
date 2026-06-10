import { createEntity } from '@flighthq/entity';
import { computeTextFormatFontString, rgbToHexString } from '@flighthq/render';
import { getRichTextRuntime } from '@flighthq/scene-display';
import {
  computeRichTextContent,
  computeTextLayout,
  getRichTextContent,
  getRichTextFieldHeight,
  getRichTextFieldWidth,
  getRichTextScrollYOffset,
  getRichTextSelectionRectangles,
  getTextLayoutResult,
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

import { getDomFontAscentCached, setDomFontAscentCached } from './domFontSource';
import { applyDOMStyle, initDOMElement, setDOMRendererElement } from './domStyle';
import { escapeHtmlString } from './domTextHelpers';

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
  computeRichTextContent(content, source.data);
  const { text } = content;

  const ctx = getMeasureCtx();
  if (ctx === null) return;

  const measure = (t: string, fmt: TextFormat): number => {
    ctx.font = computeTextFormatFontString(fmt);
    return ctx.measureText(t).width;
  };

  const result = getTextLayoutResult(richTextRuntime as TextRuntime);
  computeTextLayout(result, {
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
  div.style.backgroundColor = background ? rgbToHexString(backgroundColor) : '';
  div.style.border = border ? `1px solid ${rgbToHexString(borderColor)}` : '';

  if (text.length === 0) {
    div.innerHTML = '';
    applyDOMStyle(state, div, renderNode);
    setDOMRendererElement(state, div);
    return;
  }

  const firstVisibleLine = scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? getRichTextScrollYOffset(result.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = scrollH;

  let html = '';

  if (source.data.selectable && richTextRuntime.selectionBeginIndex !== richTextRuntime.selectionEndIndex) {
    getRichTextSelectionRectangles(
      _richTextSelectionRectangles,
      richTextRuntime.selectionBeginIndex,
      richTextRuntime.selectionEndIndex,
      result,
    );
    for (const rectangle of _richTextSelectionRectangles) {
      html += `<div style="position:absolute;left:${rectangle.x - scrollXOffset}px;top:${rectangle.y - scrollYOffset}px;width:${rectangle.width}px;height:${rectangle.height}px;background:${DOM_SELECTION_COLOR};opacity:${DOM_SELECTION_ALPHA};pointer-events:none;"></div>`;
    }
  }

  const bulletLines = new Set<number>();
  for (const group of result.groups) {
    if (group.lineIndex < firstVisibleLine) continue;

    const fmt = group.format;
    const slice = escapeHtmlString(text.substring(group.startIndex, group.endIndex));
    const x = group.offsetX - scrollXOffset;
    const fontStr = computeTextFormatFontString(fmt);
    // Align the CSS alphabetic baseline with canvas: canvas draws at offsetY + group.ascent
    // (alphabetic baseline). CSS places the baseline at top + fontBoundingBoxAscent, so we
    // shift the div top so the two positions coincide.
    const fontAscent = getDomFontAscent(ctx, fontStr);
    const y = group.offsetY + group.ascent - fontAscent - scrollYOffset;

    if (fmt.bullet && !bulletLines.has(group.lineIndex)) {
      bulletLines.add(group.lineIndex);
      const bulletSize = fmt.size ?? 12;
      const bulletX = x - bulletSize * 0.7 - DOM_BULLET_GAP;
      const bulletStyle = `position:absolute;left:${bulletX}px;top:${y}px;font:${fontStr};line-height:1;color:${rgbToHexString(fmt.color ?? source.data.textColor)};white-space:nowrap;`;
      html += `<div style="${bulletStyle}">Ã¢â‚¬Â¢</div>`;
    }

    let style = `position:absolute;left:${x}px;top:${y}px;font:${fontStr};line-height:1;`;
    style += `color:${rgbToHexString(fmt.color ?? source.data.textColor)};white-space:nowrap;`;
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
  setDOMRendererElement(state, div);
}

const DOM_BULLET_GAP = 4;

function getDomFontAscent(ctx: CanvasRenderingContext2D, font: string): number {
  const cached = getDomFontAscentCached(font);
  if (cached !== undefined) return cached;
  // Measure the CSS alphabetic baseline directly: a zero-height inline-block with
  // vertical-align:baseline sits with its top edge exactly on the line's baseline.
  // getBoundingClientRect() gives the exact pixel distance CSS uses, with no
  // inference from canvas metrics. Falls back to canvas measurement in non-browser env.
  const ascent =
    typeof document !== 'undefined' && document.body ? probeCSSFontAscent(font) : canvasFontAscentFallback(ctx, font);
  setDomFontAscentCached(font, ascent);
  return ascent;
}

function probeCSSFontAscent(font: string): number {
  const container = document.createElement('div');
  container.style.cssText = `font:${font};line-height:1;position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;white-space:nowrap`;
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;height:0;vertical-align:baseline';
  container.appendChild(document.createTextNode('H'));
  container.appendChild(probe);
  document.body.appendChild(container);
  const containerTop = container.getBoundingClientRect().top;
  const probeTop = probe.getBoundingClientRect().top;
  document.body.removeChild(container);
  return probeTop - containerTop;
}

function canvasFontAscentFallback(ctx: CanvasRenderingContext2D, font: string): number {
  ctx.font = font;
  const metrics = ctx.measureText('H') as TextMetrics & { fontBoundingBoxAscent?: number };
  const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(font);
  const size = sizeMatch ? parseFloat(sizeMatch[1]) : 12;
  return metrics.fontBoundingBoxAscent ?? size * 0.85;
}
const DOM_SELECTION_ALPHA = 0.35;
const DOM_SELECTION_COLOR = '#0078d7';
const _richTextSelectionRectangles: { height: number; lineIndex: number; width: number; x: number; y: number }[] = [];

export function drawDOMRichTextMask(state: DOMRenderState, renderNode: DisplayObjectRenderNode): void {
  drawDOMRichText(state, renderNode);
}

export const defaultDOMRichTextRenderer: DisplayObjectRenderer = {
  createData: createDOMRichTextData,
  draw: drawDOMRichText,
};
