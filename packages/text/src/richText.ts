import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import { invalidateNodeLocalBounds, invalidateNodeLocalContent } from '@flighthq/node';
import { createSignal } from '@flighthq/signals';
import {
  computeRichTextBottomScrollV,
  computeRichTextCharIndexAtPoint,
  computeRichTextContent,
  computeRichTextLineCount,
  computeRichTextLineMetrics,
  computeRichTextMaxScrollH,
  computeRichTextMaxScrollV,
  computeRichTextTextHeight,
  computeRichTextTextWidth,
  computeTextBoundsRectangle,
  getRichTextContent,
  getRichTextLinkAtPoint,
  mergeTextFormat,
} from '@flighthq/textlayout';
import type {
  MethodsOf,
  Node,
  PartialNode,
  Rectangle,
  RichText,
  RichTextData,
  RichTextRuntime,
  RichTextStyleSheet,
  TextFieldChangeEvent,
  TextFieldLinkEvent,
  TextFieldScrollEvent,
  TextFieldSignals,
  TextFormat,
  TextFormatRange,
  TextLabel,
  TextLayoutParams,
  TextLayoutResult,
  TextLineMetrics,
  TextMeasureFunction,
} from '@flighthq/types';
import { RichTextKind } from '@flighthq/types';

import { createTextLabelData } from './textLabel';
import { ensureTextLayout, getTextLayout } from './textLabelLayout';

export function appendRichTextString(source: RichText, value: string): void {
  if (value.length === 0) return;
  const previousText = source.data.text;
  source.data.text += value;
  invalidateRichTextContent(source);
  emitTextFieldChange(source, previousText);
}

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
  _data.scrollH = data?.scrollH ?? 0;
  _data.scrollV = data?.scrollV ?? 1;
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
  // null until enableTextFieldSignals(source) is called; setters emit only when non-null.
  out.textFieldSignals = null;
  return out;
}

export function createTextFieldSignals(): TextFieldSignals {
  return {
    onTextFieldChange: createSignal(),
    onTextFieldLink: createSignal(),
    onTextFieldScroll: createSignal(),
  };
}

// Checks whether the given point (in field-local space) is over a hyperlink, and if so emits
// `onTextFieldLink` on the signals group (when enabled). Returns the link URL or null.
// Callers that already have the layout can call `getRichTextLinkAtPoint` from `@flighthq/textlayout`
// directly; this is the convenience entry that also fires the signal and ensures layout first.
export function dispatchRichTextLinkAtPoint(source: RichText, x: number, y: number): string | null {
  ensureTextLayout(source);
  const layout = getTextLayout(source);
  if (layout === null) return null;
  const url = getRichTextLinkAtPoint(layout, x, y);
  if (url !== null) {
    const signals = (getDisplayObjectRuntime(source) as RichTextRuntime).textFieldSignals;
    if (signals !== null) {
      const event: TextFieldLinkEvent = { url, x, y };
      signals.onTextFieldLink.emit(event);
    }
  }
  return url;
}

export function dispatchRichTextWheel(source: RichText, deltaLines: number, layout?: Readonly<TextLayoutResult>): void {
  setRichTextScrollV(source, source.data.scrollV + Math.round(deltaLines), layout);
}

export function enableTextFieldSignals(source: RichText): TextFieldSignals {
  const runtime = getDisplayObjectRuntime(source) as RichTextRuntime;
  return (runtime.textFieldSignals ??= createTextFieldSignals());
}

export function getRichTextBottomScrollV(source: Readonly<RichText>): number {
  ensureTextLayout(source);
  const layout = getTextLayout(source);
  if (layout === null) return 1;
  return computeRichTextBottomScrollV(source.data, layout);
}

export function getRichTextCharIndexAtPoint(source: Readonly<RichText>, x: number, y: number): number {
  ensureTextLayout(source);
  const layout = getTextLayout(source);
  if (layout === null) return -1;
  return computeRichTextCharIndexAtPoint(source.data.text, layout, x, y);
}

export function getRichTextDefaultTextFormat(source: Readonly<RichText>): Readonly<TextFormat> {
  return source.data.defaultTextFormat;
}

