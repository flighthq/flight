import type { PartialNode, Text, TextData, TextRuntime } from '@flighthq/types';
import { TextKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function createText(obj?: Readonly<PartialNode<Text>>): Text {
  return createDisplayObjectGeneric(TextKind, obj, createTextData, createTextRuntime) as Text;
}

export function createTextData(data?: Readonly<Partial<TextData>>): TextData {
  return {
    autoSize: data?.autoSize ?? 'none',
    text: data?.text ?? '',
    textFormat: data?.textFormat ?? {},
  };
}

export function createTextRuntime(): TextRuntime {
  return createDisplayObjectRuntime() as TextRuntime;
}

export function getTextRuntime(source: Readonly<Text>): Readonly<TextRuntime> {
  return getDisplayObjectRuntime(source) as TextRuntime;
}
