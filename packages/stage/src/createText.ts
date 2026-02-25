import type { PartialWithData, Text, TextData } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createText(obj: PartialWithData<Text> = {}): Text {
  if (obj.data === undefined) obj.data = {} as TextData;
  if (obj.data.autoSize === undefined) obj.data.autoSize = 'none';
  if (obj.data.text === undefined) obj.data.text = '';
  if (obj.data.textFormat === undefined) obj.data.textFormat = {};
  if (obj.type === undefined) obj.type = 'text';
  return createDisplayObject(obj) as Text;
}