// Returns the effective merged TextFormat at the given character index: begins from
// defaultTextFormat and overlays every textFormatRange whose span covers the index.
export function getRichTextFormatRangeAt(out: TextFormat, source: Readonly<RichText>, index: number): void {
  const data = source.data;
  let merged: TextFormat = { ...data.defaultTextFormat };
  for (const range of data.textFormatRanges) {
    if (index >= range.start && index < range.end) {
      merged = mergeTextFormat(merged, range.format);
    }
  }
  const keys = Object.keys(merged) as (keyof TextFormat)[];
  for (const key of keys) {
    (out as Record<string, unknown>)[key] = merged[key];
  }
}

export function getRichTextFormatRangeByIndex(out: TextFormatRange, source: Readonly<RichText>, i: number): boolean {
  const range = source.data.textFormatRanges[i];
  if (range === undefined) return false;
  out.start = range.start;
  out.end = range.end;
  out.format = range.format;
  return true;
}

export function getRichTextFormatRangeCount(source: Readonly<RichText>): number {
  return source.data.textFormatRanges.length;
}

// Writes into `out` every format range overlapping the span `[beginIndex, endIndex)` — the symmetric
// read partner of removeRichTextFormatRangesIn (same half-open overlap test). The ranges are pushed by
// reference in their stored order; `out` is cleared first. This is the OpenFL getTextFormat(begin, end)
// read half, leaving range merging (mergeTextFormat) to the caller when a single effective format is wanted.
export function getRichTextFormatRangesIn(
  out: TextFormatRange[],
  source: Readonly<RichText>,
  beginIndex: number,
  endIndex: number,
): void {
  out.length = 0;
  for (const range of source.data.textFormatRanges) {
    if (range.start < endIndex && range.end > beginIndex) out.push(range);
  }
}

export function getRichTextHtml(source: Readonly<RichText>): string {
  return source.data.htmlText;
}

export function getRichTextLength(source: Readonly<RichText>): number {
  return source.data.text.length;
}

export function getRichTextLineCount(source: Readonly<RichText>): number {
  ensureTextLayout(source);
  const layout = getTextLayout(source);
  if (layout === null) return 0;
  return computeRichTextLineCount(layout);
}

export function getRichTextLineMetrics(
  source: Readonly<RichText>,
  lineIndex: number,
): Readonly<TextLineMetrics> | null {
  ensureTextLayout(source);
  const layout = getTextLayout(source);
  if (layout === null) return null;
  return computeRichTextLineMetrics(layout, lineIndex);
}

export function getRichTextMaxScrollH(source: Readonly<RichText>): number {
  ensureTextLayout(source);
  const layout = getTextLayout(source);
  if (layout === null) return 0;
  return computeRichTextMaxScrollH(source.data, layout);
}

export function getRichTextMaxScrollV(source: Readonly<RichText>): number {
  ensureTextLayout(source);
  const layout = getTextLayout(source);
  if (layout === null) return 1;
  return computeRichTextMaxScrollV(source.data, layout);
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

export function getRichTextString(source: Readonly<RichText>): string {
  return source.data.text;
}

export function getRichTextTextHeight(source: Readonly<RichText>): number {
  ensureTextLayout(source);
  const layout = getTextLayout(source);
  if (layout === null) return 0;
  return computeRichTextTextHeight(layout);
}

export function getRichTextTextWidth(source: Readonly<RichText>): number {
  ensureTextLayout(source);
  const layout = getTextLayout(source);
  if (layout === null) return 0;
  return computeRichTextTextWidth(layout);
}

export function getTextFieldSignals(source: Readonly<RichText>): TextFieldSignals | null {
  return (getDisplayObjectRuntime(source) as RichTextRuntime).textFieldSignals;
}

// Inserts `value` at the given character `index` (clamped to `[0, text.length]`), then shifts all
// format ranges that start or end at or after the insertion point forward by `value.length`. Ranges
// that start before the insertion point are extended if they cover it; all other ranges shift as a
// block. This preserves the user's formatting intent on both sides of the cut point.
export function insertRichTextString(source: RichText, index: number, value: string): void {
  if (value.length === 0) return;
  const text = source.data.text;
  const clampedIndex = Math.max(0, Math.min(text.length, index));
  const previousText = text;
  source.data.text = text.slice(0, clampedIndex) + value + text.slice(clampedIndex);
  const delta = value.length;
  for (const range of source.data.textFormatRanges) {
    if (range.start >= clampedIndex) {
      range.start += delta;
      range.end += delta;
    } else if (range.end > clampedIndex) {
      // Range straddles the insertion point: extend its end so it continues to cover the same chars
      // and also the newly-inserted text (the natural intent for a range that was "open" at the cut).
      range.end += delta;
    }
  }
  invalidateRichTextContent(source);
  emitTextFieldChange(source, previousText);
}

export function removeRichTextFormatRangesIn(source: RichText, begin: number, end: number): void {
  const ranges = source.data.textFormatRanges;
  let changed = false;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    // Remove ranges that overlap [begin, end) entirely or partially
    if (r.start < end && r.end > begin) {
      ranges.splice(i, 1);
      changed = true;
    }
  }
  if (changed) invalidateRichTextContent(source);
}

