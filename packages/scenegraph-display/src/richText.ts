import { invalidateAppearance } from '@flighthq/scenegraph-core';
import type {
  GraphNode,
  MethodsOf,
  PartialNode,
  Rectangle,
  RichText,
  RichTextData,
  RichTextRuntime,
  TextFormat,
  TextLayoutResult,
} from '@flighthq/types';
import { RichTextKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';
import type { RichTextDataInternal } from './internal';
import { createTextData } from './text';

export function clearRichTextFormatRanges(source: RichText): void {
  source.data.textFormatRanges.length = 0;
}

export function computeRichTextLocalBoundsRectangle(out: Rectangle, source: Readonly<GraphNode>): void {
  const data = (source as RichText).data;
  out.width = data.width;
  out.height = data.height;
}

export function createRichText(obj?: Readonly<PartialNode<RichText>>): RichText {
  return createDisplayObjectGeneric(RichTextKind, obj, createRichTextData, createRichTextRuntime) as RichText;
}

export function createRichTextData(data?: Readonly<Partial<RichTextData>>): RichTextData {
  const _data = createTextData(data) as RichTextData;
  _data.background = data?.background ?? false;
  _data.backgroundColor = data?.backgroundColor ?? 0xffffff;
  _data.border = data?.border ?? false;
  _data.borderColor = data?.borderColor ?? 0;
  _data.height = data?.height ?? 100;
  _data.width = data?.width ?? 100;
  _data.condenseWhite = data?.condenseWhite ?? false;
  _data.defaultTextFormat = data?.defaultTextFormat ?? {};
  _data.htmlText = data?.htmlText ?? '';
  _data.maxChars = data?.maxChars ?? -1;
  _data.mouseWheelEnabled = data?.mouseWheelEnabled ?? true;
  _data.multiline = data?.multiline ?? true;
  (_data as RichTextDataInternal).scrollH = data?.scrollH ?? 0;
  (_data as RichTextDataInternal).scrollV = data?.scrollV ?? 1;
  _data.selectable = data?.selectable ?? true;
  _data.styleSheet = data?.styleSheet ?? null;
  _data.textColor = data?.textColor ?? 0;
  _data.textFormatRanges = data?.textFormatRanges ? data.textFormatRanges.map((range) => ({ ...range })) : [];
  _data.wordWrap = data?.wordWrap ?? false;
  return _data;
}

export function createRichTextRuntime(): RichTextRuntime {
  const out = createDisplayObjectRuntime(defaultMethods) as RichTextRuntime;
  out.textLayout = null;
  out.richTextContent = null;
  out.selectionBeginIndex = 0;
  out.selectionEndIndex = 0;
  return out;
}

export function dispatchRichTextWheel(source: RichText, deltaLines: number, layout?: Readonly<TextLayoutResult>): void {
  setRichTextScrollV(source, source.data.scrollV + Math.round(deltaLines), layout);
}

export function getRichTextRuntime(source: Readonly<RichText>): Readonly<RichTextRuntime> {
  return getDisplayObjectRuntime(source) as RichTextRuntime;
}

export function setRichTextFormatRange(
  source: RichText,
  format: TextFormat,
  start = 0,
  end = source.data.text.length,
): void {
  source.data.textFormatRanges.push({ end, format, start });
}

export function setRichTextScrollH(source: RichText, value: number, layout?: Readonly<TextLayoutResult>): void {
  const _data = source.data as RichTextDataInternal;
  const max = layout != null ? getRichTextMaxScrollHFromLayout(source.data, layout) : Infinity;
  const clamped = Math.max(0, Math.min(max, Math.round(value)));
  if (_data.scrollH === clamped) return;
  _data.scrollH = clamped;
  invalidateAppearance(source);
}

export function setRichTextScrollV(source: RichText, value: number, layout?: Readonly<TextLayoutResult>): void {
  const _data = source.data as RichTextDataInternal;
  const max = layout != null ? getRichTextMaxScrollVFromLayout(source.data, layout) : Infinity;
  const clamped = Math.max(1, Math.min(max, Math.round(value)));
  if (_data.scrollV === clamped) return;
  _data.scrollV = clamped;
  invalidateAppearance(source);
}

const defaultMethods: Partial<MethodsOf<RichTextRuntime>> = {
  computeLocalBoundsRect: computeRichTextLocalBoundsRectangle,
};

function getRichTextMaxScrollHFromLayout(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
  const fieldW = data.autoSize === 'none' || data.wordWrap ? data.width : layout.textWidth + 4;
  return Math.max(0, Math.ceil(layout.textWidth - Math.max(0, fieldW - 4)));
}

function getRichTextMaxScrollVFromLayout(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
  if (layout.numLines <= 1) return 1;
  const fieldH = data.autoSize === 'none' ? data.height : layout.textHeight + 4;
  const visibleH = Math.max(0, fieldH - 4);
  let total = 0;
  let count = 0;
  for (const h of layout.lineHeights) {
    if (count > 0 && total + h > visibleH) break;
    total += h;
    count++;
  }
  return Math.max(1, layout.numLines - Math.max(1, count) + 1);
}
