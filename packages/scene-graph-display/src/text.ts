import type { PartialNode, Text, TextData } from '@flighthq/types';
import { TextKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createText(obj?: Readonly<PartialNode<Text>>): Text {
  return createDisplayObjectGeneric(TextKind, obj, createTextData) as Text;
}

export function createTextData(data?: Readonly<Partial<TextData>>): TextData {
  return {
    autoSize: data?.autoSize ?? 'none',
    text: data?.text ?? '',
    textFormat: data?.textFormat ?? {},
  };
}