// Replaces the substring `[beginIndex, endIndex)` with `value`. Both indices are clamped to
// `[0, text.length]`; if `beginIndex >= endIndex` after clamping, the call degenerates to an insert.
// Format ranges are re-indexed: ranges fully inside the replaced span are removed; ranges that
// straddle either boundary are trimmed to the boundary; all ranges starting at or after `endIndex`
// are shifted by the net length delta.
export function replaceRichTextString(source: RichText, beginIndex: number, endIndex: number, value: string): void {
  const text = source.data.text;
  const start = Math.max(0, Math.min(text.length, beginIndex));
  const end = Math.max(start, Math.min(text.length, endIndex));
  const previousText = text;
  source.data.text = text.slice(0, start) + value + text.slice(end);
  const removedLength = end - start;
  const delta = value.length - removedLength;
  const ranges = source.data.textFormatRanges;
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    if (r.start >= end) {
      // Entirely after the replaced span: shift.
      r.start += delta;
      r.end += delta;
    } else if (r.end <= start) {
      // Entirely before: no change.
    } else if (r.start >= start && r.end <= end) {
      // Fully inside the replaced span: remove.
      ranges.splice(i, 1);
    } else if (r.start < start && r.end > end) {
      // Spans both boundaries: shrink by the net delta.
      r.end += delta;
    } else if (r.start < start) {
      // Left overlap: trim end to the start of the replaced region, then account for insert.
      r.end = start + value.length;
    } else {
      // Right overlap (r.start >= start, r.start < end, r.end > end): trim start to after insert.
      r.start = start + value.length;
      r.end += delta;
    }
  }
  invalidateRichTextContent(source);
  if (previousText !== source.data.text) emitTextFieldChange(source, previousText);
}

export function setRichTextBackground(source: RichText, value: boolean): void {
  if (source.data.background === value) return;
  source.data.background = value;
  invalidateNodeLocalContent(source);
}

export function setRichTextBackgroundColor(source: RichText, value: number): void {
  if (source.data.backgroundColor === value) return;
  source.data.backgroundColor = value;
  invalidateNodeLocalContent(source);
}

export function setRichTextBorder(source: RichText, value: boolean): void {
  if (source.data.border === value) return;
  source.data.border = value;
  invalidateNodeLocalContent(source);
}

export function setRichTextBorderColor(source: RichText, value: number): void {
  if (source.data.borderColor === value) return;
  source.data.borderColor = value;
  invalidateNodeLocalContent(source);
}

export function setRichTextCondenseWhite(source: RichText, value: boolean): void {
  if (source.data.condenseWhite === value) return;
  source.data.condenseWhite = value;
  invalidateRichTextContent(source);
}

