import type { MethodsOf, PartialNode, Rectangle, SceneNode, Text, TextData, TextRuntime } from '@flighthq/types';
import { TextKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function computeTextLocalBoundsRectangle(out: Rectangle, source: Readonly<SceneNode>): void {
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

const defaultMethods: Partial<MethodsOf<TextRuntime>> = {
  computeLocalBoundsRect: computeTextLocalBoundsRectangle,
};
