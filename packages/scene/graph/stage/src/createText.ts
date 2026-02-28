import type { PartialWithData, Text, TextData } from '@flighthq/types';

import { createPrimitive } from './createPrimitive';

export function createText(obj?: PartialWithData<Text>): Text {
  return createPrimitive<Text, TextData>('text', obj, createTextData);
}

export function createTextData(data?: Partial<TextData>): TextData {
  return {
    autoSize: data?.autoSize ?? 'none',
    text: data?.text ?? '',
    textFormat: data?.textFormat ?? {},
  };
}
