import { invalidateNodeLocalBounds, invalidateNodeLocalContent } from '@flighthq/node';
import type {
  MethodsOf,
  Node,
  PartialNode,
  Rectangle,
  Text,
  TextAutoSize,
  TextData,
  TextFormat,
  TextRuntime,
} from '@flighthq/types';
import { TextKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function computeTextLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const data = (source as Text).data;
  out.width = data.width;
  out.height = data.height;
}

export function createText(obj?: Readonly<PartialNode<Text>>): Text {
  return createDisplayObjectGeneric(TextKind, obj, createTextData, createTextRuntime) as Text;
}

export function createTextData(data?: Readonly<Partial<TextData>>): TextData {
  return {
    autoSize: data?.autoSize ?? 'none',
    height: data?.height ?? 100,
    text: data?.text ?? '',
    textFormat: data?.textFormat ?? {},
    width: data?.width ?? 100,
  };
}

export function createTextRuntime(): TextRuntime {
  const out = createDisplayObjectRuntime(defaultMethods) as TextRuntime;
  out.textLayout = null;
  return out;
}

export function getTextRuntime(source: Readonly<Text>): Readonly<TextRuntime> {
  return getDisplayObjectRuntime(source) as TextRuntime;
}

export function setTextAutoSize(source: Text, value: TextAutoSize): void {
  const data = source.data;
  if (data.autoSize === value) return;
  data.autoSize = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

// Replaces the format wholesale. textFormat is an object reference, so callers pass a new format to
// apply; the content revision bumps unconditionally because field-level equality is not tracked.
export function setTextFormat(source: Text, value: TextFormat): void {
  source.data.textFormat = value;
  invalidateNodeLocalContent(source);
}

export function setTextHeight(source: Text, value: number): void {
  const data = source.data;
  if (data.height === value) return;
  data.height = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

export function setTextString(source: Text, value: string): void {
  const data = source.data;
  if (data.text === value) return;
  data.text = value;
  invalidateNodeLocalContent(source);
}

export function setTextWidth(source: Text, value: number): void {
  const data = source.data;
  if (data.width === value) return;
  data.width = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

const defaultMethods: Partial<MethodsOf<TextRuntime>> = {
  computeLocalBoundsRectangle: computeTextLocalBoundsRectangle,
};
