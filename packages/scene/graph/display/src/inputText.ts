import { DisplayObjectType, type InputText, type InputTextData, type PartialWithData } from '@flighthq/types';

import { createPrimitive } from './primitive';
import { createRichTextData } from './richText';

export function createInputText(obj?: PartialWithData<InputText>): InputText {
  return createPrimitive(DisplayObjectType.InputText, obj, createInputTextData) as InputText;
}

export function createInputTextData(data?: Partial<InputTextData>): InputTextData {
  const _data = createRichTextData(data) as InputTextData;
  _data.displayAsPassword = data?.displayAsPassword ?? false;
  _data.restrict = data?.restrict ?? '';
  return _data;
}
