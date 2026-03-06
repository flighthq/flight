import { type PartialWithData, type Text, type TextData, TextKind } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createText(obj?: PartialWithData<Text>): Text {
  return createPrimitive<Text, TextData>(TextKind, obj, createTextData);
}

export function createTextData(data?: Partial<TextData>): TextData {
  return {
    autoSize: data?.autoSize ?? 'none',
    text: data?.text ?? '',
    textFormat: data?.textFormat ?? {},
  };
}