export function setRichTextDefaultTextFormat(source: RichText, value: TextFormat): void {
  source.data.defaultTextFormat = value;
  invalidateRichTextContent(source);
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

export function setRichTextHeight(source: RichText, value: number): void {
  if (source.data.height === value) return;
  source.data.height = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

export function setRichTextHtml(source: RichText, value: string): void {
  if (source.data.htmlText === value) return;
  source.data.htmlText = value;
  invalidateRichTextContent(source);
}

export function setRichTextMaxChars(source: RichText, value: number): void {
  if (source.data.maxChars === value) return;
  source.data.maxChars = value;
  invalidateNodeLocalContent(source);
}

export function setRichTextMouseWheelEnabled(source: RichText, value: boolean): void {
  if (source.data.mouseWheelEnabled === value) return;
  source.data.mouseWheelEnabled = value;
  invalidateNodeLocalContent(source);
}

export function setRichTextMultiline(source: RichText, value: boolean): void {
  if (source.data.multiline === value) return;
  source.data.multiline = value;
  invalidateRichTextContent(source);
  invalidateNodeLocalBounds(source);
}

export function setRichTextScrollH(source: RichText, value: number, layout?: Readonly<TextLayoutResult>): void {
  const max = layout != null ? computeRichTextMaxScrollHFromLayout(source.data, layout) : Infinity;
  const clamped = Math.max(0, Math.min(max, Math.round(value)));
  if (source.data.scrollH === clamped) return;
  const previousScrollH = source.data.scrollH;
  const previousScrollV = source.data.scrollV;
  source.data.scrollH = clamped;
  invalidateNodeLocalContent(source);
  emitTextFieldScroll(source, previousScrollH, previousScrollV);
}

export function setRichTextScrollV(source: RichText, value: number, layout?: Readonly<TextLayoutResult>): void {
  const max = layout != null ? computeRichTextMaxScrollVFromLayout(source.data, layout) : Infinity;
  const clamped = Math.max(1, Math.min(max, Math.round(value)));
  if (source.data.scrollV === clamped) return;
  const previousScrollH = source.data.scrollH;
  const previousScrollV = source.data.scrollV;
  source.data.scrollV = clamped;
  invalidateNodeLocalContent(source);
  emitTextFieldScroll(source, previousScrollH, previousScrollV);
}

export function setRichTextSelectable(source: RichText, value: boolean): void {
  if (source.data.selectable === value) return;
  source.data.selectable = value;
  invalidateNodeLocalContent(source);
}

export function setRichTextString(source: RichText, value: string): void {
  const previousText = source.data.text;
  source.data.text = value;
  invalidateRichTextContent(source);
  if (previousText !== value) emitTextFieldChange(source, previousText);
}

export function setRichTextStyleSheet(source: RichText, value: RichTextStyleSheet | null): void {
  source.data.styleSheet = value;
  invalidateRichTextContent(source);
}

export function setRichTextTextColor(source: RichText, value: number): void {
  if (source.data.textColor === value) return;
  source.data.textColor = value;
  invalidateNodeLocalContent(source);
}

export function setRichTextWidth(source: RichText, value: number): void {
  if (source.data.width === value) return;
  source.data.width = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

export function setRichTextWordWrap(source: RichText, value: boolean): void {
  if (source.data.wordWrap === value) return;
  source.data.wordWrap = value;
  invalidateRichTextContent(source);
  invalidateNodeLocalBounds(source);
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

function computeRichTextMaxScrollHFromLayout(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
  const fieldW = data.autoSize === 'none' || data.wordWrap ? data.width : layout.textWidth + 4;
  return Math.max(0, Math.ceil(layout.textWidth - Math.max(0, fieldW - 4)));
}

function computeRichTextMaxScrollVFromLayout(data: Readonly<RichTextData>, layout: Readonly<TextLayoutResult>): number {
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

// Emits onTextFieldChange when the signals group is enabled. Callers must supply `previousText`
// captured before the mutation; `source.data.text` is the new text at call time.
function emitTextFieldChange(source: Readonly<RichText>, previousText: string): void {
  const signals = (getDisplayObjectRuntime(source) as RichTextRuntime).textFieldSignals;
  if (signals === null) return;
  const event: TextFieldChangeEvent = { previousText, text: source.data.text };
  signals.onTextFieldChange.emit(event);
}

// Emits onTextFieldScroll when the signals group is enabled. Callers must supply `previousScrollH`
// and `previousScrollV` captured before the mutation.
function emitTextFieldScroll(source: Readonly<RichText>, previousScrollH: number, previousScrollV: number): void {
  const signals = (getDisplayObjectRuntime(source) as RichTextRuntime).textFieldSignals;
  if (signals === null) return;
  const event: TextFieldScrollEvent = {
    previousScrollH,
    previousScrollV,
    scrollH: source.data.scrollH,
    scrollV: source.data.scrollV,
  };
  signals.onTextFieldScroll.emit(event);
}
