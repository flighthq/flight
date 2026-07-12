import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import { invalidateNodeLocalBounds, invalidateNodeLocalContent } from '@flighthq/node';
import { computeTextBoundsRectangle, createTextFormatRange } from '@flighthq/textlayout';
import type {
  MethodsOf,
  Node,
  PartialNode,
  Rectangle,
  TextAutoSize,
  TextFormat,
  TextLabel,
  TextLabelData,
  TextLabelRuntime,
  TextLayoutParams,
  TextMeasureFunction,
  TextVerticalAlign,
} from '@flighthq/types';
import { TextLabelKind } from '@flighthq/types';

import { ensureTextLayout, getTextLayout } from './textLabelLayout';

// Per-kind layout-params hook for ensureTextLayout: a TextLabel is a single run, so it lays out its
// whole string with one format range and no wrap — the lean path that skips RichText's range/html
// assembly and wrap/multiline machinery. Local: only assigned onto the runtime in createTextLabelRuntime.
function buildTextLabelLayoutParams(source: Readonly<TextLabel>, measure: TextMeasureFunction): TextLayoutParams {
  const data = source.data;
  return {
    formatRanges: [createTextFormatRange(data.textFormat, 0, data.text.length)],
    height: data.height,
    measure,
    text: data.text,
    // Vertical alignment only means something within a fixed-height box; an auto-fit field has no
    // slack, so pass 'top' and leave the block at the content origin.
    verticalAlign: data.autoSize === 'none' ? data.verticalAlign : 'top',
    width: data.width,
  };
}

export function appendTextLabelString(source: TextLabel, value: string): void {
  if (value.length === 0) return;
  source.data.text += value;
  invalidateTextLabelContent(source);
}

// The field-box bounds in local space, mirroring computeRichTextLocalBoundsRectangle. A fixed field
// (autoSize 'none') is the user width/height at the origin. Under autoSize, the box is the measured
// content (textWidth/textHeight + gutter) positioned by the left/right/center anchor. The layout is
// ensured on demand here, so a TextLabel's autoSize bounds are queryable before it is ever rendered.
// Falls back to the fixed box until a measure provider is registered.
export function computeTextLabelLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const label = source as TextLabel;
  const data = label.data;
  if (data.autoSize === 'none') {
    out.x = 0;
    out.y = 0;
    out.width = data.width;
    out.height = data.height;
    return;
  }

  ensureTextLayout(label);
  const layout = getTextLayout(label);
  if (layout === null) {
    out.x = 0;
    out.y = 0;
    out.width = data.width;
    out.height = data.height;
    return;
  }

  computeTextBoundsRectangle(out, data, layout);
}

export function createTextLabel(obj?: Readonly<PartialNode<TextLabel>>): TextLabel {
  return createDisplayObjectGeneric(TextLabelKind, obj, createTextLabelData, createTextLabelRuntime) as TextLabel;
}

export function createTextLabelData(data?: Readonly<Partial<TextLabelData>>): TextLabelData {
  return {
    autoSize: data?.autoSize ?? 'none',
    height: data?.height ?? 100,
    text: data?.text ?? '',
    textFormat: data?.textFormat ?? {},
    verticalAlign: data?.verticalAlign ?? 'top',
    width: data?.width ?? 100,
  };
}

export function createTextLabelRuntime(): TextLabelRuntime {
  const out = createDisplayObjectRuntime(defaultMethods) as TextLabelRuntime;
  // buildTextLayoutParams is a text-specific per-kind seam, not a display-object trait, so no
  // trait-init copies it off defaultMethods — assign it onto the runtime directly.
  out.buildTextLayoutParams = buildTextLabelLayoutParams;
  out.textLayout = null;
  out.textLayoutUsingContentId = -1;
  return out;
}

export function getTextLabelFormat(source: Readonly<TextLabel>): Readonly<TextFormat> {
  return source.data.textFormat;
}

export function getTextLabelRuntime(source: Readonly<TextLabel>): Readonly<TextLabelRuntime> {
  return getDisplayObjectRuntime(source) as TextLabelRuntime;
}

export function getTextLabelString(source: Readonly<TextLabel>): string {
  return source.data.text;
}

// The discoverable companion to the direct-mutation path: after mutating `data.text` or
// `data.textFormat` in place (rather than through a `setTextLabel*` setter), call this to invalidate —
// the content revision, plus local bounds when `autoSize` derives the box from the text. Never touches
// the transform.
export function invalidateTextLabel(source: TextLabel): void {
  invalidateTextLabelContent(source);
}

export function setTextLabelAutoSize(source: TextLabel, value: TextAutoSize): void {
  const data = source.data;
  if (data.autoSize === value) return;
  data.autoSize = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

// Replaces the format wholesale. textFormat is an object reference, so callers pass a new format to
// apply; the content revision bumps unconditionally because field-level equality is not tracked.
export function setTextLabelFormat(source: TextLabel, value: TextFormat): void {
  source.data.textFormat = value;
  invalidateTextLabelContent(source);
}

export function setTextLabelHeight(source: TextLabel, value: number): void {
  const data = source.data;
  if (data.height === value) return;
  data.height = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

export function setTextLabelString(source: TextLabel, value: string): void {
  const data = source.data;
  if (data.text === value) return;
  data.text = value;
  invalidateTextLabelContent(source);
}

// Vertical alignment repositions the glyphs within the (unchanged) height box, so it invalidates only
// the content revision — the field's bounds are the fixed height/width box and do not move. Mirrors
// setTextLabelString's content-only invalidation.
export function setTextLabelVerticalAlign(source: TextLabel, value: TextVerticalAlign): void {
  const data = source.data;
  if (data.verticalAlign === value) return;
  data.verticalAlign = value;
  invalidateNodeLocalContent(source);
}

export function setTextLabelWidth(source: TextLabel, value: number): void {
  const data = source.data;
  if (data.width === value) return;
  data.width = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

// Content invalidation shared by the text/format setters and `invalidateTextLabel`: bumps the content
// revision, and — only when `autoSize` measures the box from the text (`autoSize !== 'none'`) — the
// local bounds too, since the extent then depends on the content. Under `autoSize 'none'` the box is the
// fixed user width/height, so bounds are untouched. Mirrors `@flighthq/text`'s `invalidateRichTextContent`.
function invalidateTextLabelContent(source: TextLabel): void {
  invalidateNodeLocalContent(source);
  if (source.data.autoSize !== 'none') invalidateNodeLocalBounds(source);
}

const defaultMethods: Partial<MethodsOf<TextLabelRuntime>> = {
  computeLocalBoundsRectangle: computeTextLabelLocalBoundsRectangle,
};
