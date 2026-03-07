import { DisplayObjectType, type PartialWithData, type Text, type TextData } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createText(obj?: PartialWithData<Text>): Text {
  return createPrimitive(DisplayObjectType.Text, obj, createTextData) as Text;
}

export function createTextData(data?: Partial<TextData>): TextData {
  return {
    autoSize: data?.autoSize ?? 'none',
    text: data?.text ?? '',
    textFormat: data?.textFormat ?? {},
  };
}
