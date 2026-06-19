import {
  createDisplayObjectGeneric,
  createDisplayObjectRuntime,
  getDisplayObjectRuntime,
} from '@flighthq/displayobject';
import { invalidateNodeLocalBounds, invalidateNodeLocalContent } from '@flighthq/node';
import type {
  MethodsOf,
  NativeText,
  NativeTextData,
  NativeTextRuntime,
  NativeTextStyle,
  Node,
  PartialNode,
  Rectangle,
  TextAutoSize,
} from '@flighthq/types';
import { NativeTextKind } from '@flighthq/types';

// Mirrors htmlView.ts (DOM-backed display object whose bounds come from numbers, not DOM measurement)
// and textLabel.ts (create/runtime/defaultMethods shape). NativeText opts out of the TextLayout spine,
// so there is no ensureTextLayout / buildTextLayoutParams here.

// Bounds come from the platform engine's measurement, not the TextLayout spine. To keep displayobject
// DOM-free (it must never call getBoundingClientRect), the DOM renderer writes the measured size back
// onto the runtime and this reads those numbers. Under autoSize 'none' the field is the fixed user box;
// otherwise it tracks the last measured element size, falling back to the user box until first measured.
export function computeNativeTextLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const native = source as NativeText;
  const data = native.data;
  out.x = 0;
  out.y = 0;
  if (data.autoSize === 'none') {
    out.width = data.width;
    out.height = data.height;
    return;
  }
  const runtime = getNativeTextRuntime(native);
  out.width = runtime.measuredWidth > 0 ? runtime.measuredWidth : data.width;
  out.height = runtime.measuredHeight > 0 ? runtime.measuredHeight : data.height;
}

export function createNativeText(obj?: Readonly<PartialNode<NativeText>>): NativeText {
  return createDisplayObjectGeneric(NativeTextKind, obj, createNativeTextData, createNativeTextRuntime) as NativeText;
}

export function createNativeTextData(data?: Readonly<Partial<NativeTextData>>): NativeTextData {
  return {
    autoSize: data?.autoSize ?? 'none',
    height: data?.height ?? 100,
    style: data?.style ?? {},
    text: data?.text ?? '',
    width: data?.width ?? 100,
  };
}

export function createNativeTextRuntime(): NativeTextRuntime {
  const out = createDisplayObjectRuntime(defaultMethods) as NativeTextRuntime;
  out.element = null;
  out.measuredHeight = 0;
  out.measuredWidth = 0;
  return out;
}

export function getNativeTextRuntime(source: Readonly<NativeText>): Readonly<NativeTextRuntime> {
  return getDisplayObjectRuntime(source) as NativeTextRuntime;
}

export function setNativeTextAutoSize(source: NativeText, value: TextAutoSize): void {
  const data = source.data;
  if (data.autoSize === value) return;
  data.autoSize = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

export function setNativeTextHeight(source: NativeText, value: number): void {
  const data = source.data;
  if (data.height === value) return;
  data.height = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

export function setNativeTextString(source: NativeText, value: string): void {
  const data = source.data;
  if (data.text === value) return;
  data.text = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

// Replaces the style descriptor wholesale (it is an object reference); the content revision bumps
// unconditionally because field-level equality is not tracked, mirroring setTextLabelFormat.
export function setNativeTextStyle(source: NativeText, value: NativeTextStyle): void {
  source.data.style = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

export function setNativeTextWidth(source: NativeText, value: number): void {
  const data = source.data;
  if (data.width === value) return;
  data.width = value;
  invalidateNodeLocalContent(source);
  invalidateNodeLocalBounds(source);
}

const defaultMethods: Partial<MethodsOf<NativeTextRuntime>> = {
  computeLocalBoundsRectangle: computeNativeTextLocalBoundsRectangle,
};
