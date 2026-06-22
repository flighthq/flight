import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import { invalidateNodeLocalBounds, invalidateNodeLocalContent } from '@flighthq/node';
import { computeRichTextContent, computeTextBoundsRectangle, getRichTextContent } from '@flighthq/textlayout';
import type {
  MethodsOf,
  Node,
  PartialNode,
  Rectangle,
  RichText,
  RichTextData,
  RichTextRuntime,
  TextFormat,
  TextLabel,
  TextLayoutParams,
  TextLayoutResult,
  TextMeasureFunction,
} from '@flighthq/types';
import { RichTextKind } from '@flighthq/types';

import type { RichTextDataInternal } from './internal';
import { createTextLabelData } from './textLabel';
import { ensureTextLayout, getTextLayout } from './textLabelLayout';

// Per-kind layout-params hook for ensureTextLayout: assembles RichText's multi-format/html content
// (cached on the runtime) plus the wrap/multiline constraints. Password masking, when the editable-input
// slot enables it, is applied by computeRichTextContent via getRichTextPasswordCharacter.
export function buildRichTextLayoutParams(source: Readonly<TextLabel>, measure: TextMeasureFunction): TextLayoutParams {
  const richText = source as Readonly<RichText>;
  const data = richText.data;
  const runtime = getDisplayObjectRuntime(richText) as RichTextRuntime;
  const content = getRichTextContent(runtime);
  computeRichTextContent(content, data, getRichTextPasswordCharacter(richText));
  return {
    formatRanges: content.formatRanges,
    height: data.height,
    measure,
    multiline: data.multiline,
    text: content.text,
    width: data.wordWrap ? data.width : 10000,
    wordWrap: data.wordWrap,
  };
}

export function clearRichTextFormatRanges(source: RichText): void {
  source.data.textFormatRanges.length = 0;
  invalidateRichTextContent(source);
}

// The field-box bounds in local space. A fixed field (autoSize 'none') is exactly the user width/
// height at the origin. Under autoSize, the box is the measured field size (textWidth/textHeight +
// gutter), positioned by the left/right/center anchor relative to the original width — so 'right'
// grows leftward and 'center' splits the difference. The layout is ensured on demand here, which is
// what lets autoSize bounds be queried before the text is ever rendered. Before any measure provider
// is registered the layout is unavailable, so it falls back to the fixed field box.
export function computeRichTextLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const richText = source as RichText;
  const data = richText.data;
  if (data.autoSize === 'none') {
    out.x = 0;
    out.y = 0;
    out.width = data.width;
    out.height = data.height;
    return;
  }

  ensureTextLayout(richText);
  const layout = getTextLayout(richText);
  if (layout === null) {
    out.x = 0;
    out.y = 0;
    out.width = data.width;
    out.height = data.height;
    return;
  }

  computeTextBoundsRectangle(out, data, layout);
}

export function createRichText(obj?: Readonly<PartialNode<RichText>>): RichText {
  return createDisplayObjectGeneric(RichTextKind, obj, createRichTextData, createRichTextRuntime) as RichText;
}

export function createRichTextData(data?: Readonly<Partial<RichTextData>>): RichTextData {
  const _data = createTextLabelData(data) as RichTextData;
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
  // buildTextLayoutParams is a text-specific per-kind seam, not a display-object trait, so no
  // trait-init copies it off defaultMethods — assign it onto the runtime directly.
  out.buildTextLayoutParams = buildRichTextLayoutParams;
  out.textLayout = null;
  out.textLayoutUsingContentId = -1;
  out.richTextContent = null;
  out.selectionBeginIndex = 0;
  out.selectionEndIndex = 0;
  // null until enableTextInput(node) opts this field into editing (docs/text-architecture-handoff.md,
  // Track A). A static RichText leaves it null and pulls no input code.
  out.input = null;
  return out;
}

export function dispatchRichTextWheel(source: RichText, deltaLines: number, layout?: Readonly<TextLayoutResult>): void {
  setRichTextScrollV(source, source.data.scrollV + Math.round(deltaLines), layout);
}

// The character a field masks its text with, or null when not masking. Password state lives on the
// editable-input slot (enableTextInput), not on RichTextData, so a static RichText is never masked.
// Shared by buildRichTextLayoutParams and every RichText renderer that self-measures its content.
export function getRichTextPasswordCharacter(source: Readonly<RichText>): string | null {
  const input = (getDisplayObjectRuntime(source) as RichTextRuntime).input;
  return input !== null && input.displayAsPassword ? input.passwordCharacter : null;
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
  invalidateRichTextContent(source);
}

export function setRichTextScrollH(source: RichText, value: number, layout?: Readonly<TextLayoutResult>): void {
  const _data = source.data as RichTextDataInternal;
  const max = layout != null ? getRichTextMaxScrollHFromLayout(source.data, layout) : Infinity;
  const clamped = Math.max(0, Math.min(max, Math.round(value)));
  if (_data.scrollH === clamped) return;
  _data.scrollH = clamped;
  invalidateNodeLocalContent(source);
}

export function setRichTextScrollV(source: RichText, value: number, layout?: Readonly<TextLayoutResult>): void {
  const _data = source.data as RichTextDataInternal;
  const max = layout != null ? getRichTextMaxScrollVFromLayout(source.data, layout) : Infinity;
  const clamped = Math.max(1, Math.min(max, Math.round(value)));
  if (_data.scrollV === clamped) return;
  _data.scrollV = clamped;
  invalidateNodeLocalContent(source);
}

export function setRichTextString(source: RichText, value: string): void {
  source.data.text = value;
  invalidateRichTextContent(source);
}

const defaultMethods: Partial<MethodsOf<RichTextRuntime>> = {
  computeLocalBoundsRectangle: computeRichTextLocalBoundsRectangle,
};

// A content change always re-rasterizes the field. It only changes the field's bounds when autoSize
// is active; a fixed field (autoSize 'none') keeps its user-set width/height, so bounds stay put.
function invalidateRichTextContent(source: RichText): void {
  invalidateNodeLocalContent(source);
  if (source.data.autoSize !== 'none') invalidateNodeLocalBounds(source);
}

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
